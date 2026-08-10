export type ExportResourceIssueKind = 'image' | 'font'

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
  return issues
}

export async function assertExportReadiness(
  pages: HTMLElement[],
  options?: ReadinessOptions,
): Promise<void> {
  const issues = await checkExportReadiness(pages, options)
  if (issues.length > 0) throw new ExportReadinessError(issues)
}
