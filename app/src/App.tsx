import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import {
  DEFAULT_CONTENT,
  EditorPane,
  type EditorHandle,
  type HistoryState,
  type ImageState,
  type TextSelectionState,
} from '@/components/Editor/Editor'
import { Preview } from '@/components/Preview/Preview'
import { Toolbar } from '@/components/Toolbar/Toolbar'
import { AssetLibrary } from '@/components/AssetLibrary/AssetLibrary'
import { FontLibrary } from '@/components/FontLibrary/FontLibrary'
import { ThemeLibrary } from '@/components/ThemeLibrary/ThemeLibrary'
import {
  ExportDialog,
  type ExportRequest,
} from '@/components/ExportDialog/ExportDialog'
import { ImportDialog } from '@/components/ImportDialog/ImportDialog'
import { DraftLibrary } from '@/components/DraftLibrary/DraftLibrary'
import { ContextInspector } from '@/components/Inspector/ContextInspector'
import {
  BUILTIN_THEMES,
  DEFAULT_THEME,
  PUBLIC_EXAM_THEME,
  getThemeCoverTextColors,
  type DensityLevel,
  type H1Width,
  type LogoStrategy,
  type OverlayKey,
  type Theme,
  type ThemeKey,
} from '@/lib/themes'
import {
  COVER_LAYOUT_EXAMPLES,
  replaceCoverLayoutExampleHtml,
  replaceDefaultTutorialCoverHtml,
  type CoverLayout,
  type CoverSubtitleSpacing,
} from '@/lib/coverSlots'
import { newUserThemeId, putUserTheme } from '@/lib/themeStore'
import {
  BUILTIN_BACKGROUNDS,
  BUILTIN_LOGOS,
  findAssetById,
  type Asset,
} from '@/lib/builtinAssets'
import {
  getFontRegistryRevision,
  subscribeFontRegistryRevision,
} from '@/lib/fontRegistry'
import {
  collectContentImageAssetIds,
  resolveAssetSrcWithStatus,
  resolveContentImagesWithReport,
} from '@/lib/resolveAsset'
import { splitIntoPages } from '@/lib/splitPages'
import { useDocumentScrollSync } from '@/lib/useDocumentScrollSync'
import { suggestFilename } from '@/lib/exportPng'
import { runExport } from '@/lib/runExport'
import {
  coverContentWidthForTheme,
  EXPORT_HEIGHT,
  EXPORT_WIDTH,
} from '@/lib/canvas'
import type { ImageAlign } from '@/lib/imageModel'
import {
  describeDocumentStoreError,
  type EditorDocumentStyleV2,
  type EditorDocumentPublicationV1,
  type EditorDocumentV2,
} from '@/lib/documentStore'
import { resolvePageBackgrounds } from '@/lib/pageBackgrounds'
import { handleGlobalHistoryShortcut } from '@/lib/globalHistoryShortcut'
import { useWriterLease } from '@/lib/useWriterLease'
import { useThemeCssVars } from '@/lib/useThemeCssVars'
import {
  pageBackgroundIssues,
  resourceErrorMessage,
  useResourceRecovery,
  type AppResourceIssue,
  type PageBackgroundState,
} from '@/lib/useResourceRecovery'
import {
  useDraftPersistence,
  type DraftIdentity,
} from '@/lib/useDraftPersistence'
import './styles/canvas.css'
import './styles/workspace.css'

const EMPTY_PUBLICATION: EditorDocumentPublicationV1 = {
  releaseCopy: '',
  sourceName: null,
  importedAt: null,
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
  const [coverLayout, setCoverLayout] = useState(DEFAULT_THEME.coverLayout)
  const [coverVertical, setCoverVertical] = useState(
    DEFAULT_THEME.coverVertical,
  )
  const [coverSubtitleSpacing, setCoverSubtitleSpacing] =
    useState<CoverSubtitleSpacing>(DEFAULT_THEME.coverSubtitleSpacing)

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
  // 渲染期同步镜像（既有模式）：捕获快照要读最新值，不重渲染消费方。
  // eslint-disable-next-line react-hooks/refs
  publicationRef.current = publication

  // 草稿与主题分库：草稿保存可继续编辑的完整文档，主题仍只是可复用样式。
  const [editorReady, setEditorReady] = useState(false)
  // 活动草稿身份 ref 由 App 持有：资源恢复域与持久化域都要读写，
  // 且 useResourceRecovery 先于 useDraftPersistence 调用。
  const activeDraftRef = useRef<DraftIdentity | null>(null)
  const writerLeaseState = useWriterLease()

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
  // P3：Preview 已 memo。每页 ref 回调按页序缓存，保持跨渲染身份稳定；
  // 否则每次渲染 React 会以 null→节点重挂 ref，且 memo 永远失效。
  // 卸载时 React 仍会用 null 回调同一函数，pageRefs 语义不变，
  // 滚动联动/导出对 pageRefs.current 的消费不受影响。
  const pageRefCallbacksRef = useRef<
    Array<(element: HTMLDivElement | null) => void>
  >([])
  const getPageRefCallback = useCallback((index: number) => {
    let callback = pageRefCallbacksRef.current[index]
    if (!callback) {
      callback = (element: HTMLDivElement | null) => {
        pageRefs.current[index] = element
      }
      pageRefCallbacksRef.current[index] = callback
    }
    return callback
  }, [])
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
  const [themeApplying, setThemeApplying] = useState(false)
  const themeApplyRevisionRef = useRef(0)

  // P3：Preview 已 memo，onCommitImage 等函数 props 必须身份稳定；
  // recordRecentAction 是它们的公共依赖，提前用 useCallback 固定。
  const recordRecentAction = useCallback((label: string) => {
    setRecentActions((previous) => [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        label,
        time: Date.now(),
      },
      ...previous,
    ].slice(0, 5))
  }, [])

  // 主题应用失效组合（themeApplyRevisionRef += 1 加 setThemeApplying(false)）
  // 以回调注入资源恢复域；两个句柄本体仍由 App/applyTheme 持有。
  const invalidateThemeApply = useCallback(() => {
    themeApplyRevisionRef.current += 1
    setThemeApplying(false)
  }, [])

  // 资源恢复域抽在 useResourceRecovery（M7 拆分第三步）。
  const {
    resourceIssues,
    resourceRetrying,
    setResourceIssues,
    setResourceRetrying,
    resourceOperationRevisionRef,
    replaceResourceIssueScope,
    ensureUserFontsLoaded,
    reloadUserFonts,
    reloadUserThemes,
    retryResources,
  } = useResourceRecovery({
    editorRef,
    activeDraftRef,
    coverAssetId,
    bgAssetId,
    logoAssetId,
    invalidateThemeApply,
    setPageBackground,
    setLogoSrc,
    setUserThemes,
    setUserFontFamilies,
    recordRecentAction,
  })

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
      coverLayout,
      coverVertical,
      coverSubtitleSpacing,
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
      coverLayout,
      coverVertical,
      coverSubtitleSpacing,
    ],
  )
  const documentStyleRef = useRef(documentStyle)
  // 渲染期同步镜像（既有模式）：捕获快照要读最新值，不重渲染消费方。
  // eslint-disable-next-line react-hooks/refs
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
    coverSubtitleSpacing,
    userFontFamilies.join(','),
    fontRegistryRevision,
  ].join('|')

  // hydrateDocument 真身在持久化 hook 之后定义（要写 hook 返回的
  // documentRevisionRef / pendingSnapshotRef / dirtyDocumentRef /
  // setDraftStorageError），而 hook 的 bootstrap/打开/删除/导入又要调用它；
  // 以 ref 间接层解开声明顺序，包装身份恒定（同 documentStyleRef 的
  // 渲染期同步赋值模式）。
  const hydrateDocumentRef = useRef<
    ((document: EditorDocumentV2) => Promise<void>) | null
  >(null)
  const hydrateDocumentStable = useCallback(
    async (document: EditorDocumentV2) => {
      await hydrateDocumentRef.current?.(document)
    },
    [],
  )

  // 草稿持久化域抽在 useDraftPersistence（M7 拆分第四步）。
  const {
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
  } = useDraftPersistence({
    editorRef,
    documentStyleRef,
    publicationRef,
    activeDraftRef,
    writerLeaseState,
    editorReady,
    content,
    documentStyle,
    publication,
    hydrateDocument: hydrateDocumentStable,
    resourceOperationRevisionRef,
    setResourceRetrying,
    recordRecentAction,
  })

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
    setCoverLayout(document.style.coverLayout)
    setCoverVertical(document.style.coverVertical)
    setCoverSubtitleSpacing(document.style.coverSubtitleSpacing)
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
    // 资源域/持久化域句柄来自两个 M7 hook，均为 useRef/useState 恒定身份；deps 原样保留。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replaceResourceIssueScope])
  // 渲染期同步指向真身（同 documentStyleRef 的镜像模式）。
  // eslint-disable-next-line react-hooks/refs
  hydrateDocumentRef.current = hydrateDocument

  // 身份必须稳定（deps 为空）：Editor 侧有一个「回调变化时重放当前
  // HTML」的挂载 effect，此前本回调依赖 draftReady/writerLeaseState，
  // bootstrap 完成的翻转会让重放落在非 hydrating 窗口，把纯打开的
  // 草稿误标为 dirty（R5 冗余落盘的根因）。改读 ref 后重放不再发生，
  // 闭包新鲜度也不再依赖 Tiptap 每渲染刷新 handler 的行为。
  const draftReadyRef = useRef(false)
  useEffect(() => {
    draftReadyRef.current = draftReady
  }, [draftReady])
  const writerLeaseStateRef = useRef(writerLeaseState)
  useEffect(() => {
    writerLeaseStateRef.current = writerLeaseState
  }, [writerLeaseState])

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
      draftReadyRef.current &&
      writerLeaseStateRef.current === 'owned' &&
      !hydratingDocumentRef.current
    ) {
      dirtyDocumentRef.current = true
    }
    // 资源域/持久化域句柄来自两个 M7 hook，均为 useRef/useState 恒定身份；deps 原样保留。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  // 单可写标签页仲裁抽在 useWriterLease（M7 拆分第一步）。

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
    setCoverLayout(theme.coverLayout)
    setCoverVertical(theme.coverVertical)
    setCoverSubtitleSpacing(theme.coverSubtitleSpacing)
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
    } else if (theme.id === PUBLIC_EXAM_THEME.id) {
      // 默认教程状态下切公考：首页整页换成版式 A 示例封面
      //（2026-08-14 用户拍板；正文被改过则一字不动）
      const swapped = replaceDefaultTutorialCoverHtml(content, DEFAULT_CONTENT)
      if (swapped !== null) editorRef.current?.setContent(swapped)
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
      coverLayout,
      coverVertical,
      coverSubtitleSpacing,
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

  function handleCoverLayout(nextLayout: CoverLayout) {
    const swapped = replaceCoverLayoutExampleHtml(content, nextLayout)
    if (swapped !== null) {
      editorRef.current?.setContent(swapped)
      customize(setCoverVertical)(COVER_LAYOUT_EXAMPLES[nextLayout].vertical)
    }
    customize(setCoverLayout)(nextLayout)
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

  // P3：中央画布每页都接收这几个回调；Preview 已 memo，回调身份必须稳定。
  const handleSelectCanvasImage = useCallback((imageId: string) => {
    editorRef.current?.selectImageById(imageId)
  }, [])

  const handleClearCanvasSelection = useCallback(() => {
    editorRef.current?.clearSelection()
  }, [])

  const handleCommitCanvasImage = useCallback(
    (
      imageId: string,
      patch: { width?: string | null; align?: ImageAlign },
      actionLabel: string,
    ): boolean => {
      const committed =
        editorRef.current?.commitImageAttributes(imageId, patch) ?? false
      if (committed) recordRecentAction(actionLabel)
      return committed
    },
    [recordRecentAction],
  )

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

  // CSS var 注入抽在 useThemeCssVars（M7 拆分第二步）
  useThemeCssVars({
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
  })

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

  // 导出编排抽为 runExport 纯函数（M7 拆分第五步）；
  // 此处只收集当前状态做薄壳转发，闸门与交付语义都在 runExport 内。
  async function handleExport(
    request: ExportRequest,
    onProgress: (current: number, total: number) => void,
    options?: { skipReadiness?: boolean; allowLayoutWarnings?: boolean },
  ) {
    await runExport(request, onProgress, options, {
      canvasGestureActive,
      themeApplying,
      pageElements: pageRefs.current,
      pageCount: pages.length,
      selectedFontStacks: [fontH1, fontH2, fontH3, fontBody],
      resourceIssues,
      logoStrategy,
      ensureUserFontsLoaded,
      recordRecentAction,
    })
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
              {/* getPageRefCallback 渲染期读回调缓存 ref 是 P3 既有设计（见其定义处注释）。 */}
              {/* eslint-disable-next-line react-hooks/refs */}
              {pages.map((pageHtml, index) => (
                <Preview
                  key={index}
                  ref={getPageRefCallback(index)}
                  html={pageHtml}
                  themeClass={themeClass}
                  coverLayout={coverLayout}
                  coverVertical={coverVertical}
                  coverSubtitleSpacing={coverSubtitleSpacing}
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
                  onClearSelection={handleClearCanvasSelection}
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
              coverLayout={coverLayout}
              coverVertical={coverVertical}
              coverSubtitleSpacing={coverSubtitleSpacing}
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
              onCoverLayout={handleCoverLayout}
              onCoverVertical={customize(setCoverVertical)}
              onCoverSubtitleSpacing={customize(setCoverSubtitleSpacing)}
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
