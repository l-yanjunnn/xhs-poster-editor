import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { calibratePageTypography } from './opticalTypography'
import { clearTypographyMetricsCache } from './typographyMetrics'

interface PageFixtureOptions {
  html: string
  scale?: number
  lineCount?: number
}

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
}

const PAGE_HEIGHT = 1800
const H2_TOP = 100
const H2_FONT_SIZE = 40
const H2_LINE_HEIGHT = 60
const H2_FIRST_BASELINE = 44

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function domRect(
  left: number,
  top: number,
  width: number,
  height: number,
): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect
}

function setDocumentFonts(
  fonts: Partial<FontFaceSet>,
  ownerDocument: Document = document,
): void {
  Object.defineProperty(ownerDocument, 'fonts', {
    configurable: true,
    value: fonts,
  })
}

function createPage({
  html,
  scale = 1,
  lineCount = 1,
}: PageFixtureOptions): HTMLElement {
  const page = document.createElement('div')
  page.className = 'page'
  page.dataset.testScale = String(scale)
  page.dataset.testLayoutHeight = String(PAGE_HEIGHT)
  page.style.height = `${PAGE_HEIGHT}px`
  page.innerHTML = `<div class="content">${html}</div>`
  Object.defineProperty(page, 'offsetHeight', {
    configurable: true,
    value: PAGE_HEIGHT,
  })

  for (const heading of page.querySelectorAll<HTMLElement>('h2')) {
    heading.dataset.testLineCount = String(lineCount)
    heading.style.fontFamily = '"Test Serif"'
    heading.style.fontSize = `${H2_FONT_SIZE}px`
    heading.style.fontWeight = '700'
    heading.style.lineHeight = `${H2_LINE_HEIGHT}px`
  }

  const content = page.querySelector<HTMLElement>('.content')!
  content.style.fontFamily = '"Test Sans"'
  content.style.fontSize = `${H2_FONT_SIZE}px`
  content.style.fontWeight = '400'
  content.style.lineHeight = `${H2_LINE_HEIGHT}px`
  document.body.append(page)
  return page
}

function installGeometryMock(): void {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function getMockRect(this: HTMLElement) {
      const page = this.classList.contains('page')
        ? this
        : this.closest<HTMLElement>('.page')
      if (!page) return domRect(0, 0, 0, 0)

      const scale = Number(page.dataset.testScale ?? 1)
      if (this === page) {
        return domRect(0, 0, 1080 * scale, PAGE_HEIGHT * scale)
      }

      const heading = this.matches('h2')
        ? this
        : this.closest<HTMLElement>('h2')
      if (!heading) return domRect(0, 0, 0, 0)
      const lineCount = Number(heading.dataset.testLineCount ?? 1)

      if (this.hasAttribute('data-optical-baseline-probe')) {
        const isLast =
          this.getAttribute('data-optical-baseline-probe') === 'last'
        const baseline =
          H2_FIRST_BASELINE +
          (isLast ? (lineCount - 1) * H2_LINE_HEIGHT : 0)
        return domRect(40 * scale, (H2_TOP + baseline) * scale, 0, 0)
      }

      return domRect(
        40 * scale,
        H2_TOP * scale,
        800 * scale,
        lineCount * H2_LINE_HEIGHT * scale,
      )
    },
  )
}

function installCanvasMetrics(): ReturnType<typeof vi.fn> {
  const measureText = vi.fn((text: string) => {
    const marker = /^[+-]?\d+\.$/u.test(text)
    return {
      width: marker ? 24 : 180,
      actualBoundingBoxAscent: marker ? 29 : 34,
      actualBoundingBoxDescent: marker ? 5 : 2,
      fontBoundingBoxAscent: 36,
      fontBoundingBoxDescent: 8,
    } as TextMetrics
  })
  const context = {
    font: '',
    textBaseline: 'alphabetic',
    measureText,
  } as unknown as CanvasRenderingContext2D

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    ((contextId: string) => (contextId === '2d' ? context : null)) as unknown as
      HTMLCanvasElement['getContext'],
  )
  return measureText
}

function directMarkerLabels(list: HTMLOListElement): string[] {
  return Array.from(list.children).map((item) => {
    const marker = Array.from(item.children).find((child) =>
      child.hasAttribute('data-optical-list-marker'),
    )
    return marker?.textContent ?? ''
  })
}

beforeEach(() => {
  clearTypographyMetricsCache()
  document.body.replaceChildren()
  setDocumentFonts({})
  installGeometryMock()
  installCanvasMetrics()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  clearTypographyMetricsCache()
  document.body.replaceChildren()
})

describe('H2 字形中线校准', () => {
  it('Preview scale=0.4 与导出 stage scale=1 产生相同 CSS 几何', async () => {
    const preview = createPage({ html: '<h2>提出对策题</h2>', scale: 0.4 })
    const stage = createPage({ html: '<h2>提出对策题</h2>', scale: 1 })

    await calibratePageTypography(preview, { includeLists: false })
    await calibratePageTypography(stage, { includeLists: false })

    const previewHeading = preview.querySelector<HTMLElement>('h2')!
    const stageHeading = stage.querySelector<HTMLElement>('h2')!
    expect(previewHeading.style.getPropertyValue('--h2-optical-center-y')).toBe(
      '28px',
    )
    expect(
      previewHeading.style.getPropertyValue('--h2-optical-bar-height'),
    ).toBe('36px')
    expect(stageHeading.style.getPropertyValue('--h2-optical-center-y')).toBe(
      previewHeading.style.getPropertyValue('--h2-optical-center-y'),
    )
    expect(
      stageHeading.style.getPropertyValue('--h2-optical-bar-height'),
    ).toBe(
      previewHeading.style.getPropertyValue('--h2-optical-bar-height'),
    )
  })

  it('两行标题用首行 baseline-ascent 到末行 baseline+descent 的联合 ink box', async () => {
    const page = createPage({
      html: '<h2>第一行<br>第二行</h2>',
      scale: 0.4,
      lineCount: 2,
    })

    const result = await calibratePageTypography(page, {
      includeLists: false,
    })

    const heading = page.querySelector<HTMLElement>('h2')!
    // top = 44 - 34 = 10; bottom = (44 + 60) + 2 = 106.
    expect(heading.style.getPropertyValue('--h2-optical-center-y')).toBe('58px')
    expect(heading.style.getPropertyValue('--h2-optical-bar-height')).toBe(
      '96px',
    )
    expect(heading.querySelector('[data-optical-baseline-probe]')).toBeNull()
    expect(result).toMatchObject({ status: 'ready', h2Count: 1 })
  })

  it('html2canvas 导出目标使用 Range.top + fontSize 的栅格 baseline 模型', async () => {
    const range = {
      setStart: vi.fn(),
      setEnd: vi.fn(),
      getClientRects: vi.fn(() => [
        domRect(40, H2_TOP + 8, 240, H2_LINE_HEIGHT),
      ]),
      detach: vi.fn(),
    } as unknown as Range
    const createRange = vi.spyOn(document, 'createRange').mockReturnValue(range)
    const page = createPage({ html: '<h2>提出对策题</h2>', scale: 1 })

    await calibratePageTypography(page, {
      includeLists: false,
      renderTarget: 'html2canvas',
    })

    const heading = page.querySelector<HTMLElement>('h2')!
    // html2canvas baseline = Range.top(8) + fontSize(40) = 48；
    // ink 中线 = (48 - 34 + 48 + 2) / 2 = 32。浏览器 probe 路径会得到 28。
    expect(heading.style.getPropertyValue('--h2-optical-center-y')).toBe('32px')
    expect(heading.style.getPropertyValue('--h2-optical-center-y')).not.toBe(
      '28px',
    )
    expect(heading.style.getPropertyValue('--h2-optical-bar-height')).toBe(
      '36px',
    )
    expect(createRange).toHaveBeenCalledTimes(1)
    expect(range.setStart).toHaveBeenCalledTimes(5)
    expect(range.setEnd).toHaveBeenCalledTimes(5)
    expect(range.getClientRects).toHaveBeenCalledTimes(5)
    expect(range.detach).toHaveBeenCalledTimes(1)
  })

  it('html2canvas 混排标题逐 grapheme 合并两种 baseline 的真实 ink box', async () => {
    const range = {
      setStart: vi.fn(),
      setEnd: vi.fn(),
      getClientRects: vi.fn(() => [
        domRect(40, H2_TOP + 8, 40, H2_LINE_HEIGHT),
      ]),
      detach: vi.fn(),
    } as unknown as Range
    vi.spyOn(document, 'createRange').mockReturnValue(range)

    const context = {
      font: '',
      textBaseline: 'alphabetic',
      measureText: vi.fn((text: string) => {
        if (!text.trim()) {
          return {
            width: 10,
            actualBoundingBoxAscent: 0,
            actualBoundingBoxDescent: 0,
          } as TextMetrics
        }
        const ideographic =
          /\p{Script=Han}/u.test(text) &&
          context.textBaseline === 'ideographic'
        return {
          width: 24,
          actualBoundingBoxAscent: ideographic ? 34 : 20,
          actualBoundingBoxDescent: ideographic ? 2 : 8,
        } as TextMetrics
      }),
    } as unknown as CanvasRenderingContext2D
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      ((contextId: string) =>
        contextId === '2d' ? context : null) as unknown as
        HTMLCanvasElement['getContext'],
    )

    const page = createPage({ html: '<h2>2026 国考</h2>', scale: 1 })
    const heading = page.querySelector<HTMLElement>('h2')!
    heading.style.letterSpacing = '0.4px'

    await calibratePageTypography(page, {
      includeLists: false,
      renderTarget: 'html2canvas',
    })

    // baseline = 8 + 40 = 48；CJK ink 为 [14, 50]，拉丁数字
    // ink 为 [28, 56]，联合后 [14, 56]，不能把整段都当 CJK。
    expect(heading.style.getPropertyValue('--h2-optical-center-y')).toBe('35px')
    expect(heading.style.getPropertyValue('--h2-optical-bar-height')).toBe(
      '42px',
    )
    expect(context.measureText).toHaveBeenCalledWith('2')
    expect(context.measureText).toHaveBeenCalledWith('国')
  })

  it('html2canvas 按行内 run 的实际字重与 Range.top 合并标题 ink', async () => {
    let activeNode: Node | null = null
    const range = {
      setStart: vi.fn((node: Node) => {
        activeNode = node
      }),
      setEnd: vi.fn(),
      getClientRects: vi.fn(() => {
        const strong = activeNode?.parentElement?.tagName === 'STRONG'
        return [
          domRect(
            40,
            H2_TOP + (strong ? 4 : 8),
            40,
            H2_LINE_HEIGHT,
          ),
        ]
      }),
      detach: vi.fn(),
    } as unknown as Range
    vi.spyOn(document, 'createRange').mockReturnValue(range)

    const context = {
      font: '',
      textBaseline: 'alphabetic',
      measureText: vi.fn(() => {
        const heavy = context.font.includes('900')
        return {
          width: 40,
          actualBoundingBoxAscent: heavy ? 38 : 34,
          actualBoundingBoxDescent: heavy ? 3 : 2,
        } as TextMetrics
      }),
    } as unknown as CanvasRenderingContext2D
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      ((contextId: string) =>
        contextId === '2d' ? context : null) as unknown as
        HTMLCanvasElement['getContext'],
    )

    const page = createPage({
      html: '<h2>提出<strong style="font-weight:900">对策题</strong></h2>',
      scale: 1,
    })
    const heading = page.querySelector<HTMLElement>('h2')!
    heading.style.letterSpacing = '0.4px'

    await calibratePageTypography(page, {
      includeLists: false,
      renderTarget: 'html2canvas',
    })

    // 普通 run: baseline 48, ink [14,50]；strong run: baseline 44,
    // ink [6,47]；同一行按真实 run union 为 [6,50]。
    expect(heading.style.getPropertyValue('--h2-optical-center-y')).toBe('28px')
    expect(heading.style.getPropertyValue('--h2-optical-bar-height')).toBe(
      '44px',
    )
    expect(context.font).toContain('900')
  })

  it('实际字体中线偏移 0.30em 时不被旧 0.25em 安全阈值截断', async () => {
    const range = {
      setStart: vi.fn(),
      setEnd: vi.fn(),
      getClientRects: vi.fn(() => [domRect(40, H2_TOP, 40, H2_LINE_HEIGHT)]),
      detach: vi.fn(),
    } as unknown as Range
    vi.spyOn(document, 'createRange').mockReturnValue(range)
    const context = {
      font: '',
      textBaseline: 'alphabetic',
      measureText: vi.fn(
        () =>
          ({
            width: 40,
            actualBoundingBoxAscent: 48,
            actualBoundingBoxDescent: 4,
          }) as TextMetrics,
      ),
    } as unknown as CanvasRenderingContext2D
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      ((contextId: string) =>
        contextId === '2d' ? context : null) as unknown as
        HTMLCanvasElement['getContext'],
    )
    const page = createPage({ html: '<h2>国考</h2>', scale: 1 })
    const heading = page.querySelector<HTMLElement>('h2')!
    heading.style.letterSpacing = '0.4px'

    await calibratePageTypography(page, {
      includeLists: false,
      renderTarget: 'html2canvas',
    })

    // baseline=40，ink=[-8,44]，center=18；相对 60px block 中线
    // 偏移 -12px（0.30em），应保留真实值而非被夹到 20px。
    expect(heading.style.getPropertyValue('--h2-optical-center-y')).toBe('18px')
    expect(heading.style.getPropertyValue('--h2-optical-bar-height')).toBe(
      '52px',
    )
  })
})

describe('有序列表运行时展示层', () => {
  it('列宽使用 Canvas advanceWidth，不受 Preview 中缩放后的 Range 宽度影响', async () => {
    const range = {
      setStart: vi.fn(),
      setEnd: vi.fn(),
      getClientRects: vi.fn(() => [domRect(0, 0, 9.6, 10)]),
      getBoundingClientRect: vi.fn(() => domRect(0, 0, 9.6, 10)),
      detach: vi.fn(),
    } as unknown as Range
    const createRange = vi.spyOn(document, 'createRange').mockReturnValue(range)
    const page = createPage({
      html: '<ol><li><p>概括核心问题</p></li></ol>',
      scale: 0.4,
    })

    await calibratePageTypography(page)

    const list = page.querySelector<HTMLOListElement>('ol')!
    expect(
      list.style.getPropertyValue('--optical-list-marker-column-width'),
    ).toBe('24px')
    expect(createRange).toHaveBeenCalledTimes(1)
    expect(range.getBoundingClientRect).not.toHaveBeenCalled()
  })

  it('复用 start/reversed/li[value]/嵌套语义，二次校准不重复注入 marker', async () => {
    const page = createPage({
      html: [
        '<ol start="8">',
        '<li>外层八',
        '<ol reversed><li>内层三</li><li>内层二</li><li>内层一</li></ol>',
        '</li>',
        '<li value="12">外层十二</li><li>外层十三</li>',
        '</ol>',
      ].join(''),
    })

    await calibratePageTypography(page)
    const lists = page.querySelectorAll<HTMLOListElement>('ol')
    const firstMarkers = Array.from(
      page.querySelectorAll<HTMLSpanElement>('[data-optical-list-marker]'),
    )

    expect(directMarkerLabels(lists[0])).toEqual(['8.', '12.', '13.'])
    expect(directMarkerLabels(lists[1])).toEqual(['3.', '2.', '1.'])
    expect(lists[0].getAttribute('start')).toBe('8')
    expect(lists[0].children[1]?.getAttribute('value')).toBe('12')
    expect(lists[1].hasAttribute('reversed')).toBe(true)

    await calibratePageTypography(page)
    expect(
      Array.from(
        page.querySelectorAll<HTMLSpanElement>(
          '[data-optical-list-marker]',
        ),
      ),
    ).toEqual(firstMarkers)
    expect(firstMarkers).toHaveLength(6)
  })

  it('序号只跟首个视觉行对齐，第二行脚本变化不改变 shift', async () => {
    let activeNode: Node | null = null
    const range = {
      setStart: vi.fn((node: Node) => {
        activeNode = node
      }),
      setEnd: vi.fn(),
      getClientRects: vi.fn(() => {
        const secondLine = activeNode?.textContent?.includes('第二行')
        return [domRect(0, secondLine ? 60 : 0, 20, 40)]
      }),
      detach: vi.fn(),
    } as unknown as Range
    vi.spyOn(document, 'createRange').mockReturnValue(range)

    const context = {
      font: '',
      textBaseline: 'alphabetic',
      measureText: vi.fn((text: string) => {
        const marker = /^[+-]?\d+\.$/u.test(text)
        const cjk = /\p{Script=Han}/u.test(text)
        return {
          width: marker ? 24 : 80,
          actualBoundingBoxAscent: marker ? 29 : cjk ? 34 : 20,
          actualBoundingBoxDescent: marker ? 5 : cjk ? 2 : 8,
          fontBoundingBoxAscent: 36,
          fontBoundingBoxDescent: 8,
        } as TextMetrics
      }),
    } as unknown as CanvasRenderingContext2D
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      ((contextId: string) =>
        contextId === '2d' ? context : null) as unknown as
        HTMLCanvasElement['getContext'],
    )

    const latinSecondLine = createPage({
      html: '<ol><li><p>Hello world<br>第二行 Latin</p></li></ol>',
    })
    await calibratePageTypography(latinSecondLine)
    const firstShift = latinSecondLine
      .querySelector<HTMLElement>('[data-optical-list-marker]')!
      .style.getPropertyValue('--optical-list-marker-shift-y')

    const cjkSecondLine = createPage({
      html: '<ol><li><p>Hello world<br>第二行 中文</p></li></ol>',
    })
    await calibratePageTypography(cjkSecondLine)
    const secondShift = cjkSecondLine
      .querySelector<HTMLElement>('[data-optical-list-marker]')!
      .style.getPropertyValue('--optical-list-marker-shift-y')

    // Latin 首行 center=-6，marker center=-12，因此下移 6px；
    // 第二行包含何种脚本都不应污染这个结果。
    expect(firstShift).toBe('6px')
    expect(secondShift).toBe(firstShift)
  })

  it('iframe 另一 realm 中仍校准 marker，并向该 Document 请求正文字体', async () => {
    const iframe = document.createElement('iframe')
    document.body.append(iframe)
    const frameDocument = iframe.contentDocument!
    const load = vi.fn(async (font: string, sample: string) => {
      void font
      void sample
      return [] as FontFace[]
    })
    setDocumentFonts({ load } as Partial<FontFaceSet>, frameDocument)

    const page = frameDocument.createElement('div')
    page.className = 'page'
    page.innerHTML = [
      '<div class="content" ',
      'style="font-family: TestSans; font-size: 40px; ',
      'font-weight: 400; line-height: 60px">',
      '<ol><li><p>概括核心问题</p></li></ol>',
      '</div>',
    ].join('')
    frameDocument.body.append(page)

    // happy-dom 共享元素构造器，所以显式模拟真实 iframe 中
    // `foreign LI instanceof parent.HTMLLIElement === false` 的跨 realm 语义。
    class ParentRealmOnlyListItem {}
    vi.stubGlobal('HTMLLIElement', ParentRealmOnlyListItem)
    const item = page.querySelector('li')!
    expect(item instanceof HTMLLIElement).toBe(false)

    const result = await calibratePageTypography(
      page as unknown as HTMLElement,
    )

    const marker = page.querySelector<HTMLElement>(
      '[data-optical-list-marker]',
    )!
    const samples = load.mock.calls.map(([, sample]) => sample)
    expect(result).toMatchObject({ status: 'ready', markerCount: 1 })
    expect(marker.ownerDocument).toBe(frameDocument)
    expect(marker.style.getPropertyValue('--optical-list-marker-shift-y')).toBe(
      '-4px',
    )
    expect(
      page
        .querySelector<HTMLOListElement>('ol')!
        .style.getPropertyValue('--optical-list-marker-column-width'),
    ).toBe('24px')
    expect(samples).toEqual(
      expect.arrayContaining([
        '1.',
        '申论国考归纳概括',
        '概括核心问题',
      ]),
    )
    expect(load).toHaveBeenCalledTimes(3)
  })
})

describe('字体就绪与异步竞态', () => {
  it('字体 deferred 期间 abort 后不做第二次回写', async () => {
    const fontLoad = deferred<FontFace[]>()
    const load = vi.fn(() => fontLoad.promise)
    setDocumentFonts({ load } as Partial<FontFaceSet>)
    const page = createPage({ html: '<h2>提出对策题</h2>' })
    const heading = page.querySelector<HTMLElement>('h2')!
    const setProperty = vi.spyOn(heading.style, 'setProperty')
    const controller = new AbortController()

    const calibration = calibratePageTypography(page, {
      signal: controller.signal,
      includeLists: false,
    })
    // 稳定度量样本 + 当前真实标题：后者确保 unicode-range
    // 分片字体在导出 iframe 里也会真正加载。
    expect(load).toHaveBeenCalledTimes(2)
    expect(heading.style.getPropertyValue('--h2-optical-center-y')).toBe('28px')
    setProperty.mockClear()

    controller.abort()
    fontLoad.resolve([])
    const result = await calibration
    await Promise.resolve()

    expect(result.status).toBe('aborted')
    expect(setProperty).not.toHaveBeenCalled()
    expect(heading.style.getPropertyValue('--h2-optical-center-y')).toBe('28px')
  })

  it('字体加载超时立即返回 degraded，不等待永不 settle 的 FontFaceSet.load', async () => {
    vi.useFakeTimers()
    const load = vi.fn(() => new Promise<FontFace[]>(() => {}))
    setDocumentFonts({ load } as Partial<FontFaceSet>)
    const page = createPage({ html: '<h2>提出对策题</h2>' })

    const calibration = calibratePageTypography(page, {
      includeLists: false,
      fontTimeoutMs: 25,
      recalibrateOnLateFonts: false,
    })
    await vi.advanceTimersByTimeAsync(25)
    const result = await calibration

    expect(load).toHaveBeenCalledTimes(2)
    expect(result.status).toBe('degraded')
    expect(result.h2Count).toBe(1)
    expect(result.fontIssues).toHaveLength(2)
    expect(result.fontIssues[0]).toMatchObject({ reason: 'timeout' })
  })
})
