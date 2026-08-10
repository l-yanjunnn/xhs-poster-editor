import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EditorPane, type EditorHandle, type ImageState } from '@/components/Editor/Editor'
import { Preview } from '@/components/Preview/Preview'
import {
  Toolbar,
  type DraftSaveStatus,
} from '@/components/Toolbar/Toolbar'
import { AssetLibrary } from '@/components/AssetLibrary/AssetLibrary'
import { FontLibrary } from '@/components/FontLibrary/FontLibrary'
import { ThemeLibrary } from '@/components/ThemeLibrary/ThemeLibrary'
import { ExportDialog } from '@/components/ExportDialog/ExportDialog'
import { DraftLibrary } from '@/components/DraftLibrary/DraftLibrary'
import {
  BUILTIN_THEMES,
  DEFAULT_THEME,
  OVERLAY_MAP,
  type DensityLevel,
  type H1Width,
  type LogoStrategy,
  type OverlayKey,
  type Theme,
  type ThemeKey,
} from '@/lib/themes'
import {
  listUserThemes,
  newUserThemeId,
  putUserTheme,
} from '@/lib/themeStore'
import { DENSITY_MAP } from '@/lib/density'
import { computeFontSizeVars } from '@/lib/fontSize'
import {
  BUILTIN_BACKGROUNDS,
  BUILTIN_LOGOS,
  findAssetById,
  type Asset,
} from '@/lib/builtinAssets'
import { loadAllUserFonts } from '@/lib/fontRegistry'
import { listUserFonts } from '@/lib/fontStore'
import { resolveAssetSrc, resolveContentImages } from '@/lib/resolveAsset'
import { splitIntoPages } from '@/lib/splitPages'
import { exportPages, suggestFilename } from '@/lib/exportPng'
import {
  CANVAS_CONTENT_WIDTH,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  EXPORT_HEIGHT,
  EXPORT_WIDTH,
} from '@/lib/canvas'
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
  type EditorDocumentStyleV1,
  type EditorDocumentV1,
} from '@/lib/documentStore'
import './styles/canvas.css'

const AUTOSAVE_DELAY_MS = 900
const WRITER_LOCK_NAME = 'xhs-poster-editor-single-writer-v1'
const WRITER_LOCK_RETRY_MS = 1_000
const EMPTY_DOCUMENT_JSON = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
}

interface DraftIdentity {
  id: string
  title: string
  createdAt: number
}

type WriterLeaseState = 'checking' | 'owned' | 'conflict' | 'unsupported'

function styleFromTheme(theme: Theme): EditorDocumentStyleV1 {
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
    logoAssetId: theme.logoAssetId,
  }
}

function App() {
  // 主题对应的色彩 CSS class（作用在 .page div 上）
  const [themeClass, setThemeClass] = useState<ThemeKey>(DEFAULT_THEME.themeClass)

  // 主题字段展开为独立 state，便于用户在主题基础上微调
  const [fontH1, setFontH1] = useState(DEFAULT_THEME.fontH1)
  const [fontH2, setFontH2] = useState(DEFAULT_THEME.fontH2)
  const [fontH3, setFontH3] = useState(DEFAULT_THEME.fontH3)
  const [fontBody, setFontBody] = useState(DEFAULT_THEME.fontBody)
  const [h1Bold, setH1Bold] = useState(DEFAULT_THEME.h1Bold)
  const [h2Bold, setH2Bold] = useState(DEFAULT_THEME.h2Bold)
  const [h3Bold, setH3Bold] = useState(DEFAULT_THEME.h3Bold)
  const [fontSize, setFontSize] = useState(DEFAULT_THEME.fontSize)
  const [density, setDensity] = useState<DensityLevel>(DEFAULT_THEME.density)
  const [h1Width, setH1Width] = useState<H1Width>(DEFAULT_THEME.h1Width)
  const [overlay, setOverlay] = useState<OverlayKey>(DEFAULT_THEME.overlay)
  const [logoStrategy, setLogoStrategy] = useState<LogoStrategy>(
    DEFAULT_THEME.logoStrategy,
  )

  // 资源同时持有 id（用于主题序列化）和 src（用于渲染）
  const [bgAssetId, setBgAssetId] = useState(DEFAULT_THEME.bgAssetId)
  const [logoAssetId, setLogoAssetId] = useState(DEFAULT_THEME.logoAssetId)
  const [bgSrc, setBgSrc] = useState(
    findAssetById(BUILTIN_BACKGROUNDS, DEFAULT_THEME.bgAssetId)?.src ?? '',
  )
  const [logoSrc, setLogoSrc] = useState(
    findAssetById(BUILTIN_LOGOS, DEFAULT_THEME.logoAssetId)?.src ?? '',
  )

  const [content, setContent] = useState('')
  const editorRef = useRef<EditorHandle>(null)

  // 草稿与主题分库：草稿保存可继续编辑的完整文档，主题仍只是可复用样式。
  const [editorReady, setEditorReady] = useState(false)
  const [draftReady, setDraftReady] = useState(false)
  const [activeDraft, setActiveDraft] = useState<DraftIdentity | null>(null)
  const activeDraftRef = useRef<DraftIdentity | null>(null)
  const [draftDocuments, setDraftDocuments] = useState<EditorDocumentV1[]>([])
  const [draftSaveStatus, setDraftSaveStatus] =
    useState<DraftSaveStatus>('restoring')
  const [draftStorageError, setDraftStorageError] = useState<string | null>(null)
  const [writerLeaseState, setWriterLeaseState] =
    useState<WriterLeaseState>('checking')
  const autosaveTimerRef = useRef<number | null>(null)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const editRevisionRef = useRef(0)
  const documentRevisionRef = useRef(0)
  const pendingSnapshotRef = useRef<EditorDocumentV1 | null>(null)
  const dirtyDocumentRef = useRef(false)
  const bootstrapStartedRef = useRef(false)
  const hydratingDocumentRef = useRef(false)

  // 当前已应用的主题 id；null = 用户微调过、已脱离任何主题
  const [currentThemeId, setCurrentThemeId] = useState<string | null>(
    DEFAULT_THEME.id,
  )

  const [assetLibOpen, setAssetLibOpen] = useState(false)
  // 素材库打开时切到哪个 tab；编辑器「插入图片」按钮设为 'image'，主题/Logo 按钮 undefined 保持默认
  const [assetLibInitialKind, setAssetLibInitialKind] = useState<
    'background' | 'logo' | 'image' | undefined
  >(undefined)
  const [fontLibOpen, setFontLibOpen] = useState(false)
  const [themeLibOpen, setThemeLibOpen] = useState(false)
  const [draftLibOpen, setDraftLibOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  // 收集多页 .page DOM 节点供导出截图使用
  const pageRefs = useRef<(HTMLDivElement | null)[]>([])
  const [userFontFamilies, setUserFontFamilies] = useState<string[]>([])
  // 用户保存的主题列表，由 App 集中维护，同时供 Toolbar 下拉和 ThemeLibrary 卡片使用
  const [userThemes, setUserThemes] = useState<Theme[]>([])
  // 当前光标下图片节点的状态，Toolbar「图片宽度」下拉据此显示当前值/启用
  const [imageState, setImageState] = useState<ImageState>({ active: false, width: null })
  // 参考线开关：仅影响预览，导出 PNG 时由 onclone 钩子移除 class（见 exportPng.ts）
  const [guidesOn, setGuidesOn] = useState(false)

  const documentStyle = useMemo<EditorDocumentStyleV1>(
    () => ({
      themeClass,
      overlay,
      h1Width,
      fontH1,
      fontH2,
      fontH3,
      fontBody,
      h1Bold,
      h2Bold,
      h3Bold,
      fontSize,
      density,
      logoStrategy,
      bgAssetId,
      logoAssetId,
    }),
    [
      themeClass,
      overlay,
      h1Width,
      fontH1,
      fontH2,
      fontH3,
      fontBody,
      h1Bold,
      h2Bold,
      h3Bold,
      fontSize,
      density,
      logoStrategy,
      bgAssetId,
      logoAssetId,
    ],
  )
  const documentStyleRef = useRef(documentStyle)
  documentStyleRef.current = documentStyle
  const noWrapH1Layout = useMemo(
    () => ({
      fontFamily: fontH1,
      fontSizePx: Math.round((fontSize * 90) / 40),
      fontWeight: h1Bold ? 700 : 400,
      maxWidthPx:
        CANVAS_CONTENT_WIDTH * (Number.parseFloat(h1Width) / 100),
    }),
    [fontH1, fontSize, h1Bold, h1Width],
  )

  const selectActiveDraft = useCallback((identity: DraftIdentity) => {
    activeDraftRef.current = identity
    setActiveDraft(identity)
  }, [])

  const captureDocument = useCallback(
    (
      identity: DraftIdentity,
      contentJSON = editorRef.current?.getJSON(),
      style?: EditorDocumentStyleV1,
    ): EditorDocumentV1 | null => {
      if (!contentJSON) return null
      return {
        schemaVersion: EDITOR_DOCUMENT_SCHEMA_VERSION,
        ...identity,
        recoveryId: newEditorDocumentRecoveryId(),
        revision: ++documentRevisionRef.current,
        updatedAt: Date.now(),
        contentJSON,
        style: style ?? documentStyleRef.current,
      }
    },
    [],
  )

  const persistDocument = useCallback(
    async (document: EditorDocumentV1, revision: number): Promise<boolean> => {
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
        if (revision === editRevisionRef.current) {
          setDraftStorageError(describeDocumentStoreError(error))
          setDraftSaveStatus('error')
        }
        return false
      }
    },
    [],
  )

  const hydrateDocument = useCallback(async (document: EditorDocumentV1) => {
    documentRevisionRef.current = document.revision
    pendingSnapshotRef.current = null
    dirtyDocumentRef.current = false
    const [backgroundResult, logoResult, contentResult] = await Promise.allSettled([
      resolveAssetSrc(document.style.bgAssetId, 'background'),
      resolveAssetSrc(document.style.logoAssetId, 'logo'),
      resolveContentImages(document.contentJSON),
    ])

    setThemeClass(document.style.themeClass)
    setFontH1(document.style.fontH1)
    setFontH2(document.style.fontH2)
    setFontH3(document.style.fontH3)
    setFontBody(document.style.fontBody)
    setH1Bold(document.style.h1Bold)
    setH2Bold(document.style.h2Bold)
    setH3Bold(document.style.h3Bold)
    setFontSize(document.style.fontSize)
    setDensity(document.style.density)
    setH1Width(document.style.h1Width)
    setOverlay(document.style.overlay)
    setLogoStrategy(document.style.logoStrategy)
    setBgAssetId(document.style.bgAssetId)
    setLogoAssetId(document.style.logoAssetId)
    setBgSrc(backgroundResult.status === 'fulfilled' ? backgroundResult.value : '')
    setLogoSrc(logoResult.status === 'fulfilled' ? logoResult.value : '')
    setCurrentThemeId(null)
    editorRef.current?.setContent(
      contentResult.status === 'fulfilled'
        ? contentResult.value
        : document.contentJSON,
    )

    const failedResolution = [backgroundResult, logoResult, contentResult].find(
      (result) => result.status === 'rejected',
    )
    if (failedResolution?.status === 'rejected') {
      setDraftStorageError(
        `草稿已恢复，但部分本地素材未能载入：${describeDocumentStoreError(
          failedResolution.reason,
        )}`,
      )
    }
  }, [])

  const handleEditorUpdate = useCallback((html: string) => {
    setContent(html)
    setEditorReady(true)
    if (
      draftReady &&
      writerLeaseState === 'owned' &&
      !hydratingDocumentRef.current
    ) {
      dirtyDocumentRef.current = true
    }
  }, [draftReady, writerLeaseState])

  // 同一浏览器来源只允许一个可写标签页。Web Locks 由浏览器原子仲裁，
  // 页面关闭/崩溃时会自动释放，不存在 localStorage read→set 的双赢窗口。
  useEffect(() => {
    let disposed = false
    let retryTimer: number | null = null
    let releaseCurrentLock: (() => void) | null = null

    function transition(next: WriterLeaseState) {
      setWriterLeaseState(next)
    }

    function scheduleRetry() {
      if (disposed || retryTimer !== null) return
      retryTimer = window.setTimeout(() => {
        retryTimer = null
        requestWriterLock()
      }, WRITER_LOCK_RETRY_MS)
    }

    function requestWriterLock() {
      if (disposed) return
      if (!('locks' in navigator)) {
        console.error('当前浏览器不支持 Web Locks，已禁止写入以保护草稿')
        transition('unsupported')
        return
      }

      void navigator.locks
        .request(
          WRITER_LOCK_NAME,
          { mode: 'exclusive', ifAvailable: true },
          async (lock) => {
            if (disposed) return
            if (!lock) {
              transition('conflict')
              scheduleRetry()
              return
            }

            // 冲突页此前从未 bootstrap；拿到锁后才读取最新 IDB，
            // 不需要带着可能陈旧的内存内容继续编辑。
            transition('owned')
            await new Promise<void>((resolve) => {
              releaseCurrentLock = resolve
            })
            releaseCurrentLock = null
          },
        )
        .catch((error) => {
          if (disposed) return
          console.error('无法建立浏览器原子写锁，已禁止写入以保护草稿', error)
          transition('unsupported')
        })
    }

    function releaseLock() {
      releaseCurrentLock?.()
      releaseCurrentLock = null
    }

    requestWriterLock()
    window.addEventListener('pagehide', releaseLock)
    return () => {
      disposed = true
      if (retryTimer !== null) window.clearTimeout(retryTimer)
      window.removeEventListener('pagehide', releaseLock)
      releaseLock()
    }
  }, [])

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
        let conflictDocument: EditorDocumentV1 | null = null
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

    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current)
    }
    const revision = ++editRevisionRef.current
    setDraftSaveStatus('pending')
    const snapshot = captureDocument(identity)
    if (snapshot) {
      pendingSnapshotRef.current = snapshot
      dirtyDocumentRef.current = false
      if (!writeEditorDocumentRecovery(snapshot)) {
        setDraftStorageError(
          '草稿内容过大或浏览器限制了临时保护；请等待“已保存”后再关闭页面。',
        )
      }
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
  }, [
    activeDraft?.id,
    activeDraft?.title,
    captureDocument,
    content,
    documentStyle,
    draftReady,
    persistDocument,
    writerLeaseState,
  ])

  // 用户刚输入就切到后台/关闭页面时，900ms 防抖可能尚未到点。
  // visibilitychange 可以提前发起 best-effort IDB 写入，又不会像 beforeunload 那样阻塞离开。
  useEffect(() => {
    function captureLastChanceSnapshot(): EditorDocumentV1 | null {
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
  }, [captureDocument, draftReady, persistDocument, writerLeaseState])

  useEffect(() => {
    loadAllUserFonts().then(setUserFontFamilies)
    listUserThemes().then(setUserThemes)
    // dev-only E2E 钩子（prod build 被 tree-shake），同 Editor 的 window.__editor
    if (import.meta.env.DEV) {
      import('@/lib/exportPng').then((m) => {
        import('@/lib/fontRegistry').then((f) => {
          ;(window as unknown as Record<string, unknown>).__test = {
            pageToPngCanvas: m.pageToPngCanvas,
            registerFontFromBlob: f.registerFontFromBlob,
            getUserFontFaceCss: f.getUserFontFaceCss,
          }
        })
      })
    }
  }, [])

  const reloadUserFonts = useCallback(async () => {
    const fonts = await listUserFonts()
    setUserFontFamilies(fonts.map((f) => f.family))
  }, [])

  const reloadUserThemes = useCallback(async () => {
    setUserThemes(await listUserThemes())
  }, [])

  // 应用主题：把 Theme 所有字段写回 App state；含正文则替换 editor
  async function applyTheme(theme: Theme) {
    dirtyDocumentRef.current = true
    setThemeClass(theme.themeClass)
    setFontH1(theme.fontH1)
    setFontH2(theme.fontH2)
    setFontH3(theme.fontH3)
    setFontBody(theme.fontBody)
    setH1Bold(theme.h1Bold)
    setH2Bold(theme.h2Bold)
    setH3Bold(theme.h3Bold)
    setFontSize(theme.fontSize)
    setDensity(theme.density)
    setH1Width(theme.h1Width)
    setOverlay(theme.overlay)
    setLogoStrategy(theme.logoStrategy)
    setBgAssetId(theme.bgAssetId)
    setLogoAssetId(theme.logoAssetId)
    setBgSrc(await resolveAssetSrc(theme.bgAssetId, 'background'))
    setLogoSrc(await resolveAssetSrc(theme.logoAssetId, 'logo'))
    setCurrentThemeId(theme.id)
    if (theme.contentJSON) {
      // 正文插图按 assetId 重新 resolve src（存储里的 blob URL 已跨会话失效）
      editorRef.current?.setContent(
        await resolveContentImages(theme.contentJSON),
      )
    }
  }

  // 把当前 App state 打包成新主题保存
  async function saveCurrentAsTheme(name: string) {
    const theme: Theme = {
      id: newUserThemeId(),
      name,
      isBuiltin: false,
      createdAt: Date.now(),
      themeClass,
      overlay,
      h1Width,
      fontH1,
      fontH2,
      fontH3,
      fontBody,
      h1Bold,
      h2Bold,
      h3Bold,
      fontSize,
      density,
      logoStrategy,
      bgAssetId,
      logoAssetId,
      // v1.3 起主题只保存样式；可恢复的正文由草稿库负责。
      // 历史上已存在的“含正文主题”仍会被 applyTheme 正常打开。
      contentJSON: null,
    }
    await putUserTheme(theme)
    setCurrentThemeId(theme.id)
  }

  // 用户从 Toolbar 改动任何样式 → 脱离当前主题
  function customize<T>(setter: (v: T) => void): (v: T) => void {
    return (v) => {
      dirtyDocumentRef.current = true
      setter(v)
      setCurrentThemeId(null)
    }
  }

  // Toolbar 主题下拉：通过 id 查找主题然后 apply
  function handleSelectThemeById(themeId: string) {
    const theme =
      BUILTIN_THEMES.find((t) => t.id === themeId) ??
      userThemes.find((t) => t.id === themeId)
    if (theme) applyTheme(theme)
  }

  function handlePickBackground(asset: Asset) {
    dirtyDocumentRef.current = true
    setBgAssetId(asset.id)
    setBgSrc(asset.src)
    setCurrentThemeId(null)
  }
  function handlePickLogo(asset: Asset) {
    dirtyDocumentRef.current = true
    setLogoAssetId(asset.id)
    setLogoSrc(asset.src)
    setCurrentThemeId(null)
  }
  function handlePickImage(asset: Asset) {
    // 带上 assetId：主题「包含正文」序列化后靠它跨会话重新 resolve src
    editorRef.current?.insertImage(asset.src, asset.id)
  }
  function handleImageWidthChange(width: string | null) {
    editorRef.current?.setImageWidth(width)
  }

  function clearAutosaveTimer() {
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }
  }

  async function flushActiveDraft(): Promise<boolean> {
    const identity = activeDraftRef.current
    if (!identity) return true
    clearAutosaveTimer()
    const revision = ++editRevisionRef.current
    const document = captureDocument(identity)
    if (!document) {
      setDraftStorageError('编辑器尚未就绪，无法保存当前草稿')
      setDraftSaveStatus('error')
      return false
    }
    pendingSnapshotRef.current = document
    dirtyDocumentRef.current = false
    writeEditorDocumentRecovery(document)
    return persistDocument(document, revision)
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
    document: EditorDocumentV1,
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
    document: EditorDocumentV1,
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

  // CSS var 注入
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--font-h1', fontH1)
    root.style.setProperty('--font-h2', fontH2)
    root.style.setProperty('--font-h3', fontH3)
    root.style.setProperty('--font-body', fontBody)
    root.style.setProperty('--fw-h1', h1Bold ? '700' : '400')
    root.style.setProperty('--fw-h2', h2Bold ? '700' : '400')
    root.style.setProperty('--fw-h3', h3Bold ? '700' : '400')
    root.style.setProperty('--h1-max-width', h1Width)

    for (const [k, v] of Object.entries(computeFontSizeVars(fontSize))) {
      root.style.setProperty(k, v)
    }
    for (const [k, v] of Object.entries(DENSITY_MAP[density])) {
      root.style.setProperty(k, v)
    }

    const [color, opacity] = OVERLAY_MAP[overlay]
    root.style.setProperty('--c-overlay-color', color)
    root.style.setProperty('--c-overlay-opacity', String(opacity))
  }, [fontH1, fontH2, fontH3, fontBody, h1Bold, h2Bold, h3Bold, fontSize, density, h1Width, overlay])

  const pages = useMemo(() => splitIntoPages(content), [content])

  async function handleExport(
    filename: string,
    onProgress: (current: number, total: number) => void,
  ) {
    const els = pageRefs.current.filter((el): el is HTMLDivElement => el !== null)
    await exportPages(els, filename, onProgress)
  }

  function shouldShowLogo(pageIndex: number, total: number): boolean {
    switch (logoStrategy) {
      case 'every':
        return true
      case 'first':
        return pageIndex === 0
      case 'first-last':
        return pageIndex === 0 || pageIndex === total - 1
      case 'none':
        return false
    }
  }

  const interactionBlocked = !draftReady || writerLeaseState !== 'owned'
  const blockingTitle =
    writerLeaseState === 'unsupported'
      ? '当前浏览器无法安全保存'
      : writerLeaseState === 'conflict'
        ? '另一个标签页正在编辑'
        : writerLeaseState === 'checking'
          ? '正在确认编辑权限…'
          : '正在恢复最近草稿…'
  const blockingDescription =
    writerLeaseState === 'unsupported'
      ? '请升级到新版 Chrome、Edge 或 Safari 后再编辑，避免草稿被并发覆盖。'
      : writerLeaseState === 'conflict'
        ? '为避免两个页面互相覆盖，本页暂时保持只读；关闭另一页后会自动载入最新草稿并恢复编辑。'
        : writerLeaseState === 'checking'
          ? '正在确认没有其他页面写入同一份草稿。'
          : '恢复完成前暂不接受编辑，避免新输入被旧快照覆盖。'

  return (
    <div
      className="relative flex h-screen flex-col bg-neutral-950"
      aria-busy={interactionBlocked}
    >
      {interactionBlocked && (
        <div
          className="absolute inset-0 z-[100] flex items-center justify-center bg-neutral-950/70 backdrop-blur-sm"
          role="status"
          aria-live="polite"
        >
          <div className="rounded-lg border border-neutral-700 bg-neutral-900 px-5 py-4 text-center shadow-2xl">
            <div className="text-sm font-medium text-neutral-100">
              {blockingTitle}
            </div>
            <div className="mt-1 text-xs text-neutral-400">
              {blockingDescription}
            </div>
          </div>
        </div>
      )}
      <div
        className="flex min-h-0 flex-1 flex-col"
        inert={interactionBlocked ? true : undefined}
        aria-hidden={interactionBlocked}
      >
      <Toolbar
        currentThemeId={currentThemeId}
        userThemes={userThemes}
        onTheme={handleSelectThemeById}
        fontH1={fontH1}
        fontH2={fontH2}
        fontH3={fontH3}
        fontBody={fontBody}
        h1Bold={h1Bold}
        h2Bold={h2Bold}
        h3Bold={h3Bold}
        fontSize={fontSize}
        density={density}
        h1Width={h1Width}
        overlay={overlay}
        logoStrategy={logoStrategy}
        userFontFamilies={userFontFamilies}
        onFontH1={customize(setFontH1)}
        onFontH2={customize(setFontH2)}
        onFontH3={customize(setFontH3)}
        onFontBody={customize(setFontBody)}
        onH1Bold={customize(setH1Bold)}
        onH2Bold={customize(setH2Bold)}
        onH3Bold={customize(setH3Bold)}
        onFontSize={customize(setFontSize)}
        onDensity={customize(setDensity)}
        onH1Width={customize(setH1Width)}
        onOverlay={customize(setOverlay)}
        onLogoStrategy={customize(setLogoStrategy)}
        onOpenAssetLibrary={() => {
          setAssetLibInitialKind(undefined)
          setAssetLibOpen(true)
        }}
        imageActive={imageState.active}
        imageWidth={imageState.width}
        onImageWidth={handleImageWidthChange}
        onOpenFontLibrary={() => setFontLibOpen(true)}
        onOpenThemeLibrary={() => setThemeLibOpen(true)}
        onOpenDraftLibrary={() => setDraftLibOpen(true)}
        activeDocumentTitle={activeDraft?.title ?? '未命名草稿'}
        draftSaveStatus={draftSaveStatus}
        draftSaveError={draftStorageError}
        onExport={() => setExportOpen(true)}
        guidesOn={guidesOn}
        onToggleGuides={() => setGuidesOn((v) => !v)}
      />

      {/* 关闭即卸载：每次打开都按 initialKind 初始化，无需 effect 重置本地 tab。 */}
      {assetLibOpen && (
        <AssetLibrary
          open={assetLibOpen}
          onOpenChange={setAssetLibOpen}
          currentBgSrc={bgSrc}
          currentLogoSrc={logoSrc}
          onPickBackground={handlePickBackground}
          onPickLogo={handlePickLogo}
          onPickImage={handlePickImage}
          initialKind={assetLibInitialKind}
        />
      )}

      <FontLibrary
        open={fontLibOpen}
        onOpenChange={setFontLibOpen}
        onFontsChanged={reloadUserFonts}
      />

      <ThemeLibrary
        open={themeLibOpen}
        onOpenChange={setThemeLibOpen}
        userThemes={userThemes}
        currentThemeId={currentThemeId}
        onApply={applyTheme}
        onSaveCurrent={saveCurrentAsTheme}
        onReload={reloadUserThemes}
      />

      <DraftLibrary
        open={draftLibOpen}
        onOpenChange={setDraftLibOpen}
        documents={draftDocuments}
        activeDocumentId={activeDraft?.id ?? null}
        activeDocumentTitle={activeDraft?.title ?? '未命名草稿'}
        storageError={draftStorageError}
        onSaveAs={handleSaveAsDraft}
        onOpenDocument={handleOpenDraft}
        onDeleteDocument={handleDeleteDraft}
      />

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        defaultFilename={suggestFilename(content)}
        pageCount={pages.length}
        onExport={handleExport}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* 左：编辑器 */}
        <div className="w-[45%] border-r-2 border-neutral-800">
          <EditorPane
            ref={editorRef}
            onUpdate={handleEditorUpdate}
            onInsertImageClick={() => {
              setAssetLibInitialKind('image')
              setAssetLibOpen(true)
            }}
            onImageStateChange={setImageState}
            noWrapH1Layout={noWrapH1Layout}
          />
        </div>

        {/* 右：预览（多页纵向滚动） */}
        <div className="flex flex-1 flex-col items-center gap-6 overflow-y-auto bg-neutral-900 p-8">
          <div className="text-xs text-neutral-500">
            预览缩放 40% · 画布 {CANVAS_WIDTH} × {CANVAS_HEIGHT}（9:15）· 导出{' '}
            {EXPORT_WIDTH} × {EXPORT_HEIGHT} · 共 {pages.length} 页 · v{__APP_VERSION__}
          </div>
          {pages.map((pageHtml, i) => (
            <Preview
              key={i}
              ref={(el) => {
                pageRefs.current[i] = el
              }}
              html={pageHtml}
              themeClass={themeClass}
              bgSrc={bgSrc}
              logoSrc={logoSrc}
              showLogo={shouldShowLogo(i, pages.length)}
              pageIndex={i}
              pageTotal={pages.length}
              guidesOn={guidesOn}
            />
          ))}
        </div>
      </div>
      </div>
    </div>
  )
}

export default App
