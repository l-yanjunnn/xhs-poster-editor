import {
  collectLayoutFontRequests,
  DEFAULT_SYSTEM_LAYOUT_FONT_FAMILIES,
  validateLayoutFontRequests,
} from './deterministicFontReadiness'

export type ExportResourceIssueKind = 'image' | 'font' | 'layout'

export interface ExportResourceIssue {
  kind: ExportResourceIssueKind
  label: string
  message: string
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

function imageLabel(image: HTMLImageElement, index: number): string {
  return (
    image.alt.trim() ||
    image.dataset.assetId ||
    image.dataset.imageId ||
    `第 ${index + 1} 张图片`
  )
}

async function checkImage(
  image: HTMLImageElement,
  index: number,
  timeoutMs: number,
): Promise<ExportResourceIssue | null> {
  if (image.complete) {
    return image.naturalWidth > 0
      ? null
      : {
          kind: 'image',
          label: imageLabel(image, index),
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
    label: imageLabel(image, index),
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
  const images = Array.from(
    new Set(
      pages.flatMap((page) =>
        Array.from(page.querySelectorAll<HTMLImageElement>('img')),
      ),
    ),
  )
  const imageIssues = (
    await Promise.all(
      images.map((image, index) => checkImage(image, index, imageTimeoutMs)),
    )
  ).filter((issue): issue is ExportResourceIssue => issue !== null)

  const issues = [...imageIssues]

  for (const [index, page] of pages.entries()) {
    const state = page.dataset.layoutState
    const issueCount = Number(page.dataset.layoutIssueCount ?? '0')
    const hasSnapshot = Boolean(page.dataset.layoutSnapshot)
    const sealed = page.dataset.layoutSnapshotPhase === 'sealed'
    if (state === 'ready' && issueCount === 0 && hasSnapshot && sealed) continue
    let detail = ''
    try {
      const parsed = JSON.parse(page.dataset.layoutIssues ?? '[]') as Array<{
        message?: string
      }>
      detail = parsed.find((item) => item.message)?.message ?? ''
    } catch {
      // 历史页面没有结构化 issue 时使用下方状态文案。
    }
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
    const explicitPageNumber = Number(page.dataset.pageNumber)
    const pageNumber =
      Number.isSafeInteger(explicitPageNumber) && explicitPageNumber > 0
        ? explicitPageNumber
        : index + 1
    issues.push({
      kind: 'layout',
      label: `第 ${pageNumber} 页排版`,
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

export async function assertExportReadiness(
  pages: HTMLElement[],
  options?: ReadinessOptions,
): Promise<void> {
  const issues = await checkExportReadiness(pages, options)
  if (issues.length > 0) throw new ExportReadinessError(issues)
}
