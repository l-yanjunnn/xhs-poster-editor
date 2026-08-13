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
import type { ResourceIssue } from '@/components/Inspector/ContextInspector'
import {
  loadAllUserFontsWithReport,
  type UserFontLoadReport,
} from '@/lib/fontRegistry'
import {
  resolvePageBackgrounds,
  type PageBackgroundIssue,
  type PageBackgroundRole,
} from '@/lib/pageBackgrounds'
import {
  collectResolvedContentImageSources,
  resolveAssetSrcWithStatus,
  resolveContentImagesWithReport,
} from '@/lib/resolveAsset'
import { listUserThemes } from '@/lib/themeStore'
import type { Theme } from '@/lib/themes'

export type ResourceIssueScope = 'document' | 'font' | 'library'

export interface AppResourceIssue extends ResourceIssue {
  scope: ResourceIssueScope
  backgroundRole?: PageBackgroundRole
}

export interface PageBackgroundState {
  coverAssetId: string
  innerAssetId: string
  coverSrc: string
  innerSrc: string
}

export function resourceErrorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : '本地资源读取失败'
}

export function pageBackgroundIssues(
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

export interface ResourceRecoveryInput {
  editorRef: RefObject<EditorHandle | null>
  /** 活动草稿身份 ref（App 持有）；本域只读取 id 做异步过期判定 */
  activeDraftRef: { readonly current: { readonly id: string } | null }
  /** 当前背景/Logo 资产 id：与 App 的 pageBackground/logo state 每次渲染同步传入 */
  coverAssetId: string
  bgAssetId: string
  logoAssetId: string
  /**
   * 与 applyTheme 共享的主题应用失效组合（= themeApplyRevisionRef.current += 1
   * 加 setThemeApplying(false)），以回调注入，hook 不直接持有 App 侧主题应用句柄。
   */
  invalidateThemeApply: () => void
  setPageBackground: Dispatch<SetStateAction<PageBackgroundState>>
  setLogoSrc: Dispatch<SetStateAction<string>>
  setUserThemes: Dispatch<SetStateAction<Theme[]>>
  setUserFontFamilies: Dispatch<SetStateAction<string[]>>
  recordRecentAction: (label: string) => void
}

export interface ResourceRecoveryHandle {
  resourceIssues: AppResourceIssue[]
  resourceRetrying: boolean
  setResourceIssues: Dispatch<SetStateAction<AppResourceIssue[]>>
  setResourceRetrying: Dispatch<SetStateAction<boolean>>
  resourceOperationRevisionRef: RefObject<number>
  fontRestorePromiseRef: RefObject<Promise<UserFontLoadReport> | null>
  replaceResourceIssueScope: (
    scope: ResourceIssueScope,
    issues: AppResourceIssue[],
  ) => void
  ensureUserFontsLoaded: () => Promise<UserFontLoadReport>
  reloadUserFonts: () => Promise<void>
  reloadUserThemes: () => Promise<void>
  retryResources: (backgroundRole?: PageBackgroundRole) => Promise<void>
}

/**
 * 资源恢复域：用户字体/主题库载入、页面背景与 Logo/正文插图的失败记录与重试。
 * 恢复类异步操作以 resourceOperationRevisionRef + 草稿 id 做过期判定，
 * 任何更晚的主题应用、草稿切换或重试都会使旧请求的结果作废。
 *
 * （M7 拆分第三步：逻辑自 App.tsx 原样抽出，行为零变化。）
 */
export function useResourceRecovery(
  input: ResourceRecoveryInput,
): ResourceRecoveryHandle {
  const {
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
  } = input

  const [resourceIssues, setResourceIssues] = useState<AppResourceIssue[]>([])
  const [resourceRetrying, setResourceRetrying] = useState(false)
  const resourceOperationRevisionRef = useRef(0)
  const fontRestorePromiseRef = useRef<Promise<UserFontLoadReport> | null>(null)

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
  }, [replaceResourceIssueScope, setUserFontFamilies])

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
  }, [ensureUserFontsLoaded, replaceResourceIssueScope, setUserThemes])

  const reloadUserFonts = useCallback(async () => {
    fontRestorePromiseRef.current = null
    await ensureUserFontsLoaded()
  }, [ensureUserFontsLoaded])

  const reloadUserThemes = useCallback(async () => {
    setUserThemes(await listUserThemes())
    replaceResourceIssueScope('library', [])
  }, [replaceResourceIssueScope, setUserThemes])

  async function retryPageBackground(backgroundRole: PageBackgroundRole) {
    if (resourceRetrying) return
    invalidateThemeApply()
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
    invalidateThemeApply()
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

  return {
    resourceIssues,
    resourceRetrying,
    setResourceIssues,
    setResourceRetrying,
    resourceOperationRevisionRef,
    fontRestorePromiseRef,
    replaceResourceIssueScope,
    ensureUserFontsLoaded,
    reloadUserFonts,
    reloadUserThemes,
    retryResources,
  }
}
