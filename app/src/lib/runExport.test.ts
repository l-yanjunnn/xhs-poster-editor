import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExportRequest } from '@/components/ExportDialog/ExportDialog'
import { EXPORT_DELIVERY_MODE } from './exportPlan'
import { checkExportReadiness } from './exportReadiness'
import { SYSTEM_FONT_STACK } from './fontPresets'
import { prepareVerifiedExport } from './verifiedExport'
import { runExport, type RunExportContext } from './runExport'

vi.mock('./verifiedExport', () => ({
  prepareVerifiedExport: vi.fn(async () => ({ assertCurrent: vi.fn() })),
}))
vi.mock('./exportReadiness', async (importOriginal) => ({
  ...await importOriginal<typeof import('./exportReadiness')>(),
  checkExportReadiness: vi.fn(async () => []),
}))

const coverFamily = 'Cover Upload'

function context(coverHtml = '<h1>封面标题</h1>'): RunExportContext {
  const pages = [coverHtml, '<h1>内页标题</h1>'].map((html) => {
    const page = document.createElement('div')
    page.className = 'page'
    page.innerHTML = `<div class="content">${html}</div>`
    document.body.append(page)
    return page
  })
  return {
    canvasGestureActive: false,
    themeApplying: false,
    pageElements: pages,
    pageCount: 2,
    selectedFontStacks: Array(4).fill(SYSTEM_FONT_STACK),
    coverTitleFontFamily: `"${coverFamily}", sans-serif`,
    resourceIssues: [],
    logoStrategy: 'none',
    ensureUserFontsLoaded: vi.fn(async () => ({ families: [], failedFamilies: [] })),
    recordRecentAction: vi.fn(),
  }
}

function request(selectedPages: number[]): ExportRequest {
  return {
    prepareOnly: true,
    filename: '封面字体范围',
    selectedPages,
    deliveryMode: EXPORT_DELIVERY_MODE.COMPATIBILITY_ZIP,
    collisionIndex: 1,
    zipFileName: '封面字体范围.zip',
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue({} as CanvasRenderingContext2D)
})

afterEach(() => {
  document.body.replaceChildren()
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('runExport cover-only font readiness', () => {
  it.each(['failed', 'throw'] as const)('exports only inner pages when the cover-only font %s', async (failure) => {
    const value = context()
    value.ensureUserFontsLoaded = failure === 'failed'
      ? vi.fn(async () => ({ families: [], failedFamilies: [coverFamily] }))
      : vi.fn(async () => { throw new Error('字体库读取失败') })

    await expect(runExport(request([2]), vi.fn(), undefined, value)).resolves.toBeDefined()
    expect(checkExportReadiness).toHaveBeenCalledWith([value.pageElements[1]])
    expect(prepareVerifiedExport).toHaveBeenCalledOnce()
  })

  it.each([
    { failure: 'failed', pages: [1] },
    { failure: 'throw', pages: [1] },
    { failure: 'failed', pages: [1, 2] },
    { failure: 'throw', pages: [1, 2] },
  ])('blocks $pages when its cover font $failure', async ({ failure, pages }) => {
    const value = context()
    value.ensureUserFontsLoaded = failure === 'failed'
      ? vi.fn(async () => ({ families: [], failedFamilies: [coverFamily] }))
      : vi.fn(async () => { throw new Error('字体库读取失败') })

    await expect(runExport(request(pages), vi.fn(), undefined, value)).rejects.toMatchObject({
      name: 'ExportReadinessError',
      issues: expect.arrayContaining([expect.objectContaining({
        kind: 'font',
        label: failure === 'failed' ? coverFamily : '我的字体',
      })]),
    })
    expect(prepareVerifiedExport).not.toHaveBeenCalled()
  })

  it.each(['<p>无主标题封面</p>', '<blockquote><h1>嵌套标题</h1></blockquote>'])('ignores the cover font when no top-level H1 uses it: %s', async (coverHtml) => {
    const value = context(coverHtml)
    value.ensureUserFontsLoaded = vi.fn(async () => ({ families: [], failedFamilies: [coverFamily] }))

    await expect(runExport(request([1]), vi.fn(), undefined, value)).resolves.toBeDefined()
    expect(prepareVerifiedExport).toHaveBeenCalledOnce()
  })

  it('scopes known cover-font failures to exports containing the cover title', async () => {
    const value = context()
    value.resourceIssues = [{ id: `font:${coverFamily}`, scope: 'font', label: coverFamily, message: '字体恢复失败' }]

    await expect(runExport(request([2]), vi.fn(), undefined, value)).resolves.toBeDefined()
    await expect(runExport(request([1]), vi.fn(), undefined, value)).rejects.toMatchObject({
      name: 'ExportReadinessError',
      issues: [expect.objectContaining({ kind: 'font', label: coverFamily })],
    })
    expect(prepareVerifiedExport).toHaveBeenCalledOnce()
  })
})
