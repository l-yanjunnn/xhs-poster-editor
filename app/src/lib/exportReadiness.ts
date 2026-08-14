import {
  collectLayoutFontRequests,
  DEFAULT_SYSTEM_LAYOUT_FONT_FAMILIES,
  validateLayoutFontRequests,
} from './deterministicFontReadiness'
import {
  hasBlockingDeterministicLayoutIssues,
  readDeterministicLayoutIssues,
} from './deterministicTypography'

export type ExportResourceIssueKind = 'image' | 'font' | 'layout'

export type ExportIssueSeverity = 'warning' | 'blocking'

export interface ExportResourceIssue {
  kind: ExportResourceIssueKind
  label: string
  message: string
  /** 缺省视为 blocking；只有明确标记 warning 的项可被用户确认放行。 */
  severity?: ExportIssueSeverity
  pageNumber?: number
  code?: string
  blockIndex?: number
  blockText?: string
}

export function isBlockingExportIssue(issue: ExportResourceIssue): boolean {
  return issue.severity !== 'warning'
}

export class ExportReadinessError extends Error {
  readonly issues: ExportResourceIssue[]

  constructor(issues: ExportResourceIssue[]) {
    super(`有 ${issues.length} 项资源尚未就绪`)
    this.name = 'ExportReadinessError'
    this.issues = issues
  }
}

interface ReadinessOptions {
  imageTimeoutMs?: number
  fontTimeoutMs?: number
}

function waitForTimeout(ms: number): Promise<'timeout'> {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve('timeout'), ms)
  })
}

function imageLabel(
  image: HTMLImageElement,
  pageNumber: string,
  indexInPage: number,
): string {
  return (
    image.alt.trim() ||
    image.dataset.assetId ||
    image.dataset.imageId ||
    // 用户在预检弹窗里对照的是页码，跨页全局序号对不上（CODE-REVIEW R8）
    `第 ${pageNumber} 页第 ${indexInPage + 1} 张图片`
  )
}

async function checkImage(
  image: HTMLImageElement,
  label: string,
  timeoutMs: number,
): Promise<ExportResourceIssue | null> {
  if (image.complete) {
    return image.naturalWidth > 0
      ? null
      : {
          kind: 'image',
          label,
          message: '图片载入失败或素材已经被删除',
        }
  }

  const result = await new Promise<'loaded' | 'failed' | 'timeout'>((resolve) => {
    const finish = (value: 'loaded' | 'failed' | 'timeout') => {
      window.clearTimeout(timer)
      image.removeEventListener('load', handleLoad)
      image.removeEventListener('error', handleError)
      resolve(value)
    }
    const handleLoad = () => finish('loaded')
    const handleError = () => finish('failed')
    const timer = window.setTimeout(() => finish('timeout'), timeoutMs)
    image.addEventListener('load', handleLoad, { once: true })
    image.addEventListener('error', handleError, { once: true })
  })
  if (result === 'loaded' && image.naturalWidth > 0) return null
  return {
    kind: 'image',
    label,
    message:
      result === 'timeout'
        ? `等待图片超过 ${Math.ceil(timeoutMs / 1000)} 秒`
        : '图片载入失败或素材已经被删除',
  }
}

export async function checkExportReadiness(
  pages: HTMLElement[],
  options: ReadinessOptions = {},
): Promise<ExportResourceIssue[]> {
  const imageTimeoutMs = options.imageTimeoutMs ?? 5_000
  const fontTimeoutMs = options.fontTimeoutMs ?? 5_000
  const seenImages = new Set<HTMLImageElement>()
  const imageEntries: { image: HTMLImageElement; label: string }[] = []
  pages.forEach((page, pageIndex) => {
    const pageNumber = page.dataset.pageNumber ?? String(pageIndex + 1)
    Array.from(page.querySelectorAll<HTMLImageElement>('img')).forEach(
      (image, indexInPage) => {
        if (seenImages.has(image)) return
        seenImages.add(image)
        imageEntries.push({
          image,
          label: imageLabel(image, pageNumber, indexInPage),
        })
      },
    )
  })
  const imageIssues = (
    await Promise.all(
      imageEntries.map(({ image, label }) =>
        checkImage(image, label, imageTimeoutMs),
      ),
    )
  ).filter((issue): issue is ExportResourceIssue => issue !== null)

  const issues = [...imageIssues]

  for (const [index, page] of pages.entries()) {
    const state = page.dataset.layoutState
    const issueCount = Number(page.dataset.layoutIssueCount ?? '0')
    const hasSnapshot = Boolean(page.dataset.layoutSnapshot)
    const sealed = page.dataset.layoutSnapshotPhase === 'sealed'
    if (state === 'ready' && issueCount === 0 && hasSnapshot && sealed) continue
    const explicitPageNumber = Number(page.dataset.pageNumber)
    const pageNumber =
      Number.isSafeInteger(explicitPageNumber) && explicitPageNumber > 0
        ? explicitPageNumber
        : index + 1
    const layoutIssues = readDeterministicLayoutIssues(page)

    // warning-only 且快照已封存的页面：逐条产出可确认放行的警告，
    // 携带段落定位信息；任何硬阻断或状态异常仍走下方 blocking 分支。
    if (
      state === 'ready-with-warnings' &&
      hasSnapshot &&
      sealed &&
      layoutIssues.length > 0 &&
      !hasBlockingDeterministicLayoutIssues(layoutIssues)
    ) {
      for (const issue of layoutIssues) {
        const location =
          issue.blockIndex >= 0
            ? `第 ${issue.blockIndex + 1} 段` +
              (issue.blockText ? `「${issue.blockText}」` : '')
            : ''
        issues.push({
          kind: 'layout',
          severity: 'warning',
          label: `第 ${pageNumber} 页排版`,
          message: location
            ? `${location}：${issue.message}`
            : issue.message,
          pageNumber,
          code: issue.code,
          blockIndex: issue.blockIndex,
          blockText: issue.blockText,
        })
      }
      continue
    }

    const detail = layoutIssues.find((item) => item.message)?.message ?? ''
    let fontDetail = ''
    if (state === 'font-error') {
      try {
        const parsed = JSON.parse(
          page.dataset.layoutFontIssues ?? '[]',
        ) as Array<{ message?: string }>
        fontDetail = parsed.find((item) => item.message)?.message ?? ''
      } catch {
        // 旧页面没有结构化字体错误时使用明确的兜底文案。
      }
    }
    issues.push({
      kind: 'layout',
      severity: 'blocking',
      label: `第 ${pageNumber} 页排版`,
      pageNumber,
      message:
        fontDetail ||
        detail ||
        (state === 'font-error'
          ? '页面字体未能完成精确校验'
          : !state || !hasSnapshot || !sealed
            ? '确定性行布局快照尚未生成'
            : state === 'pending'
              ? '确定性行布局仍在生成，请稍候重试'
              : '行级布局无法在字距和标点约束内求解'),
    })
  }

  if (document.fonts) {
    const fontResult = await Promise.race([
      document.fonts.ready.then(() => 'ready' as const),
      waitForTimeout(fontTimeoutMs),
    ])
    if (fontResult === 'timeout') {
      issues.push({
        kind: 'font',
        label: '页面字体',
        message: `等待字体超过 ${Math.ceil(fontTimeoutMs / 1000)} 秒`,
      })
    }
  }

  const collected = pages.map((page) => collectLayoutFontRequests(page))
  issues.push(
    ...collected.flatMap(({ issues: fontIssues }) =>
      fontIssues.map((issue) => ({
        kind: 'font' as const,
        label: issue.label,
        message: issue.message,
      })),
    ),
  )
  const exactFonts = await validateLayoutFontRequests(
    collected.flatMap(({ requests }) => requests),
    {
      ownerDocument: document,
      timeoutMs: fontTimeoutMs,
      allowlistedFamilies: DEFAULT_SYSTEM_LAYOUT_FONT_FAMILIES,
    },
  )
  issues.push(
    ...exactFonts.issues.map((issue) => ({
      kind: 'font' as const,
      label: issue.label,
      message: issue.message,
    })),
  )
  return issues
}

/**
 * 唯一的预检门控实现：blocking 永不可绕过；warning（如 unsatisfied-line）
 * 只有在用户明确确认 allowWarnings 后才放行。App 导出闸门在调用前把
 * checkExportReadiness 之外的补充问题（Canvas 探针、已知资源问题、
 * 字体恢复失败）concat 进 issues，再统一走这一份判定。
 */
export function assertNoBlockingExportIssues(
  issues: ExportResourceIssue[],
  options?: { allowWarnings?: boolean },
): void {
  const blocking = issues.filter(isBlockingExportIssue)
  if (blocking.length > 0) throw new ExportReadinessError(issues)
  if (issues.length > 0 && !options?.allowWarnings) {
    throw new ExportReadinessError(issues)
  }
}
