import type { ExportRequest } from '@/components/ExportDialog/ExportDialog'
import {
  hasBlockingDeterministicLayoutIssues,
  readDeterministicLayoutIssues,
} from '@/lib/deterministicTypography'
import {
  executeDirectoryExport,
  executeZipExport,
  resumeDirectoryExport,
} from '@/lib/exportDelivery'
import {
  EXPORT_DELIVERY_MODE,
  createFolderExportPlan,
} from '@/lib/exportPlan'
import {
  assertNoBlockingExportIssues,
  checkExportReadiness,
} from '@/lib/exportReadiness'
import { BODY_FONTS, DISPLAY_FONTS } from '@/lib/fontPresets'
import type { UserFontLoadReport } from '@/lib/fontRegistry'
import type { LogoStrategy } from '@/lib/themes'
import {
  resourceErrorMessage,
  type AppResourceIssue,
} from '@/lib/useResourceRecovery'

const BUILTIN_FONT_STACKS = new Set(
  [...DISPLAY_FONTS, ...BODY_FONTS].map((font) => font.value),
)

function primaryFontFamily(stack: string): string {
  return stack
    .split(',')[0]
    .trim()
    .replace(/^["']|["']$/g, '')
}

export interface RunExportOptions {
  skipReadiness?: boolean
  allowLayoutWarnings?: boolean
}

export interface RunExportContext {
  canvasGestureActive: boolean
  themeApplying: boolean
  /** App 的 pageRefs.current：与渲染中的 .page DOM 同一数组引用 */
  pageElements: ReadonlyArray<HTMLDivElement | null>
  pageCount: number
  /** 当前选中的字体栈：[fontH1, fontH2, fontH3, fontBody] */
  selectedFontStacks: string[]
  resourceIssues: readonly AppResourceIssue[]
  logoStrategy: LogoStrategy
  ensureUserFontsLoaded: () => Promise<UserFontLoadReport>
  recordRecentAction: (label: string) => void
}

/**
 * 导出编排纯函数：预检（字体恢复 / Canvas 探针 / 已知资源问题 / DOM 就绪）、
 * 门控（blocking 永不可绕过，warning 需用户确认强制导出）、目录 / 续写 /
 * ZIP 三条交付路径。App 的 handleExport 只负责收集状态后调用。
 *
 * （M7 拆分第五步：逻辑自 App.tsx 的 handleExport 原样抽出，行为零变化。）
 */
export async function runExport(
  request: ExportRequest,
  onProgress: (current: number, total: number) => void,
  options: RunExportOptions | undefined,
  context: RunExportContext,
): Promise<void> {
  const {
    canvasGestureActive,
    themeApplying,
    pageElements,
    pageCount,
    selectedFontStacks,
    resourceIssues,
    logoStrategy,
    ensureUserFontsLoaded,
    recordRecentAction,
  } = context

  if (canvasGestureActive || themeApplying) {
    throw new Error(
      canvasGestureActive
        ? '请先结束当前图片拖动，再导出成品'
        : '主题资源仍在载入，请稍候再导出',
    )
  }
  const allPageElements = pageElements
    .slice(0, pageCount)
    .filter(
      (el): el is HTMLDivElement => el !== null && el.isConnected,
    )
  if (allPageElements.length !== pageCount) {
    throw new Error('画布仍在更新，请稍候再试')
  }
  const exportedAt = new Date()
  const plan = request.resumeToken?.plan ?? createFolderExportPlan({
    sourceName: request.filename,
    pageCount,
    selectedPages: request.selectedPages,
    exportedAt,
    collisionIndex: request.collisionIndex,
    deliveryMode: request.deliveryMode,
  })
  const selectedElements = plan.pages.map(
    (pageNumber) => allPageElements[pageNumber - 1],
  )
  if (!options?.skipReadiness) {
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
    // 门控判定与 exportReadiness 共用同一实现：blocking 永不可绕过；
    // warning（如 unsatisfied-line）需要用户在弹窗里明确确认
    // 「按当前预览强制导出」后才放行。
    assertNoBlockingExportIssues(issues, {
      allowWarnings: options?.allowLayoutWarnings,
    })
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
        pageCount,
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
        pageCount,
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
