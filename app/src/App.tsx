import {
  useCallback,
  useEffect,
  useInsertionEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import {
  EditorPane,
  type EditorHandle,
  type HistoryState,
  type ImageState,
  type TextSelectionState,
} from '@/components/Editor/Editor'
import { createEditorDocumentJSON } from '@/components/Editor/createEditorDocumentJSON'
import { Preview } from '@/components/Preview/Preview'
import {
  Toolbar,
  type DraftSaveStatus,
} from '@/components/Toolbar/Toolbar'
import { AssetLibrary } from '@/components/AssetLibrary/AssetLibrary'
import { FontLibrary } from '@/components/FontLibrary/FontLibrary'
import { ThemeLibrary } from '@/components/ThemeLibrary/ThemeLibrary'
import {
  ExportDialog,
  type ExportRequest,
} from '@/components/ExportDialog/ExportDialog'
import { ImportDialog } from '@/components/ImportDialog/ImportDialog'
import { DraftLibrary } from '@/components/DraftLibrary/DraftLibrary'
import {
  ContextInspector,
  type ResourceIssue,
} from '@/components/Inspector/ContextInspector'
import {
  BUILTIN_THEMES,
  DEFAULT_THEME,
  getThemeCoverTextColors,
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
import {
  getFontRegistryRevision,
  loadAllUserFontsWithReport,
  subscribeFontRegistryRevision,
  type UserFontLoadReport,
} from '@/lib/fontRegistry'
import {
  collectContentImageAssetIds,
  collectResolvedContentImageSources,
  resolveAssetSrcWithStatus,
  resolveContentImagesWithReport,
} from '@/lib/resolveAsset'
import { BODY_FONTS, DISPLAY_FONTS } from '@/lib/fontPresets'
import { splitIntoPages } from '@/lib/splitPages'
import { useDocumentScrollSync } from '@/lib/useDocumentScrollSync'
import { suggestFilename } from '@/lib/exportPng'
import {
  EXPORT_DELIVERY_MODE,
  createFolderExportPlan,
} from '@/lib/exportPlan'
import {
  executeDirectoryExport,
  executeZipExport,
  resumeDirectoryExport,
} from '@/lib/exportDelivery'
import {
  checkExportReadiness,
  ExportReadinessError,
  isBlockingExportIssue,
} from '@/lib/exportReadiness'
import {
  hasBlockingDeterministicLayoutIssues,
  readDeterministicLayoutIssues,
} from '@/lib/deterministicTypography'
import {
  coverContentWidthForTheme,
  EXPORT_HEIGHT,
  EXPORT_WIDTH,
} from '@/lib/canvas'
import type { ImageAlign } from '@/lib/imageModel'
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
import {
  resolvePageBackgrounds,
  type PageBackgroundIssue,
  type PageBackgroundRole,
} from '@/lib/pageBackgrounds'
import { handleGlobalHistoryShortcut } from '@/lib/globalHistoryShortcut'
import type { ImportAnalysis } from '@/lib/importDocument'
import './styles/canvas.css'
import './styles/workspace.css'

const AUTOSAVE_DELAY_MS = 900
const WRITER_LOCK_NAME = 'xhs-poster-editor-single-writer-v1'
const WRITER_LOCK_RETRY_MS = 1_000
const EMPTY_DOCUMENT_JSON = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
}
const EMPTY_PUBLICATION: EditorDocumentPublicationV1 = {
  releaseCopy: '',
  sourceName: null,
  importedAt: null,
}
const BUILTIN_FONT_STACKS = new Set(
  [...DISPLAY_FONTS, ...BODY_FONTS].map((font) => font.value),
)

interface DraftIdentity {
  id: string
  title: string
  createdAt: number
}

type WriterLeaseState = 'checking' | 'owned' | 'conflict' | 'unsupported'
type ResourceIssueScope = 'document' | 'font' | 'library'

interface AppResourceIssue extends ResourceIssue {
  scope: ResourceIssueScope
  backgroundRole?: PageBackgroundRole
}

interface PageBackgroundState {
  coverAssetId: string
  innerAssetId: string
  coverSrc: string
  innerSrc: string
}

function resourceErrorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : '本地资源读取失败'
}

function primaryFontFamily(stack: string): string {
  return stack
    .split(',')[0]
    .trim()
    .replace(/^["']|["']$/g, '')
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
  }
}

function pageBackgroundIssues(
  issues: readonly PageBackgroundIssue[],
): AppResourceIssue[] {
  return issues.map((issue) => ({
    id: issue.id,
    scope: 'document',
    label: issue.label,
    message: issue.message,
    backgroundRole: issue.role,
  }))
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
  const [coverTitleColor, setCoverTitleColor] = useState(
    DEFAULT_THEME.coverTitleColor,
  )
  const [coverSubtitleColor, setCoverSubtitleColor] = useState(
    DEFAULT_THEME.coverSubtitleColor,
  )

  // 资源同时持有 id（用于主题序列化）和 src（用于渲染）
  const [pageBackground, setPageBackground] = useState<PageBackgroundState>(() => ({
    coverAssetId: DEFAULT_THEME.coverBgAssetId,
    innerAssetId: DEFAULT_THEME.bgAssetId,
    coverSrc:
      findAssetById(BUILTIN_BACKGROUNDS, DEFAULT_THEME.coverBgAssetId)?.src ?? '',
    innerSrc:
      findAssetById(BUILTIN_BACKGROUNDS, DEFAULT_THEME.bgAssetId)?.src ?? '',
  }))
  const {
    coverAssetId,
    innerAssetId: bgAssetId,
    coverSrc,
    innerSrc: bgSrc,
  } = pageBackground
  const [logoAssetId, setLogoAssetId] = useState(DEFAULT_THEME.logoAssetId)
  const [logoSrc, setLogoSrc] = useState(
    findAssetById(BUILTIN_LOGOS, DEFAULT_THEME.logoAssetId)?.src ?? '',
  )

  const [content, setContent] = useState('')
  const editorRef = useRef<EditorHandle>(null)
  const [publication, setPublication] =
    useState<EditorDocumentPublicationV1>(EMPTY_PUBLICATION)
  const publicationRef = useRef(publication)
  publicationRef.current = publication

  // 草稿与主题分库：草稿保存可继续编辑的完整文档，主题仍只是可复用样式。
  const [editorReady, setEditorReady] = useState(false)
  const [draftReady, setDraftReady] = useState(false)
  const [activeDraft, setActiveDraft] = useState<DraftIdentity | null>(null)
  const activeDraftRef = useRef<DraftIdentity | null>(null)
  const [draftDocuments, setDraftDocuments] = useState<EditorDocumentV2[]>([])
  const [draftSaveStatus, setDraftSaveStatus] =
    useState<DraftSaveStatus>('restoring')
  const [draftStorageError, setDraftStorageError] = useState<string | null>(null)
  const [writerLeaseState, setWriterLeaseState] =
    useState<WriterLeaseState>('checking')
  const autosaveTimerRef = useRef<number | null>(null)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const editRevisionRef = useRef(0)
  const documentRevisionRef = useRef(0)
  const pendingSnapshotRef = useRef<EditorDocumentV2 | null>(null)
  const dirtyDocumentRef = useRef(false)
  const bootstrapStartedRef = useRef(false)
  const hydratingDocumentRef = useRef(false)
  const fontRestorePromiseRef = useRef<Promise<UserFontLoadReport> | null>(null)

  // 当前已应用的主题 id；null = 用户微调过、已脱离任何主题
  const [currentThemeId, setCurrentThemeId] = useState<string | null>(
    DEFAULT_THEME.id,
  )

  const [assetLibOpen, setAssetLibOpen] = useState(false)
  const [replaceImageId, setReplaceImageId] = useState<string | null>(null)
  // 素材库打开时切到哪个 tab；编辑器「插入图片」按钮设为 'image'，主题/Logo 按钮 undefined 保持默认
  const [assetLibInitialKind, setAssetLibInitialKind] = useState<
    'background' | 'logo' | 'image' | undefined
  >(undefined)
  const [fontLibOpen, setFontLibOpen] = useState(false)
  const [themeLibOpen, setThemeLibOpen] = useState(false)
  const [draftLibOpen, setDraftLibOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  // 收集多页 .page DOM 节点供导出截图使用
  const pageRefs = useRef<(HTMLDivElement | null)[]>([])
  // v1.8 滚动联动：会话态开关（不进草稿/undo/导出）+ 中栏滚动容器与 sticky 标题
  const [scrollSyncOn, setScrollSyncOn] = useState(true)
  const canvasPanelRef = useRef<HTMLElement | null>(null)
  const canvasHeadingRef = useRef<HTMLDivElement | null>(null)
  const [userFontFamilies, setUserFontFamilies] = useState<string[]>([])
  const fontRegistryRevision = useSyncExternalStore(
    subscribeFontRegistryRevision,
    getFontRegistryRevision,
    getFontRegistryRevision,
  )
  // 用户保存的主题列表，由 App 集中维护，同时供 Toolbar 下拉和 ThemeLibrary 卡片使用
  const [userThemes, setUserThemes] = useState<Theme[]>([])
  // 当前光标下图片节点的状态，Toolbar「图片宽度」下拉据此显示当前值/启用
  const [imageState, setImageState] = useState<ImageState>({
    active: false,
    imageId: null,
    width: null,
    align: 'left',
    src: null,
    assetId: null,
  })
  const [textSelectionState, setTextSelectionState] =
    useState<TextSelectionState>({
      active: false,
      highlighted: false,
      opacity: 0.5,
    })
  const [historyState, setHistoryState] = useState<HistoryState>({
    canUndo: false,
    canRedo: false,
  })
  // 裁切参考、排版参考和磁吸必须独立；它们只属于本会话 UI。
  const [cropGuideOn, setCropGuideOn] = useState(false)
  const [layoutGuidesOn, setLayoutGuidesOn] = useState(false)
  const [snapEnabled, setSnapEnabled] = useState(true)
  const [canvasGestureActive, setCanvasGestureActive] = useState(false)
  const [recentActions, setRecentActions] = useState<
    Array<{ id: string; label: string; time: number }>
  >([])
  const [resourceIssues, setResourceIssues] = useState<AppResourceIssue[]>([])
  const [resourceRetrying, setResourceRetrying] = useState(false)
  const [themeApplying, setThemeApplying] = useState(false)
  const themeApplyRevisionRef = useRef(0)
  const resourceOperationRevisionRef = useRef(0)

  const documentStyle = useMemo<EditorDocumentStyleV2>(
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
      coverBgAssetId: coverAssetId,
      logoAssetId,
      coverTitleColor,
      coverSubtitleColor,
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
      coverAssetId,
      logoAssetId,
      coverTitleColor,
      coverSubtitleColor,
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
        coverContentWidthForTheme(themeClass) *
        (Number.parseFloat(h1Width) / 100),
    }),
    [fontH1, fontSize, h1Bold, h1Width, themeClass],
  )
  const previewLayoutRevision = [
    fontH1,
    fontH2,
    fontH3,
    fontBody,
    h1Bold,
    h2Bold,
    h3Bold,
    fontSize,
    density,
    h1Width,
    userFontFamilies.join(','),
    fontRegistryRevision,
  ].join('|')

  const selectActiveDraft = useCallback((identity: DraftIdentity) => {
    // 草稿身份是资源操作的提交边界。另存为可能发生在异步重试返回前；
    // 此处统一使旧请求失效并复位按钮，避免 stale guard 只丢结果却遗留 loading UI。
    resourceOperationRevisionRef.current += 1
    setResourceRetrying(false)
    activeDraftRef.current = identity
    setActiveDraft(identity)
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
        if (revision === editRevisionRef.current) {
          setDraftStorageError(describeDocumentStoreError(error))
          setDraftSaveStatus('error')
        }
        return false
      }
    },
    [],
  )

  const replaceResourceIssueScope = useCallback(
    (scope: ResourceIssueScope, issues: AppResourceIssue[]) => {
      setResourceIssues((previous) => [
        ...previous.filter((issue) => issue.scope !== scope),
        ...issues,
      ])
    },
    [],
  )

  const ensureUserFontsLoaded = useCallback(() => {
    if (!fontRestorePromiseRef.current) {
      fontRestorePromiseRef.current = loadAllUserFontsWithReport()
        .then((report) => {
          setUserFontFamilies(report.families)
          replaceResourceIssueScope(
            'font',
            report.failedFamilies.map((family) => ({
              id: `font:${family}`,
              scope: 'font',
              label: family,
              message: '字体文件损坏或浏览器无法解析',
            })),
          )
          return report
        })
        .catch((error) => {
          replaceResourceIssueScope('font', [
            {
              id: 'font:library',
              scope: 'font',
              label: '我的字体',
              message: resourceErrorMessage(error),
            },
          ])
          throw error
        })
    }
    return fontRestorePromiseRef.current
  }, [replaceResourceIssueScope])

  const hydrateDocument = useCallback(async (document: EditorDocumentV2) => {
    themeApplyRevisionRef.current += 1
    const operationRevision = ++resourceOperationRevisionRef.current
    setResourceRetrying(false)
    setThemeApplying(false)
    documentRevisionRef.current = document.revision
    pendingSnapshotRef.current = null
    dirtyDocumentRef.current = false
    const [backgroundResult, logoResult, contentResult] =
      await Promise.allSettled([
        resolvePageBackgrounds({
          coverAssetId: document.style.coverBgAssetId,
          innerAssetId: document.style.bgAssetId,
        }),
        resolveAssetSrcWithStatus(document.style.logoAssetId, 'logo'),
        resolveContentImagesWithReport(document.contentJSON),
      ])

    // A later theme apply, resource retry or draft open owns the UI now. Never
    // let this older async restore overwrite its complete background pair.
    if (operationRevision !== resourceOperationRevisionRef.current) return

    const documentIssues: AppResourceIssue[] = []
    if (backgroundResult.status === 'rejected') {
      documentIssues.push(
        ...(['cover', 'inner'] as const).map((role) => ({
          id: `background:${role}:unknown`,
          scope: 'document' as const,
          label: role === 'cover' ? '首图背景' : '内页背景',
          message: resourceErrorMessage(backgroundResult.reason),
          backgroundRole: role,
        })),
      )
    } else {
      documentIssues.push(...pageBackgroundIssues(backgroundResult.value.issues))
    }
    if (logoResult.status === 'rejected') {
      documentIssues.push({
        id: `logo:${document.style.logoAssetId || 'unknown'}`,
        scope: 'document',
        label: 'Logo',
        message: resourceErrorMessage(logoResult.reason),
      })
    } else if (logoResult.value.missing) {
      documentIssues.push({
        id: `logo:${document.style.logoAssetId}`,
        scope: 'document',
        label: 'Logo',
        message: '素材已经被删除或暂时无法读取',
      })
    }
    if (contentResult.status === 'rejected') {
      documentIssues.push({
        id: 'image:content-read',
        scope: 'document',
        label: '正文插图',
        message: resourceErrorMessage(contentResult.reason),
      })
    } else {
      for (const assetId of contentResult.value.missingAssetIds) {
        documentIssues.push({
          id: `image:${assetId}`,
          scope: 'document',
          label: '正文插图',
          message: `找不到素材 ${assetId}`,
        })
      }
    }
    replaceResourceIssueScope('document', documentIssues)

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
    setCoverTitleColor(document.style.coverTitleColor)
    setCoverSubtitleColor(document.style.coverSubtitleColor)
    setLogoAssetId(document.style.logoAssetId)
    setPageBackground({
      coverAssetId: document.style.coverBgAssetId,
      innerAssetId: document.style.bgAssetId,
      coverSrc:
        backgroundResult.status === 'fulfilled'
          ? backgroundResult.value.coverSrc
          : '',
      innerSrc:
        backgroundResult.status === 'fulfilled'
          ? backgroundResult.value.innerSrc
          : '',
    })
    setLogoSrc(logoResult.status === 'fulfilled' ? logoResult.value.src : '')
    setCurrentThemeId(null)
    setPublication(document.publication ?? EMPTY_PUBLICATION)
    editorRef.current?.setContent(
      contentResult.status === 'fulfilled'
        ? contentResult.value.document
        : document.contentJSON,
      { resetHistory: true },
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
  }, [replaceResourceIssueScope])

  const handleEditorUpdate = useCallback((html: string) => {
    setContent(html)
    setEditorReady(true)
    if (!hydratingDocumentRef.current) {
      themeApplyRevisionRef.current += 1
      resourceOperationRevisionRef.current += 1
      setThemeApplying(false)
      setResourceRetrying(false)
    }
    if (
      draftReady &&
      writerLeaseState === 'owned' &&
      !hydratingDocumentRef.current
    ) {
      dirtyDocumentRef.current = true
    }
  }, [draftReady, writerLeaseState])

  const interactionBlocked = !draftReady || writerLeaseState !== 'owned'
  const dialogOpen =
    assetLibOpen ||
    fontLibOpen ||
    themeLibOpen ||
    draftLibOpen ||
    importOpen ||
    exportOpen
  const historyShortcutSafetyRef = useRef({
    blocked: interactionBlocked,
    dialogOpen,
    gestureActive: canvasGestureActive,
  })

  useLayoutEffect(() => {
    historyShortcutSafetyRef.current = {
      blocked: interactionBlocked,
      dialogOpen,
      gestureActive: canvasGestureActive,
    }
  }, [canvasGestureActive, dialogOpen, interactionBlocked])

  const handleCanvasGestureStateChange = useCallback((active: boolean) => {
    // pointerdown 同步更新，不给随后的快捷键留出旧闭包窗口。
    historyShortcutSafetyRef.current.gestureActive = active
    setCanvasGestureActive(active)
  }, [])

  // 只在 Tiptap 失焦后补齐历史快捷键；输入控件、弹层、只读和手势期间全部让行。
  useEffect(() => {
    function handleHistoryShortcut(event: KeyboardEvent) {
      const safety = historyShortcutSafetyRef.current
      handleGlobalHistoryShortcut(event, {
        blocked: safety.blocked,
        dialogOpen: safety.dialogOpen,
        gestureActive: safety.gestureActive,
        undo: () => editorRef.current?.undo() ?? false,
        redo: () => editorRef.current?.redo() ?? false,
      })
    }
    window.addEventListener('keydown', handleHistoryShortcut)
    return () => window.removeEventListener('keydown', handleHistoryShortcut)
  }, [])

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
  }, [captureDocument, draftReady, persistDocument, writerLeaseState])

  useEffect(() => {
    void ensureUserFontsLoaded().catch(() => undefined)
    void listUserThemes()
      .then(setUserThemes)
      .catch((error) => {
        replaceResourceIssueScope('library', [
          {
            id: 'library:themes',
            scope: 'library',
            label: '我的主题',
            message: resourceErrorMessage(error),
          },
        ])
      })
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
  }, [ensureUserFontsLoaded, replaceResourceIssueScope])

  const reloadUserFonts = useCallback(async () => {
    fontRestorePromiseRef.current = null
    await ensureUserFontsLoaded()
  }, [ensureUserFontsLoaded])

  const reloadUserThemes = useCallback(async () => {
    setUserThemes(await listUserThemes())
    replaceResourceIssueScope('library', [])
  }, [replaceResourceIssueScope])

  async function retryPageBackground(backgroundRole: PageBackgroundRole) {
    if (resourceRetrying) return
    themeApplyRevisionRef.current += 1
    setThemeApplying(false)
    setResourceRetrying(true)
    const operationRevision = ++resourceOperationRevisionRef.current
    const draftId = activeDraftRef.current?.id ?? null
    const backgroundIds = {
      coverAssetId,
      innerAssetId: bgAssetId,
    }
    const [result] = await Promise.allSettled([
      resolvePageBackgrounds(backgroundIds),
    ])
    if (
      operationRevision !== resourceOperationRevisionRef.current ||
      draftId !== (activeDraftRef.current?.id ?? null)
    ) {
      return
    }

    const issues =
      result.status === 'fulfilled'
        ? pageBackgroundIssues(result.value.issues)
        : (['cover', 'inner'] as const).map((role) => ({
            id: `background:${role}:unknown`,
            scope: 'document' as const,
            label: role === 'cover' ? '首图背景' : '内页背景',
            message: resourceErrorMessage(result.reason),
            backgroundRole: role,
          }))
    if (result.status === 'fulfilled') {
      setPageBackground({
        ...backgroundIds,
        coverSrc: result.value.coverSrc,
        innerSrc: result.value.innerSrc,
      })
    }
    setResourceIssues((previous) => [
      ...previous.filter((issue) => !issue.id.startsWith('background:')),
      ...issues,
    ])
    if (!issues.some((issue) => issue.backgroundRole === backgroundRole)) {
      recordRecentAction(
        backgroundRole === 'cover'
          ? '首图背景重新载入完成'
          : '内页背景重新载入完成',
      )
    }
    setResourceRetrying(false)
  }

  async function retryResources(backgroundRole?: PageBackgroundRole) {
    if (backgroundRole) {
      await retryPageBackground(backgroundRole)
      return
    }
    if (resourceRetrying) return
    themeApplyRevisionRef.current += 1
    setThemeApplying(false)
    setResourceRetrying(true)
    const operationRevision = ++resourceOperationRevisionRef.current
    const draftId = activeDraftRef.current?.id ?? null
    const contentJSON = editorRef.current?.getJSON()
    const backgroundIds = {
      coverAssetId,
      innerAssetId: bgAssetId,
    }
    fontRestorePromiseRef.current = null
    const fontLoad = ensureUserFontsLoaded()
    const [backgroundResult, logoResult, contentResult, fontResult, themeResult] =
      await Promise.allSettled([
        resolvePageBackgrounds(backgroundIds),
        resolveAssetSrcWithStatus(logoAssetId, 'logo'),
        contentJSON
          ? resolveContentImagesWithReport(contentJSON)
          : Promise.resolve({ document: null, missingAssetIds: [] }),
        fontLoad,
        listUserThemes(),
      ])

    if (
      operationRevision !== resourceOperationRevisionRef.current ||
      draftId !== (activeDraftRef.current?.id ?? null)
    ) {
      return
    }

    const nextIssues: AppResourceIssue[] = []
    if (backgroundResult.status === 'fulfilled') {
      setPageBackground({
        ...backgroundIds,
        coverSrc: backgroundResult.value.coverSrc,
        innerSrc: backgroundResult.value.innerSrc,
      })
      nextIssues.push(...pageBackgroundIssues(backgroundResult.value.issues))
    } else {
      nextIssues.push(
        ...(['cover', 'inner'] as const).map((role) => ({
          id: `background:${role}:unknown`,
          scope: 'document' as const,
          label: role === 'cover' ? '首图背景' : '内页背景',
          message: resourceErrorMessage(backgroundResult.reason),
          backgroundRole: role,
        })),
      )
    }
    if (logoResult.status === 'fulfilled') {
      setLogoSrc(logoResult.value.src)
      if (logoResult.value.missing) {
        nextIssues.push({
          id: `logo:${logoAssetId}`,
          scope: 'document',
          label: 'Logo',
          message: '素材已经被删除或暂时无法读取',
        })
      }
    } else {
      nextIssues.push({
        id: `logo:${logoAssetId || 'unknown'}`,
        scope: 'document',
        label: 'Logo',
        message: resourceErrorMessage(logoResult.reason),
      })
    }
    if (contentResult.status === 'fulfilled') {
      if (contentResult.value.document) {
        editorRef.current?.syncImageSources(
          collectResolvedContentImageSources(contentResult.value.document),
        )
      }
      for (const assetId of contentResult.value.missingAssetIds) {
        nextIssues.push({
          id: `image:${assetId}`,
          scope: 'document',
          label: '正文插图',
          message: `找不到素材 ${assetId}`,
        })
      }
    } else {
      nextIssues.push({
        id: 'image:content-read',
        scope: 'document',
        label: '正文插图',
        message: resourceErrorMessage(contentResult.reason),
      })
    }
    if (fontResult.status === 'fulfilled') {
      setUserFontFamilies(fontResult.value.families)
      nextIssues.push(
        ...fontResult.value.failedFamilies.map((family) => ({
          id: `font:${family}`,
          scope: 'font' as const,
          label: family,
          message: '字体文件损坏或浏览器无法解析',
        })),
      )
    } else {
      nextIssues.push({
        id: 'font:library',
        scope: 'font',
        label: '我的字体',
        message: resourceErrorMessage(fontResult.reason),
      })
    }
    if (themeResult.status === 'fulfilled') {
      setUserThemes(themeResult.value)
    } else {
      nextIssues.push({
        id: 'library:themes',
        scope: 'library',
        label: '我的主题',
        message: resourceErrorMessage(themeResult.reason),
      })
    }
    setResourceIssues(nextIssues)
    if (nextIssues.length === 0) recordRecentAction('资源重新载入完成')
    setResourceRetrying(false)
  }

  // 应用主题：把 Theme 所有字段写回 App state；含正文则替换 editor
  async function applyTheme(theme: Theme) {
    const revision = ++themeApplyRevisionRef.current
    resourceOperationRevisionRef.current += 1
    setResourceRetrying(false)
    setThemeApplying(true)
    dirtyDocumentRef.current = true
    const [backgroundResult, logoResult, contentResult] = await Promise.allSettled([
      resolvePageBackgrounds({
        coverAssetId: theme.coverBgAssetId,
        innerAssetId: theme.bgAssetId,
      }),
      resolveAssetSrcWithStatus(theme.logoAssetId, 'logo'),
      theme.contentJSON
        ? resolveContentImagesWithReport(theme.contentJSON)
        : Promise.resolve(null),
    ])
    if (revision !== themeApplyRevisionRef.current) return

    const nextIssues: AppResourceIssue[] = []
    if (backgroundResult.status === 'rejected') {
      nextIssues.push(
        ...(['cover', 'inner'] as const).map((role) => ({
          id: `background:${role}:unknown`,
          scope: 'document' as const,
          label: role === 'cover' ? '首图背景' : '内页背景',
          message: resourceErrorMessage(backgroundResult.reason),
          backgroundRole: role,
        })),
      )
    } else {
      nextIssues.push(...pageBackgroundIssues(backgroundResult.value.issues))
    }
    if (logoResult.status === 'rejected' || logoResult.value.missing) {
      nextIssues.push({
        id: `logo:${theme.logoAssetId || 'unknown'}`,
        scope: 'document',
        label: 'Logo',
        message:
          logoResult.status === 'rejected'
            ? resourceErrorMessage(logoResult.reason)
            : '素材已经被删除或暂时无法读取',
      })
    }
    if (contentResult.status === 'rejected') {
      nextIssues.push({
        id: 'image:theme-content',
        scope: 'document',
        label: '主题正文插图',
        message: resourceErrorMessage(contentResult.reason),
      })
    } else if (contentResult.value) {
      nextIssues.push(
        ...contentResult.value.missingAssetIds.map((assetId) => ({
          id: `image:${assetId}`,
          scope: 'document' as const,
          label: '主题正文插图',
          message: `找不到素材 ${assetId}`,
        })),
      )
    }
    if (theme.contentJSON) {
      replaceResourceIssueScope('document', nextIssues)
    } else {
      // Style-only themes keep the current Tiptap document. Preserve its
      // recoverable image issues while replacing only theme-owned resources.
      setResourceIssues((previous) => [
        ...previous.filter(
          (issue) =>
            issue.scope !== 'document' ||
            (!issue.id.startsWith('background:') &&
              !issue.id.startsWith('logo:')),
        ),
        ...nextIssues,
      ])
    }

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
    setCoverTitleColor(theme.coverTitleColor)
    setCoverSubtitleColor(theme.coverSubtitleColor)
    setLogoAssetId(theme.logoAssetId)
    setPageBackground({
      coverAssetId: theme.coverBgAssetId,
      innerAssetId: theme.bgAssetId,
      coverSrc:
        backgroundResult.status === 'fulfilled'
          ? backgroundResult.value.coverSrc
          : '',
      innerSrc:
        backgroundResult.status === 'fulfilled'
          ? backgroundResult.value.innerSrc
          : '',
    })
    setLogoSrc(logoResult.status === 'fulfilled' ? logoResult.value.src : '')
    setCurrentThemeId(theme.id)
    if (theme.contentJSON && contentResult.status === 'fulfilled' && contentResult.value) {
      // 正文插图按 assetId 重新 resolve src（存储里的 blob URL 已跨会话失效）
      editorRef.current?.setContent(contentResult.value.document)
    }
    setThemeApplying(false)
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
      coverBgAssetId: coverAssetId,
      logoAssetId,
      coverTitleColor,
      coverSubtitleColor,
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
      themeApplyRevisionRef.current += 1
      resourceOperationRevisionRef.current += 1
      setThemeApplying(false)
      setResourceRetrying(false)
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

  function handleRestoreCoverColors() {
    const colors = getThemeCoverTextColors(themeClass)
    themeApplyRevisionRef.current += 1
    resourceOperationRevisionRef.current += 1
    setThemeApplying(false)
    setResourceRetrying(false)
    dirtyDocumentRef.current = true
    setCoverTitleColor(colors.title)
    setCoverSubtitleColor(colors.subtitle)
    setCurrentThemeId(null)
  }

  function handlePickBackground(asset: Asset) {
    themeApplyRevisionRef.current += 1
    resourceOperationRevisionRef.current += 1
    setThemeApplying(false)
    dirtyDocumentRef.current = true
    setResourceRetrying(false)
    setPageBackground({
      coverAssetId: asset.id,
      innerAssetId: asset.id,
      coverSrc: asset.src,
      innerSrc: asset.src,
    })
    setCurrentThemeId(null)
    setResourceIssues((previous) =>
      previous.filter((issue) => !issue.id.startsWith('background:')),
    )
  }
  function handlePickLogo(asset: Asset) {
    themeApplyRevisionRef.current += 1
    resourceOperationRevisionRef.current += 1
    setThemeApplying(false)
    setResourceRetrying(false)
    dirtyDocumentRef.current = true
    setLogoAssetId(asset.id)
    setLogoSrc(asset.src)
    setCurrentThemeId(null)
    setResourceIssues((previous) =>
      previous.filter((issue) => !issue.id.startsWith('logo:')),
    )
  }
  function handlePickImage(asset: Asset) {
    themeApplyRevisionRef.current += 1
    resourceOperationRevisionRef.current += 1
    setThemeApplying(false)
    setResourceRetrying(false)
    if (replaceImageId) {
      if (
        editorRef.current?.commitImageAttributes(replaceImageId, {
          src: asset.src,
          assetId: asset.id,
        })
      ) {
        recordRecentAction('替换图片')
      }
      setReplaceImageId(null)
      pruneStaleImageResourceIssues()
      return
    }
    // 带上 assetId：主题「包含正文」序列化后靠它跨会话重新 resolve src
    editorRef.current?.insertImage(asset.src, asset.id)
    recordRecentAction('插入图片')
    pruneStaleImageResourceIssues()
  }
  function handleImageWidthChange(width: string | null) {
    const imageId = imageState.imageId
    if (!imageId) return
    if (editorRef.current?.commitImageAttributes(imageId, { width })) {
      recordRecentAction(width ? `调整为 ${width}` : '恢复原图宽度')
    }
  }

  function recordRecentAction(label: string) {
    setRecentActions((previous) => [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        label,
        time: Date.now(),
      },
      ...previous,
    ].slice(0, 5))
  }

  function handleSelectCanvasImage(imageId: string) {
    editorRef.current?.selectImageById(imageId)
  }

  function handleCommitCanvasImage(
    imageId: string,
    patch: { width?: string | null; align?: ImageAlign },
    actionLabel: string,
  ): boolean {
    const committed =
      editorRef.current?.commitImageAttributes(imageId, patch) ?? false
    if (committed) recordRecentAction(actionLabel)
    return committed
  }

  function handleImageAlign(align: ImageAlign) {
    const imageId = imageState.imageId
    if (!imageId) return
    if (editorRef.current?.commitImageAttributes(imageId, { align })) {
      recordRecentAction(
        align === 'left' ? '左对齐' : align === 'center' ? '居中对齐' : '右对齐',
      )
    }
  }

  function handleReplaceImage() {
    if (!imageState.imageId) return
    setReplaceImageId(imageState.imageId)
    setAssetLibInitialKind('image')
    setAssetLibOpen(true)
  }

  function handleDeleteImage() {
    if (!imageState.imageId) return
    if (editorRef.current?.deleteImageById(imageState.imageId)) {
      recordRecentAction('删除图片')
      pruneStaleImageResourceIssues()
    }
  }

  function pruneStaleImageResourceIssues() {
    const documentJSON = editorRef.current?.getJSON()
    if (!documentJSON) return
    const referencedAssetIds = new Set(
      collectContentImageAssetIds(documentJSON),
    )
    setResourceIssues((previous) =>
      previous.filter((issue) => {
        if (!issue.id.startsWith('image:')) return true
        const assetId = issue.id.slice('image:'.length)
        // 读取链路的通用故障不能归因到单张图片，保留到下次重试。
        if (assetId === 'content-read' || assetId === 'theme-content') return true
        return referencedAssetIds.has(assetId)
      }),
    )
  }

  function handleHighlightOpacity(opacity: number) {
    if (editorRef.current?.setTextHighlight(opacity)) {
      recordRecentAction(`荧光笔 ${Math.round(opacity * 100)}%`)
    }
  }

  function handleClearHighlight() {
    if (editorRef.current?.clearTextHighlight()) {
      recordRecentAction('移除荧光笔')
    }
  }

  function handleReleaseCopyChange(releaseCopy: string) {
    dirtyDocumentRef.current = true
    setPublication((current) => ({ ...current, releaseCopy }))
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
      throw new Error(draftStorageError || '当前草稿保存失败，已取消导入。')
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

  // CSS var 注入
  useInsertionEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--font-h1', fontH1)
    root.style.setProperty('--font-h2', fontH2)
    root.style.setProperty('--font-h3', fontH3)
    root.style.setProperty('--font-body', fontBody)
    root.style.setProperty('--fw-h1', h1Bold ? '700' : '400')
    root.style.setProperty('--fw-h2', h2Bold ? '700' : '400')
    root.style.setProperty('--fw-h3', h3Bold ? '700' : '400')
    root.style.setProperty('--h1-max-width', h1Width)
    root.style.setProperty('--c-cover-title', coverTitleColor)
    root.style.setProperty('--c-cover-subtitle', coverSubtitleColor)

    for (const [k, v] of Object.entries(computeFontSizeVars(fontSize))) {
      root.style.setProperty(k, v)
    }
    for (const [k, v] of Object.entries(DENSITY_MAP[density])) {
      root.style.setProperty(k, v)
    }

    const [color, opacity] = OVERLAY_MAP[overlay]
    root.style.setProperty('--c-overlay-color', color)
    root.style.setProperty('--c-overlay-opacity', String(opacity))
  }, [
    fontH1,
    fontH2,
    fontH3,
    fontBody,
    h1Bold,
    h2Bold,
    h3Bold,
    fontSize,
    density,
    h1Width,
    overlay,
    coverTitleColor,
    coverSubtitleColor,
  ])

  useEffect(() => {
    function clearSelectedImage(event: KeyboardEvent) {
      if (
        event.key !== 'Escape' ||
        event.defaultPrevented ||
        canvasGestureActive ||
        !imageState.active ||
        assetLibOpen ||
        fontLibOpen ||
        themeLibOpen ||
        draftLibOpen ||
        importOpen ||
        exportOpen
      ) {
        return
      }
      event.preventDefault()
      editorRef.current?.clearSelection()
    }
    window.addEventListener('keydown', clearSelectedImage)
    return () => window.removeEventListener('keydown', clearSelectedImage)
  }, [
    assetLibOpen,
    canvasGestureActive,
    draftLibOpen,
    exportOpen,
    fontLibOpen,
    imageState.active,
    importOpen,
    themeLibOpen,
  ])

  const pages = useMemo(() => splitIntoPages(content), [content])

  // v1.8 长文双向滚动联动：只写两个容器的 scrollTop，不碰正文/选区/导出 DOM。
  // 图片手势期间暂停；草稿切换/导入即清零，首次人工滚动前保持静止。
  useDocumentScrollSync({
    enabled: scrollSyncOn,
    suspended: canvasGestureActive,
    getEditorScrollArea: () =>
      editorRef.current?.getScrollAreaElement() ?? null,
    getEditorRoot: () => editorRef.current?.getEditorRootElement() ?? null,
    getCanvasScrollPanel: () => canvasPanelRef.current,
    getCanvasHeading: () => canvasHeadingRef.current,
    getPageElements: () => pageRefs.current.slice(0, pages.length),
    documentIdentity: activeDraft?.id ?? 'unsaved',
    structureRevision: [pages.length, themeClass, previewLayoutRevision].join(
      '|',
    ),
  })

  async function handleExport(
    request: ExportRequest,
    onProgress: (current: number, total: number) => void,
    options?: { skipReadiness?: boolean; allowLayoutWarnings?: boolean },
  ) {
    if (canvasGestureActive || themeApplying) {
      throw new Error(
        canvasGestureActive
          ? '请先结束当前图片拖动，再导出成品'
          : '主题资源仍在载入，请稍候再导出',
      )
    }
    const allPageElements = pageRefs.current
      .slice(0, pages.length)
      .filter(
        (el): el is HTMLDivElement => el !== null && el.isConnected,
      )
    if (allPageElements.length !== pages.length) {
      throw new Error('画布仍在更新，请稍候再试')
    }
    const exportedAt = new Date()
    const plan = request.resumeToken?.plan ?? createFolderExportPlan({
      sourceName: request.filename,
      pageCount: pages.length,
      selectedPages: request.selectedPages,
      exportedAt,
      collisionIndex: request.collisionIndex,
      deliveryMode: request.deliveryMode,
    })
    const selectedElements = plan.pages.map(
      (pageNumber) => allPageElements[pageNumber - 1],
    )
    if (!options?.skipReadiness) {
      const selectedFontStacks = [fontH1, fontH2, fontH3, fontBody]
      const customFontFamilies = new Set(
        selectedFontStacks
          .filter((stack) => !BUILTIN_FONT_STACKS.has(stack))
          .map(primaryFontFamily),
      )
      let fontRestoreIssue: { kind: 'font'; label: string; message: string } | null =
        null
      let fontReport: UserFontLoadReport | null = null
      try {
        const result = await Promise.race([
          ensureUserFontsLoaded().then((report) => ({
            status: 'ready' as const,
            report,
          })),
          new Promise<{ status: 'timeout'; report: null }>((resolve) =>
            window.setTimeout(
              () => resolve({ status: 'timeout', report: null }),
              5_000,
            ),
          ),
        ])
        if (result.status === 'ready') fontReport = result.report
        else if (customFontFamilies.size > 0) {
          fontRestoreIssue = {
            kind: 'font',
            label: '我的字体',
            message: '等待用户字体恢复超过 5 秒',
          }
        }
      } catch (error) {
        if (customFontFamilies.size > 0) {
          fontRestoreIssue = {
            kind: 'font',
            label: '我的字体',
            message: resourceErrorMessage(error),
          }
        }
      }
      const domIssues = await checkExportReadiness(selectedElements)
      // Canvas 探针：隐私扩展/企业策略可禁用 Canvas 2D，此时字形墨迹测量
      // 走近似 fallback、几何不可信。引擎层为兼容 jsdom 单测保持宽容，
      // fail-closed 必须在导出闸门执行（无 severity=硬阻断，不可覆盖）。
      const canvasProbeIssues = document.createElement('canvas').getContext('2d')
        ? []
        : [{
            kind: 'font' as const,
            label: '字形测量',
            message:
              '浏览器的 Canvas 2D 功能被禁用（常见于隐私保护扩展或企业策略），无法测量真实字形，导出结果不可信；请解除限制后重试',
          }]
      const knownIssues = resourceIssues
        .filter((issue) => {
          if (issue.scope === 'library') return false
          if (issue.id.startsWith('logo:') && logoStrategy === 'none') return false
          if (
            issue.backgroundRole === 'inner' &&
            !plan.pages.some((pageNumber) => pageNumber > 1)
          ) return false
          if (issue.scope === 'document') return true
          return customFontFamilies.has(issue.id.slice('font:'.length))
        })
        .map((issue) => ({
          kind: issue.scope === 'font' ? ('font' as const) : ('image' as const),
          label: issue.label,
          message: issue.message,
        }))
      const failedSelectedFonts = (fontReport?.failedFamilies ?? [])
        .filter((family) => customFontFamilies.has(family))
        .map((family) => ({
          kind: 'font' as const,
          label: family,
          message: '字体文件损坏或浏览器无法解析',
        }))
      const issueMap = new Map(
        [
          ...canvasProbeIssues,
          ...knownIssues,
          ...failedSelectedFonts,
          ...(fontRestoreIssue ? [fontRestoreIssue] : []),
          ...domIssues,
        ].map((issue) => [`${issue.kind}:${issue.label}:${issue.message}`, issue]),
      )
      const issues = Array.from(issueMap.values())
      // blocking 永不可绕过；warning（如 unsatisfied-line）需要用户在
      // 弹窗里明确确认「按当前预览强制导出」后才放行。
      const blockingIssues = issues.filter(isBlockingExportIssue)
      if (blockingIssues.length > 0) throw new ExportReadinessError(issues)
      if (issues.length > 0 && !options?.allowLayoutWarnings) {
        throw new ExportReadinessError(issues)
      }
    }
    // 强制导出的 warning 记录以页面 DOM 为准写入导出清单；快照 ID 与
    // 实际渲染使用同一 sealed snapshot。
    const confirmedWarnings = options?.allowLayoutWarnings
      ? selectedElements.flatMap((page, index) => {
          if (page.dataset.layoutState !== 'ready-with-warnings') return []
          const parsed = readDeterministicLayoutIssues(page)
          if (
            parsed.length === 0 ||
            hasBlockingDeterministicLayoutIssues(parsed)
          ) {
            return []
          }
          const pageNumber = plan.pages[index]
          return parsed.map((issue) => ({
            pageNumber,
            code: issue.code,
            blockText: issue.blockText,
            message: issue.message,
            snapshotId: page.dataset.layoutSnapshot ?? '',
          }))
        })
      : []
    const allowWarnings = Boolean(options?.allowLayoutWarnings)
    if (request.resumeToken) {
      await resumeDirectoryExport(
        request.resumeToken,
        allPageElements,
        onProgress,
      )
      recordRecentAction(`已继续完成 ${plan.pages.length} 张目录导出`)
      return
    }

    if (request.deliveryMode === EXPORT_DELIVERY_MODE.DIRECTORY) {
      if (!request.directoryParent) {
        throw new Error('请先选择导出文件夹。')
      }
      const completedPlan = await executeDirectoryExport({
        parentHandle: request.directoryParent,
        createPlanOptions: {
          sourceName: request.filename,
          pageCount: pages.length,
          selectedPages: request.selectedPages,
          exportedAt,
          deliveryMode: EXPORT_DELIVERY_MODE.DIRECTORY,
          preflightWarnings: confirmedWarnings,
        },
        createPlan: createFolderExportPlan,
        pageElements: allPageElements,
        onProgress,
        allowWarnings,
        startCollisionIndex: request.collisionIndex,
      })
      recordRecentAction(`已导出 ${completedPlan.pages.length} 张到独立文件夹`)
      return
    }

    // 带确认 warning 的 ZIP 导出需要把记录写进清单，重建同参数 plan。
    const zipPlan = confirmedWarnings.length > 0
      ? createFolderExportPlan({
          sourceName: request.filename,
          pageCount: pages.length,
          selectedPages: request.selectedPages,
          exportedAt,
          collisionIndex: request.collisionIndex,
          deliveryMode: request.deliveryMode,
          preflightWarnings: confirmedWarnings,
        })
      : plan
    await executeZipExport({
      plan: zipPlan,
      pageElements: allPageElements,
      zipFileName: request.zipFileName,
      collisionIndex: request.collisionIndex,
      saveFileHandle: request.saveFileHandle,
      onProgress,
      allowWarnings,
    })
    recordRecentAction(`已导出 ${zipPlan.pages.length} 张到单个兼容 ZIP`)
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
      className="workspace-app relative flex flex-col"
      aria-busy={interactionBlocked}
    >
      {interactionBlocked && (
        <div
          className="workspace-blocking-layer"
          role="status"
          aria-live="polite"
        >
          <div className="workspace-blocking-card">
            <strong>{blockingTitle}</strong>
            <span>{blockingDescription}</span>
          </div>
        </div>
      )}
      <div
        className="flex h-full min-h-0 flex-col"
        inert={interactionBlocked ? true : undefined}
        aria-hidden={interactionBlocked}
      >
        <Toolbar
          canUndo={historyState.canUndo}
          canRedo={historyState.canRedo}
          onUndo={() => editorRef.current?.undo()}
          onRedo={() => editorRef.current?.redo()}
          activeDocumentTitle={activeDraft?.title ?? '未命名草稿'}
          draftSaveStatus={draftSaveStatus}
          draftSaveError={draftStorageError}
          onOpenDraftLibrary={() => setDraftLibOpen(true)}
          onOpenImport={() => setImportOpen(true)}
          cropGuideOn={cropGuideOn}
          onToggleCropGuide={() => setCropGuideOn((value) => !value)}
          layoutGuidesOn={layoutGuidesOn}
          onToggleLayoutGuides={() => setLayoutGuidesOn((value) => !value)}
          snapEnabled={snapEnabled}
          onToggleSnap={() => setSnapEnabled((value) => !value)}
          onExport={() => setExportOpen(true)}
          exportDisabled={canvasGestureActive || themeApplying}
          exportDisabledReason={
            canvasGestureActive
              ? '请先结束当前图片拖动'
              : '主题资源仍在载入'
          }
        />

        {/* 关闭即卸载：每次打开都按 initialKind 初始化。 */}
        {assetLibOpen && (
          <AssetLibrary
            open={assetLibOpen}
            onOpenChange={(open) => {
              setAssetLibOpen(open)
              if (!open) setReplaceImageId(null)
            }}
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
        <ImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          onGenerate={handleGenerateImportedDraft}
        />
        <ExportDialog
          open={exportOpen}
          onOpenChange={setExportOpen}
          defaultFilename={suggestFilename(content)}
          pageCount={pages.length}
          onExport={handleExport}
        />

        <main className="workspace-grid">
          <section className="workspace-editor-panel" aria-label="正文编辑">
            <EditorPane
              ref={editorRef}
              onUpdate={handleEditorUpdate}
              onInsertImageClick={() => {
                setReplaceImageId(null)
                setAssetLibInitialKind('image')
                setAssetLibOpen(true)
              }}
              onImageStateChange={setImageState}
              onTextSelectionStateChange={setTextSelectionState}
              onHistoryStateChange={setHistoryState}
              noWrapH1Layout={noWrapH1Layout}
            />
          </section>

          <section
            ref={canvasPanelRef}
            className="workspace-canvas-panel"
            aria-label="9:15 成品画布"
          >
            <div className="workspace-canvas-heading" ref={canvasHeadingRef}>
              <div className="workspace-canvas-heading-info">
                <strong>成品画布</strong>
                <span>
                  {pages.length} 页 · 导出 {EXPORT_WIDTH} × {EXPORT_HEIGHT}
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={scrollSyncOn}
                className="topbar-switch canvas-heading-switch"
                onClick={() => setScrollSyncOn((value) => !value)}
                title={`${scrollSyncOn ? '关闭' : '开启'}滚动联动：编辑区与成品画布互相定位`}
              >
                <span>滚动联动</span>
                <span className="topbar-switch-track" aria-hidden="true">
                  <span className="topbar-switch-thumb" />
                </span>
              </button>
            </div>
            <div className="workspace-canvas-pages">
              {pages.map((pageHtml, index) => (
                <Preview
                  key={index}
                  ref={(element) => {
                    pageRefs.current[index] = element
                  }}
                  html={pageHtml}
                  themeClass={themeClass}
                  bgSrc={index === 0 ? coverSrc : bgSrc}
                  logoSrc={logoSrc}
                  showLogo={shouldShowLogo(index, pages.length)}
                  pageIndex={index}
                  pageTotal={pages.length}
                  cropGuideOn={cropGuideOn}
                  layoutGuidesOn={layoutGuidesOn}
                  snapEnabled={snapEnabled}
                  selectedImageId={imageState.imageId}
                  layoutRevision={previewLayoutRevision}
                  onSelectImage={handleSelectCanvasImage}
                  onClearSelection={() => editorRef.current?.clearSelection()}
                  onGestureStateChange={handleCanvasGestureStateChange}
                  onCommitImage={handleCommitCanvasImage}
                />
              ))}
            </div>
          </section>

          <section className="workspace-inspector-panel">
            <ContextInspector
              releaseCopy={publication.releaseCopy}
              releaseCopySourceName={publication.sourceName}
              onReleaseCopyChange={handleReleaseCopyChange}
              imageState={imageState}
              textSelectionState={textSelectionState}
              recentActions={recentActions}
              resourceIssues={resourceIssues}
              resourceRetrying={resourceRetrying}
              resourceLoading={themeApplying}
              onRetryResources={(backgroundRole) =>
                void retryResources(backgroundRole)
              }
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
              coverTitleColor={coverTitleColor}
              coverSubtitleColor={coverSubtitleColor}
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
              onCoverTitleColor={customize(setCoverTitleColor)}
              onCoverSubtitleColor={customize(setCoverSubtitleColor)}
              onRestoreCoverColors={handleRestoreCoverColors}
              onOpenAssetLibrary={() => {
                setReplaceImageId(null)
                setAssetLibInitialKind(undefined)
                setAssetLibOpen(true)
              }}
              onOpenFontLibrary={() => setFontLibOpen(true)}
              onOpenThemeLibrary={() => setThemeLibOpen(true)}
              onImageAlign={handleImageAlign}
              onImageWidth={handleImageWidthChange}
              onReplaceImage={handleReplaceImage}
              onDeleteImage={handleDeleteImage}
              onHighlightOpacity={handleHighlightOpacity}
              onClearHighlight={handleClearHighlight}
            />
          </section>
        </main>
      </div>
    </div>
  )
}

export default App
