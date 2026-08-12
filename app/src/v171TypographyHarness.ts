import '@fontsource/noto-sans-sc/400.css'
import '@fontsource/noto-sans-sc/700.css'
import '@fontsource/noto-serif-sc/700.css'
import './index.css'
import './styles/canvas.css'
import './v171TypographyHarness.css'
import fixtureHtml from '../../tools/export-race-repro/fixtures/v171-typography-regression.html?raw'
import {
  checkDeterministicFontReadiness,
  DEFAULT_SYSTEM_LAYOUT_FONT_FAMILIES,
} from './lib/deterministicFontReadiness'
import {
  materializeDeterministicTypography,
  sealDeterministicTypographySnapshot,
} from './lib/deterministicTypography'
import { pageToPngCanvas } from './lib/exportPng'
import { analyzeImportDocument } from './lib/importDocument'
import { calibratePageTypography } from './lib/opticalTypography'
import { splitIntoPages } from './lib/splitPages'

const previewPages = document.querySelector<HTMLElement>('#preview-pages')!
const exportCanvases = document.querySelector<HTMLElement>(
  '#export-canvases',
)!
const status = document.querySelector<HTMLOutputElement>('#harness-status')!
const renderButton = document.querySelector<HTMLButtonElement>(
  '#render-export',
)!
const loadRealButton = document.querySelector<HTMLButtonElement>('#load-real')!
const realSource = document.querySelector<HTMLTextAreaElement>('#real-source')!
const captureMode = new URLSearchParams(window.location.search).get('capture')
const capturePage = Math.max(
  1,
  Number(new URLSearchParams(window.location.search).get('page')) || 1,
)
if (captureMode === 'preview' || captureMode === 'export') {
  document.body.classList.add('harness-capture', `harness-capture--${captureMode}`)
}

interface HarnessPage {
  page: HTMLElement
  sourceHtml: string
}

interface HarnessExportRecord {
  page: number
  sourceSnapshot: string
  canvasSnapshot: string
  snapshotMatch: boolean
  baselineHash: string
  renderHash: string
  width: number
  height: number
  status: 'passed'
}

declare global {
  interface Window {
    __v171ExportEvidence?: {
      capturedAt: string
      userAgent: string
      sourceSha256: string
      sourceCharacters: number
      pageCount: number
      passedCount: number
      records: HarnessExportRecord[]
    }
    __v171DownloadPng?: (pageNumber?: number) => Promise<string>
  }
}

let pages: HarnessPage[] = []

function canvasDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png')
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

function mountPages(sources: string[], sourceIndexOffset = 0) {
  previewPages.replaceChildren()
  exportCanvases.replaceChildren()
  pages = sources.map((sourceHtml, index) => {
    const sourceIndex = sourceIndexOffset + index
    const shell = document.createElement('div')
    shell.className = 'harness-page-shell'
    const page = document.createElement('div')
    page.className = [
      'page',
      'theme-public-exam-landscape',
      sourceIndex === 0 ? 'page--first' : '',
    ]
      .filter(Boolean)
      .join(' ')
    page.dataset.harnessPage = String(sourceIndex + 1)
    const content = document.createElement('div')
    content.className = 'content'
    page.appendChild(content)
    shell.appendChild(page)
    previewPages.appendChild(shell)
    materializeDeterministicTypography(page, {
      sourceHtml,
      state: 'pending',
    })
    return { page, sourceHtml }
  })
}

async function preparePages() {
  for (const item of pages) {
    const fonts = await checkDeterministicFontReadiness(item.page, {
      timeoutMs: 5_000,
      allowlistedFamilies: DEFAULT_SYSTEM_LAYOUT_FONT_FAMILIES,
    })
    if (!fonts.ok) {
      throw new Error(fonts.issues.map((issue) => issue.message).join('；'))
    }
    let markerGeometryStable = false
    for (let pass = 0; pass < 2; pass += 1) {
      const result = materializeDeterministicTypography(item.page, {
        sourceHtml: item.sourceHtml,
        state: 'pending',
      })
      if (result.issues.length > 0) {
        throw new Error(
          result.issues.map((issue) => issue.message).join('；'),
        )
      }
      const markerGeometryBefore =
        item.page.dataset.layoutListMarkerGeometry ?? '[]'
      const calibration = await calibratePageTypography(item.page, {
        fontTimeoutMs: 5_000,
        recalibrateOnLateFonts: false,
      })
      if (calibration.status !== 'ready') {
        throw new Error(
          calibration.fontIssues
            .map((issue) => `${issue.font} ${issue.reason}`)
            .join('；'),
        )
      }
      markerGeometryStable =
        (item.page.dataset.layoutListMarkerGeometry ?? '[]') ===
        markerGeometryBefore
      if (markerGeometryStable) break
    }
    if (!markerGeometryStable) {
      throw new Error('列表序号字体就绪后列宽仍不稳定')
    }
    sealDeterministicTypographySnapshot(item.page)
    item.page.dataset.layoutState = 'ready'
  }
  status.value = `已就绪：${pages.length} 页共享快照`
}

const fixtureSources = splitIntoPages(fixtureHtml)
if (captureMode === 'preview' || captureMode === 'export') {
  const sourceIndex = Math.min(fixtureSources.length, capturePage) - 1
  mountPages([fixtureSources[sourceIndex]], sourceIndex)
} else {
  mountPages(fixtureSources)
}

loadRealButton.addEventListener('click', () => {
  loadRealButton.disabled = true
  renderButton.disabled = true
  status.value = '正在解析真实文稿…'
  void (async () => {
    const analysis = analyzeImportDocument(realSource.value, {
      sourceName: 'V1.7.1 真实 19 页回归',
    })
    if (analysis.pageCount !== 19) {
      throw new Error(`期望 19 页，实际解析为 ${analysis.pageCount} 页`)
    }
    mountPages(analysis.pages.map((page) => page.html))
    await preparePages()
    status.value = `真实文稿已就绪：${pages.length} 页共享快照`
  })()
    .catch((error: unknown) => {
      status.value = `真实文稿失败：${error instanceof Error ? error.message : String(error)}`
    })
    .finally(() => {
      loadRealButton.disabled = false
      renderButton.disabled = false
    })
})

async function renderExportCanvases() {
  renderButton.disabled = true
  status.value = '正在生成 2160×3600 PNG 画布…'
  try {
    exportCanvases.replaceChildren()
    const records: HarnessExportRecord[] = []
    const retainedPages =
      pages.length > 6
        ? new Set([0, 1, 2, 4, pages.length - 1])
        : new Set(pages.map((_, index) => index))
    for (const [index, { page }] of pages.entries()) {
      status.value = `正在生成第 ${index + 1}/${pages.length} 张 2160×3600 PNG 画布…`
      const canvas = await pageToPngCanvas(page)
      if (canvas.width !== 2160 || canvas.height !== 3600) {
        throw new Error(`第 ${index + 1} 张尺寸错误：${canvas.width}×${canvas.height}`)
      }
      const harnessPage = Number(page.dataset.harnessPage ?? index + 1)
      const sourceSnapshot = page.dataset.layoutSnapshot ?? ''
      const canvasSnapshot = canvas.dataset.layoutSnapshot ?? ''
      records.push({
        page: harnessPage,
        sourceSnapshot,
        canvasSnapshot,
        snapshotMatch: sourceSnapshot === canvasSnapshot,
        baselineHash: canvas.dataset.layoutExportBaselineHash ?? '',
        renderHash: canvas.dataset.layoutRenderHash ?? '',
        width: canvas.width,
        height: canvas.height,
        status: 'passed',
      })
      if (retainedPages.has(index)) {
        const figure = document.createElement('figure')
        figure.className = 'harness-export-item'
        const caption = document.createElement('figcaption')
        caption.textContent = `第 ${harnessPage} 页 · 2160×3600`
        const saveButton = document.createElement('button')
        saveButton.className = 'harness-save-png'
        saveButton.type = 'button'
        saveButton.textContent = `保存第 ${harnessPage} 页原尺寸 PNG`
        saveButton.addEventListener('click', () => {
          saveButton.disabled = true
          canvas.toBlob((blob) => {
            if (!blob) {
              status.value = `第 ${harnessPage} 页 PNG 编码失败`
              saveButton.disabled = false
              return
            }
            const url = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = `v171-page-${String(harnessPage).padStart(2, '0')}-2160x3600.png`
            link.click()
            window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
            saveButton.disabled = false
          }, 'image/png')
        })
        canvas.className = 'harness-export-canvas'
        canvas.style.width = '432px'
        canvas.style.height = '720px'
        canvas.dataset.harnessPage = String(harnessPage)
        figure.append(caption, canvas, saveButton)
        exportCanvases.appendChild(figure)
      }
    }
    window.__v171DownloadPng = async (pageNumber = capturePage) => {
      const canvas = Array.from(
        exportCanvases.querySelectorAll<HTMLCanvasElement>('canvas'),
      ).find(
        (item) => Number(item.dataset.harnessPage) === pageNumber,
      )
      if (!canvas) {
        throw new Error(`未保留第 ${pageNumber} 页导出画布`)
      }
      return canvasDataUrl(canvas)
    }
    if (records.some((record) => !record.snapshotMatch)) {
      throw new Error('预览与导出快照 ID 不一致')
    }
    const source = pages.map((item) => item.sourceHtml).join('\n<!-- page -->\n')
    const evidence = {
      capturedAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      sourceSha256: await sha256(source),
      sourceCharacters: source.length,
      pageCount: pages.length,
      passedCount: records.length,
      records,
    }
    window.__v171ExportEvidence = evidence
    document.documentElement.dataset.v171ExportEvidence = JSON.stringify(evidence)
    status.value = `导出完成：${pages.length}/${pages.length} 张，快照逐页一致；页面 ${[...retainedPages].map((index) => index + 1).join('、')} 保留可视样本`
  } finally {
    renderButton.disabled = false
  }
}

void preparePages()
  .then(async () => {
    if (captureMode === 'export') await renderExportCanvases()
  })
  .catch((error: unknown) => {
    status.value = `预检失败：${error instanceof Error ? error.message : String(error)}`
    renderButton.disabled = true
  })

renderButton.addEventListener('click', () => {
  void renderExportCanvases().catch((error: unknown) => {
    status.value = `导出失败：${error instanceof Error ? error.message : String(error)}`
  })
})
