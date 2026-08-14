import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react'

import type { EditorHandle } from '@/components/Editor/Editor'
import { createEditorDocumentJSON } from '@/components/Editor/createEditorDocumentJSON'
import type { DraftSaveStatus } from '@/components/Toolbar/Toolbar'
import {
  clearEditorDocumentRecovery,
  deleteEditorDocument,
  describeDocumentStoreError,
  discardEditorDocumentRecovery,
  EDITOR_DOCUMENT_SCHEMA_VERSION,
  getActiveEditorDocument,
  listEditorDocuments,
  newEditorDocumentId,
  newEditorDocumentRecoveryId,
  putEditorDocument,
  readEditorDocumentRecovery,
  setActiveDocumentId,
  writeEditorDocumentRecovery,
  type EditorDocumentStyleV2,
  type EditorDocumentPublicationV1,
  type EditorDocumentV2,
} from '@/lib/documentStore'
import type { ImportAnalysis } from '@/lib/importDocument'
import { DEFAULT_THEME, type Theme } from '@/lib/themes'
import type { WriterLeaseState } from '@/lib/useWriterLease'

const AUTOSAVE_DELAY_MS = 900
// WAL（localStorage 恢复日志）短防抖：连续击键时不再每键同步
// stringify + 写盘。真正的关页兜底由 visibilitychange/pagehide 的
// 同步捕获负责，崩溃保护窗口最多只放宽这 200ms。
const WAL_DEBOUNCE_MS = 200
const EMPTY_DOCUMENT_JSON = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
}

export interface DraftIdentity {
  id: string
  title: string
  createdAt: number
}

function importedDraftTitle(analysis: ImportAnalysis): string {
  const sourceTitle = analysis.sourceName
    .replace(/\.(?:md|txt)$/i, '')
    .trim()
  const preferred =
    analysis.sourceName === '粘贴的文稿'
      ? analysis.cover.title
      : sourceTitle
  return (preferred || analysis.cover.title || '导入文稿').slice(0, 80)
}

function styleFromTheme(theme: Theme): EditorDocumentStyleV2 {
  return {
    themeClass: theme.themeClass,
    overlay: theme.overlay,
    h1Width: theme.h1Width,
    fontH1: theme.fontH1,
    fontH2: theme.fontH2,
    fontH3: theme.fontH3,
    fontBody: theme.fontBody,
    h1Bold: theme.h1Bold,
    h2Bold: theme.h2Bold,
    h3Bold: theme.h3Bold,
    fontSize: theme.fontSize,
    density: theme.density,
    logoStrategy: theme.logoStrategy,
    bgAssetId: theme.bgAssetId,
    coverBgAssetId: theme.coverBgAssetId,
    logoAssetId: theme.logoAssetId,
    coverTitleColor: theme.coverTitleColor,
    coverSubtitleColor: theme.coverSubtitleColor,
    coverLayout: theme.coverLayout,
    coverVertical: theme.coverVertical,
  }
}

export interface DraftPersistenceInput {
  editorRef: RefObject<EditorHandle | null>
  documentStyleRef: RefObject<EditorDocumentStyleV2>
  publicationRef: RefObject<EditorDocumentPublicationV1>
  /** 活动草稿身份 ref 由 App 持有（资源恢复域也要读它，且先于本 hook 调用） */
  activeDraftRef: RefObject<DraftIdentity | null>
  writerLeaseState: WriterLeaseState
  editorReady: boolean
  /** 自动保存触发信号：正文 HTML / 样式 / 发布文案任一变化都会重置计时器 */
  content: string
  documentStyle: EditorDocumentStyleV2
  publication: EditorDocumentPublicationV1
  /**
   * 文档水合真身在 App 侧（要写回全部样式 state）；经恒定身份包装注入，
   * bootstrap / 打开 / 删除 / 导入共用。
   */
  hydrateDocument: (document: EditorDocumentV2) => Promise<void>
  /** 资源恢复域句柄（useResourceRecovery 返回值），草稿身份切换时使旧异步请求失效 */
  resourceOperationRevisionRef: RefObject<number>
  setResourceRetrying: Dispatch<SetStateAction<boolean>>
  recordRecentAction: (label: string) => void
}

export interface DraftPersistenceHandle {
  draftReady: boolean
  draftSaveStatus: DraftSaveStatus
  draftStorageError: string | null
  setDraftStorageError: Dispatch<SetStateAction<string | null>>
  draftDocuments: EditorDocumentV2[]
  activeDraft: DraftIdentity | null
  documentRevisionRef: RefObject<number>
  pendingSnapshotRef: RefObject<EditorDocumentV2 | null>
  dirtyDocumentRef: RefObject<boolean>
  hydratingDocumentRef: RefObject<boolean>
  handleSaveAsDraft: (title: string) => Promise<boolean>
  handleOpenDraft: (document: EditorDocumentV2) => Promise<boolean>
  handleDeleteDraft: (document: EditorDocumentV2) => Promise<boolean>
  handleGenerateImportedDraft: (analysis: ImportAnalysis) => Promise<void>
}

/**
 * 草稿持久化域：IndexedDB 正式落盘（900ms 防抖 + 串行写队列）、WAL
 * （localStorage 恢复日志，200ms 短防抖 + recoveryId 守卫）、启动恢复四分支
 * 仲裁、visibilitychange/pagehide 最后机会捕获，以及另存 / 打开 / 删除 /
 * 导入生成草稿。
 *
 * （M7 拆分第四步：逻辑自 App.tsx 原样抽出，行为零变化。）
 */
export function useDraftPersistence(
  input: DraftPersistenceInput,
): DraftPersistenceHandle {
  const {
    editorRef,
    documentStyleRef,
    publicationRef,
    activeDraftRef,
    writerLeaseState,
    editorReady,
    content,
    documentStyle,
    publication,
    hydrateDocument,
    resourceOperationRevisionRef,
    setResourceRetrying,
    recordRecentAction,
  } = input

  // 草稿与主题分库：草稿保存可继续编辑的完整文档，主题仍只是可复用样式。
  const [draftReady, setDraftReady] = useState(false)
  const [activeDraft, setActiveDraft] = useState<DraftIdentity | null>(null)
  const [draftDocuments, setDraftDocuments] = useState<EditorDocumentV2[]>([])
  const [draftSaveStatus, setDraftSaveStatus] =
    useState<DraftSaveStatus>('restoring')
  const [draftStorageError, setDraftStorageError] = useState<string | null>(null)
  // state 是渲染值：await 之后同一闭包里读到的仍是旧文案（CODE-REVIEW R8）；
  // 失败即时报错的路径必须读这个 ref。
  const lastStorageErrorRef = useRef<string | null>(null)
  const autosaveTimerRef = useRef<number | null>(null)
  const walTimerRef = useRef<number | null>(null)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const editRevisionRef = useRef(0)
  const documentRevisionRef = useRef(0)
  const pendingSnapshotRef = useRef<EditorDocumentV2 | null>(null)
  const dirtyDocumentRef = useRef(false)
  const bootstrapStartedRef = useRef(false)
  const hydratingDocumentRef = useRef(false)

  const selectActiveDraft = useCallback((identity: DraftIdentity) => {
    // 草稿身份是资源操作的提交边界。另存为可能发生在异步重试返回前；
    // 此处统一使旧请求失效并复位按钮，避免 stale guard 只丢结果却遗留 loading UI。
    resourceOperationRevisionRef.current += 1
    setResourceRetrying(false)
    activeDraftRef.current = identity
    setActiveDraft(identity)
    // 入参句柄（activeDraftRef / 资源域 ref 与 setter）均为恒定身份；deps 原样保留。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const captureDocument = useCallback(
    (
      identity: DraftIdentity,
      contentJSON = editorRef.current?.getJSON(),
      style?: EditorDocumentStyleV2,
    ): EditorDocumentV2 | null => {
      if (!contentJSON) return null
      return {
        schemaVersion: EDITOR_DOCUMENT_SCHEMA_VERSION,
        ...identity,
        recoveryId: newEditorDocumentRecoveryId(),
        revision: ++documentRevisionRef.current,
        updatedAt: Date.now(),
        contentJSON,
        style: style ?? documentStyleRef.current,
        publication: publicationRef.current,
      }
    },
    // 入参句柄（editorRef / documentStyleRef / publicationRef）均为恒定身份 ref；deps 原样保留。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const persistDocument = useCallback(
    async (document: EditorDocumentV2, revision: number): Promise<boolean> => {
      if (
        activeDraftRef.current?.id === document.id &&
        revision === editRevisionRef.current
      ) {
        setDraftSaveStatus('saving')
      }

      // IndexedDB writes are serialized so a slower old snapshot can never
      // finish after and overwrite a newer edit.
      const operation = saveQueueRef.current
        .catch(() => undefined)
        .then(() => putEditorDocument(document))
      saveQueueRef.current = operation.catch(() => undefined)

      try {
        await operation
        clearEditorDocumentRecovery(document.id, document.recoveryId)
        if (pendingSnapshotRef.current?.recoveryId === document.recoveryId) {
          pendingSnapshotRef.current = null
        }
        setDraftDocuments((previous) =>
          [document, ...previous.filter((item) => item.id !== document.id)].sort(
            (a, b) => b.updatedAt - a.updatedAt,
          ),
        )
        if (
          activeDraftRef.current?.id === document.id &&
          revision === editRevisionRef.current
        ) {
          setDraftStorageError(null)
          setDraftSaveStatus('saved')
        }
        return true
      } catch (error) {
        lastStorageErrorRef.current = describeDocumentStoreError(error)
        if (revision === editRevisionRef.current) {
          setDraftStorageError(lastStorageErrorRef.current)
          setDraftSaveStatus('error')
        }
        return false
      }
    },
    // 入参句柄（activeDraftRef）为恒定身份 ref；deps 原样保留。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  // 等 Tiptap 真正就绪后再读取 IndexedDB。在恢复完成前 draftReady=false，
  // 避免编辑器默认教程被自动保存后覆盖用户上次草稿。
  useEffect(() => {
    if (
      !editorReady ||
      writerLeaseState !== 'owned' ||
      bootstrapStartedRef.current
    ) {
      return
    }
    bootstrapStartedRef.current = true

    void (async () => {
      try {
        const [activeDocument, documents] = await Promise.all([
          getActiveEditorDocument(),
          listEditorDocuments(),
        ])
        const persistedDocument = activeDocument ?? documents[0] ?? null
        const recovery = readEditorDocumentRecovery()
        const matchingPersisted = recovery
          ? documents.find((item) => item.id === recovery.id) ??
            (activeDocument?.id === recovery.id ? activeDocument : null)
          : null
        let shouldRecover = false
        let conflictDocument: EditorDocumentV2 | null = null
        if (recovery && !matchingPersisted) {
          shouldRecover = true
        } else if (recovery && matchingPersisted) {
          if (recovery.recoveryId === matchingPersisted.recoveryId) {
            clearEditorDocumentRecovery(recovery.id, recovery.recoveryId)
          } else if (recovery.revision > matchingPersisted.revision) {
            shouldRecover = true
          } else if (recovery.revision === matchingPersisted.revision) {
            // 同 revision 不同 recoveryId 只能来自另一标签页/异常写入。
            // 不覆盖正式草稿，另存冲突副本，保证两边内容都不丢。
            const now = Date.now()
            conflictDocument = {
              ...recovery,
              id: newEditorDocumentId(),
              recoveryId: newEditorDocumentRecoveryId(),
              revision: 0,
              title: `${recovery.title}（冲突恢复）`,
              createdAt: now,
              updatedAt: now,
            }
            await putEditorDocument(conflictDocument, false)
            discardEditorDocumentRecovery(recovery.id)
            setDraftStorageError(
              '检测到另一页面的同版编辑，已另存为“冲突恢复”草稿，未覆盖当前内容。',
            )
          } else {
            // WAL revision 更旧，说明它是已经被更新 IDB 取代的残留。
            discardEditorDocumentRecovery(recovery.id)
          }
        }
        const document = shouldRecover ? recovery : persistedDocument
        setDraftDocuments(
          document
            ? [
                ...(conflictDocument ? [conflictDocument] : []),
                document,
                ...documents.filter((item) => item.id !== document.id),
              ].sort(
                (a, b) => b.updatedAt - a.updatedAt,
              )
            : [...(conflictDocument ? [conflictDocument] : []), ...documents],
        )

        if (document) {
          hydratingDocumentRef.current = true
          await hydrateDocument(document)
          if (shouldRecover) {
            await putEditorDocument(document)
            clearEditorDocumentRecovery(document.id, document.recoveryId)
          } else if (!activeDocument) {
            await setActiveDocumentId(document.id)
          }
          selectActiveDraft({
            id: document.id,
            title: document.title,
            createdAt: document.createdAt,
          })
          hydratingDocumentRef.current = false
          documentRevisionRef.current = document.revision
          setDraftSaveStatus('saved')
        } else {
          const now = Date.now()
          selectActiveDraft({
            id: newEditorDocumentId(),
            title: '未命名草稿',
            createdAt: now,
          })
          documentRevisionRef.current = 0
          setDraftSaveStatus('pending')
        }
      } catch (error) {
        const now = Date.now()
        selectActiveDraft({
          id: newEditorDocumentId(),
          title: '未命名草稿',
          createdAt: now,
        })
        hydratingDocumentRef.current = false
        setDraftStorageError(describeDocumentStoreError(error))
        setDraftSaveStatus('error')
      } finally {
        setDraftReady(true)
      }
    })()
  }, [editorReady, hydrateDocument, selectActiveDraft, writerLeaseState])

  // 正文或任一样式字段变化后重置 900ms 计时器。
  useEffect(() => {
    const identity = activeDraftRef.current
    if (
      !draftReady ||
      writerLeaseState !== 'owned' ||
      !identity ||
      hydratingDocumentRef.current
    ) {
      return
    }

    // R5：hydrate 后无任何用户编辑（dirty=false）且无待写快照时不再落盘，
    // 否则「只看一眼」的草稿也会刷新 updatedAt、跳到最近首位并膨胀 revision。
    // 新建空草稿例外：bootstrap 把 documentRevisionRef 置 0，仍走首次落盘。
    if (
      !dirtyDocumentRef.current &&
      pendingSnapshotRef.current === null &&
      documentRevisionRef.current > 0
    ) {
      return
    }

    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current)
    }
    const revision = ++editRevisionRef.current
    setDraftSaveStatus('pending')
    const snapshot = captureDocument(identity)
    if (snapshot) {
      pendingSnapshotRef.current = snapshot
      dirtyDocumentRef.current = false
      // WAL 写入走 200ms 短防抖：连续击键只在停顿后 stringify + 落
      // localStorage 一次。切后台/关页仍由 visibilitychange/pagehide
      // 的同步捕获兜底（见下一个 effect），保护窗口不实质变差。
      if (walTimerRef.current !== null) {
        window.clearTimeout(walTimerRef.current)
      }
      walTimerRef.current = window.setTimeout(() => {
        walTimerRef.current = null
        // 更新的快照或已完成的正式落盘会先改写 pendingSnapshotRef；
        // 只保护仍然待写的那一份，避免复活已被清除的 WAL。
        if (pendingSnapshotRef.current?.recoveryId !== snapshot.recoveryId) {
          return
        }
        if (!writeEditorDocumentRecovery(snapshot)) {
          setDraftStorageError(
            '草稿内容过大或浏览器限制了临时保护；请等待“已保存”后再关闭页面。',
          )
        }
      }, WAL_DEBOUNCE_MS)
    }
    autosaveTimerRef.current = window.setTimeout(() => {
      autosaveTimerRef.current = null
      if (snapshot) void persistDocument(snapshot, revision)
    }, AUTOSAVE_DELAY_MS)

    return () => {
      if (autosaveTimerRef.current !== null) {
        window.clearTimeout(autosaveTimerRef.current)
        autosaveTimerRef.current = null
      }
    }
    // 入参句柄（activeDraftRef）为恒定身份 ref；deps 原样保留。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeDraft?.id,
    activeDraft?.title,
    captureDocument,
    content,
    documentStyle,
    draftReady,
    persistDocument,
    publication,
    writerLeaseState,
  ])

  // 用户刚输入就切到后台/关闭页面时，900ms 防抖可能尚未到点。
  // visibilitychange 可以提前发起 best-effort IDB 写入，又不会像 beforeunload 那样阻塞离开。
  useEffect(() => {
    function captureLastChanceSnapshot(): EditorDocumentV2 | null {
      if (!draftReady || writerLeaseState !== 'owned') return null
      if (pendingSnapshotRef.current && !dirtyDocumentRef.current) {
        writeEditorDocumentRecovery(pendingSnapshotRef.current)
        return pendingSnapshotRef.current
      }
      if (!dirtyDocumentRef.current) return null
      const identity = activeDraftRef.current
      if (!identity) return null
      const snapshot = captureDocument(identity)
      if (snapshot) {
        pendingSnapshotRef.current = snapshot
        dirtyDocumentRef.current = false
        writeEditorDocumentRecovery(snapshot)
      }
      return snapshot
    }

    function handleVisibilityChange() {
      if (document.visibilityState !== 'hidden') return
      const snapshot = captureLastChanceSnapshot()
      if (!snapshot || autosaveTimerRef.current === null) return
      clearAutosaveTimer()
      const revision = ++editRevisionRef.current
      void persistDocument(snapshot, revision)
    }

    function handlePageHide() {
      // pagehide 生命周期内只做同步日志；浏览器可能取消任何异步 IDB 请求。
      captureLastChanceSnapshot()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', handlePageHide)
    return () => {
      // Cleanup only removes the listener; it intentionally does not flush,
      // so dependency changes cannot produce duplicate snapshots.
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', handlePageHide)
    }
    // 入参句柄（activeDraftRef）为恒定身份 ref；deps 原样保留。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captureDocument, draftReady, persistDocument, writerLeaseState])

  function clearAutosaveTimer() {
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }
    // 调用方都会紧接着同步写一份新 WAL 或切换文档；防抖中的旧 WAL
    // 计时器此时已经失去意义（其 recoveryId 守卫也会拦下陈旧写入）。
    if (walTimerRef.current !== null) {
      window.clearTimeout(walTimerRef.current)
      walTimerRef.current = null
    }
  }

  async function flushActiveDraft(): Promise<boolean> {
    const identity = activeDraftRef.current
    if (!identity) return true
    clearAutosaveTimer()
    const revision = ++editRevisionRef.current
    const document = captureDocument(identity)
    if (!document) {
      lastStorageErrorRef.current = '编辑器尚未就绪，无法保存当前草稿'
      setDraftStorageError(lastStorageErrorRef.current)
      setDraftSaveStatus('error')
      return false
    }
    pendingSnapshotRef.current = document
    dirtyDocumentRef.current = false
    writeEditorDocumentRecovery(document)
    return persistDocument(document, revision)
  }

  async function handleGenerateImportedDraft(
    analysis: ImportAnalysis,
  ): Promise<void> {
    if (!draftReady || writerLeaseState !== 'owned') {
      throw new Error('草稿仍在恢复，请稍候再生成。')
    }
    if (!analysis.decisionResolved) {
      throw new Error('请先确认文稿中 --- 的全局处理方式。')
    }

    const previousDraftId = activeDraftRef.current?.id ?? null
    const contentJSON = createEditorDocumentJSON(analysis.contentHtml)
    if (!(await flushActiveDraft())) {
      throw new Error(
        lastStorageErrorRef.current || '当前草稿保存失败，已取消导入。',
      )
    }

    clearAutosaveTimer()
    editRevisionRef.current += 1
    pendingSnapshotRef.current = null
    dirtyDocumentRef.current = false
    hydratingDocumentRef.current = true
    setDraftSaveStatus('saving')
    setDraftStorageError(null)

    const now = Date.now()
    const identity: DraftIdentity = {
      id: newEditorDocumentId(),
      title: importedDraftTitle(analysis),
      createdAt: now,
    }
    const importedDocument: EditorDocumentV2 = {
      schemaVersion: EDITOR_DOCUMENT_SCHEMA_VERSION,
      ...identity,
      recoveryId: newEditorDocumentRecoveryId(),
      revision: 0,
      updatedAt: now,
      contentJSON,
      style: documentStyleRef.current,
      publication: {
        releaseCopy: analysis.releaseCopy,
        sourceName: analysis.sourceName,
        importedAt: now,
      },
    }

    try {
      // 新草稿先原子落盘再切换编辑器；任何失败都不会改写旧草稿。
      await putEditorDocument(importedDocument)
      await hydrateDocument(importedDocument)
      documentRevisionRef.current = 0
      selectActiveDraft(identity)
      setDraftDocuments((previous) =>
        [
          importedDocument,
          ...previous.filter((item) => item.id !== importedDocument.id),
        ].sort((left, right) => right.updatedAt - left.updatedAt),
      )
      setDraftSaveStatus('saved')
      recordRecentAction(`已导入 ${analysis.pageCount} 页到新草稿`)
    } catch (error) {
      if (previousDraftId) {
        await setActiveDocumentId(previousDraftId).catch(() => undefined)
      }
      setDraftStorageError(describeDocumentStoreError(error))
      setDraftSaveStatus('error')
      throw error
    } finally {
      hydratingDocumentRef.current = false
    }
  }

  async function handleSaveAsDraft(title: string): Promise<boolean> {
    if (!draftReady) return false
    clearAutosaveTimer()
    const now = Date.now()
    const identity: DraftIdentity = {
      id: newEditorDocumentId(),
      title,
      createdAt: now,
    }
    const revision = ++editRevisionRef.current
    const document = captureDocument(identity)
    if (!document) {
      setDraftStorageError('编辑器尚未就绪，无法另存草稿')
      setDraftSaveStatus('error')
      return false
    }
    pendingSnapshotRef.current = document
    dirtyDocumentRef.current = false
    writeEditorDocumentRecovery(document)

    setDraftSaveStatus('saving')
    const saved = await persistDocument(document, revision)
    if (saved) {
      selectActiveDraft(identity)
      setDraftStorageError(null)
      setDraftSaveStatus('saved')
    }
    return saved
  }

  async function handleOpenDraft(
    document: EditorDocumentV2,
  ): Promise<boolean> {
    if (document.id === activeDraftRef.current?.id) return true
    if (!(await flushActiveDraft())) return false

    clearAutosaveTimer()
    editRevisionRef.current += 1
    hydratingDocumentRef.current = true
    setDraftReady(false)
    setDraftSaveStatus('restoring')
    setDraftStorageError(null)
    try {
      await setActiveDocumentId(document.id)
      await hydrateDocument(document)
      selectActiveDraft({
        id: document.id,
        title: document.title,
        createdAt: document.createdAt,
      })
      setDraftSaveStatus('saved')
      return true
    } catch (error) {
      setDraftStorageError(describeDocumentStoreError(error))
      setDraftSaveStatus('error')
      return false
    } finally {
      hydratingDocumentRef.current = false
      setDraftReady(true)
    }
  }

  async function handleDeleteDraft(
    document: EditorDocumentV2,
  ): Promise<boolean> {
    const deletingActive = document.id === activeDraftRef.current?.id
    if (!deletingActive) {
      try {
        discardEditorDocumentRecovery(document.id)
        await deleteEditorDocument(document.id)
        setDraftDocuments((previous) =>
          previous.filter((item) => item.id !== document.id),
        )
        return true
      } catch (error) {
        setDraftStorageError(describeDocumentStoreError(error))
        setDraftSaveStatus('error')
        return false
      }
    }

    clearAutosaveTimer()
    editRevisionRef.current += 1
    hydratingDocumentRef.current = true
    setDraftReady(false)
    setDraftSaveStatus('restoring')
    setDraftStorageError(null)
    try {
      // A write already dispatched to IndexedDB cannot be cancelled. Let it
      // finish before deleting, otherwise it could recreate the just-deleted
      // active draft after this handler returns.
      discardEditorDocumentRecovery(document.id)
      pendingSnapshotRef.current = null
      dirtyDocumentRef.current = false
      await saveQueueRef.current.catch(() => undefined)
      await deleteEditorDocument(document.id)
      const remaining = await listEditorDocuments()
      let nextDocument = remaining[0] ?? null

      if (!nextDocument) {
        const now = Date.now()
        nextDocument = {
          schemaVersion: EDITOR_DOCUMENT_SCHEMA_VERSION,
          id: newEditorDocumentId(),
          recoveryId: newEditorDocumentRecoveryId(),
          revision: 0,
          title: '未命名草稿',
          createdAt: now,
          updatedAt: now,
          contentJSON: EMPTY_DOCUMENT_JSON,
          style: styleFromTheme(DEFAULT_THEME),
        }
        await putEditorDocument(nextDocument)
      } else {
        await setActiveDocumentId(nextDocument.id)
      }

      await hydrateDocument(nextDocument)
      selectActiveDraft({
        id: nextDocument.id,
        title: nextDocument.title,
        createdAt: nextDocument.createdAt,
      })
      setDraftDocuments(
        [nextDocument, ...remaining.filter((item) => item.id !== nextDocument.id)].sort(
          (a, b) => b.updatedAt - a.updatedAt,
        ),
      )
      setDraftSaveStatus('saved')
      return true
    } catch (error) {
      setDraftStorageError(describeDocumentStoreError(error))
      setDraftSaveStatus('error')
      return false
    } finally {
      hydratingDocumentRef.current = false
      setDraftReady(true)
    }
  }

  return {
    draftReady,
    draftSaveStatus,
    draftStorageError,
    setDraftStorageError,
    draftDocuments,
    activeDraft,
    documentRevisionRef,
    pendingSnapshotRef,
    dirtyDocumentRef,
    hydratingDocumentRef,
    handleSaveAsDraft,
    handleOpenDraft,
    handleDeleteDraft,
    handleGenerateImportedDraft,
  }
}
