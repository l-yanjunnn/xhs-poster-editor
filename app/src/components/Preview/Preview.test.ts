import { act, createElement, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@/lib/canvas'
import { Preview } from './Preview'

type PreviewTypographyMockKey =
  | 'fontReadiness'
  | 'materialize'
  | 'calibrate'
  | 'calibrateNow'
type PreviewTypographyMockDelegate = (...args: unknown[]) => unknown

const previewTypographyMocks = vi.hoisted(() => {
  const delegates = {} as Record<
    PreviewTypographyMockKey,
    PreviewTypographyMockDelegate
  >
  const defaults = {} as Record<
    PreviewTypographyMockKey,
    PreviewTypographyMockDelegate
  >
  const proxy = (key: PreviewTypographyMockKey) =>
    vi.fn((...args: unknown[]) => {
      const delegate = delegates[key]
      if (!delegate) throw new Error(`Missing Preview typography mock: ${key}`)
      return delegate(...args)
    })
  return {
    delegates,
    defaults,
    fontReadiness: proxy('fontReadiness'),
    materialize: proxy('materialize'),
    calibrate: proxy('calibrate'),
    calibrateNow: proxy('calibrateNow'),
  }
})

vi.mock('@/lib/deterministicFontReadiness', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/deterministicFontReadiness')>()
  const delegate: PreviewTypographyMockDelegate = (...args) =>
    Reflect.apply(actual.checkDeterministicFontReadiness, undefined, args)
  previewTypographyMocks.defaults.fontReadiness = delegate
  previewTypographyMocks.delegates.fontReadiness = delegate
  return {
    ...actual,
    checkDeterministicFontReadiness: previewTypographyMocks.fontReadiness,
  }
})

vi.mock('@/lib/deterministicTypography', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/deterministicTypography')>()
  const delegate: PreviewTypographyMockDelegate = (...args) =>
    Reflect.apply(actual.materializeDeterministicTypography, undefined, args)
  previewTypographyMocks.defaults.materialize = delegate
  previewTypographyMocks.delegates.materialize = delegate
  return {
    ...actual,
    materializeDeterministicTypography: previewTypographyMocks.materialize,
  }
})

vi.mock('@/lib/opticalTypography', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/opticalTypography')>()
  const calibrateDelegate: PreviewTypographyMockDelegate = (...args) =>
    Reflect.apply(actual.calibratePageTypography, undefined, args)
  const calibrateNowDelegate: PreviewTypographyMockDelegate = (...args) =>
    Reflect.apply(actual.calibratePageTypographyNow, undefined, args)
  previewTypographyMocks.defaults.calibrate = calibrateDelegate
  previewTypographyMocks.defaults.calibrateNow = calibrateNowDelegate
  previewTypographyMocks.delegates.calibrate = calibrateDelegate
  previewTypographyMocks.delegates.calibrateNow = calibrateNowDelegate
  return {
    ...actual,
    calibratePageTypography: previewTypographyMocks.calibrate,
    calibratePageTypographyNow: previewTypographyMocks.calibrateNow,
  }
})

type ReactActGlobal = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
;(globalThis as ReactActGlobal).IS_REACT_ACT_ENVIRONMENT = true

const PREVIEW_SCALE = 0.4
const mounted: Array<{ host: HTMLDivElement; root: Root }> = []

beforeEach(() => {
  for (const key of Object.keys(
    previewTypographyMocks.defaults,
  ) as PreviewTypographyMockKey[]) {
    previewTypographyMocks.delegates[key] =
      previewTypographyMocks.defaults[key]
  }
  previewTypographyMocks.fontReadiness.mockClear()
  previewTypographyMocks.materialize.mockClear()
  previewTypographyMocks.calibrate.mockClear()
  previewTypographyMocks.calibrateNow.mockClear()
  installDocumentFonts(Promise.resolve())
})

function installDocumentFonts(ready: Promise<unknown>) {
  const events = new EventTarget()
  const fontSet = events as EventTarget & {
    ready: Promise<FontFaceSet>
    status: FontFaceSetLoadStatus
    load: ReturnType<typeof vi.fn>
  }
  Object.defineProperties(fontSet, {
    ready: {
      configurable: true,
      value: ready.then(() => fontSet as unknown as FontFaceSet),
    },
    status: { configurable: true, writable: true, value: 'loaded' },
    load: {
      configurable: true,
      value: vi.fn(async () => [{}]),
    },
  })
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: fontSet,
  })
  return {
    fontSet,
    dispatchLoadingDone: () => events.dispatchEvent(new Event('loadingdone')),
  }
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function domRect(left: number, top: number, width: number, height: number): DOMRect {
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

function cssNumber(element: HTMLElement, name: string): number {
  return Number.parseFloat(
    window.getComputedStyle(element).getPropertyValue(name),
  )
}

function installRectMock(
  options: { lastBottom?: number; scale?: number } = {},
) {
  const scale = options.scale ?? PREVIEW_SCALE
  return vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function getMockRect(this: HTMLElement) {
      const page = this.classList.contains('page')
        ? this
        : this.closest<HTMLElement>('.page')
      if (!page) return domRect(0, 0, 0, 0)
      if (this.classList.contains('page') || this.classList.contains('content')) {
        return domRect(
          0,
          0,
          CANVAS_WIDTH * scale,
          CANVAS_HEIGHT * scale,
        )
      }

      const paddingX = cssNumber(page, '--page-padding-x')
      const paddingTop = cssNumber(page, '--page-padding-top')
      const contentWidth = CANVAS_WIDTH - paddingX * 2
      if (this instanceof HTMLImageElement && this.dataset.imageId) {
        const widthPercent = Number.parseFloat(this.style.width || '100%')
        const width = (contentWidth * widthPercent) / 100
        const align = this.dataset.align
        const left =
          align === 'right'
            ? CANVAS_WIDTH - paddingX - width
            : align === 'center'
              ? paddingX + (contentWidth - width) / 2
              : paddingX
        const transform = this.style.transform.match(
          /translateX\((-?\d+(?:\.\d+)?)px\)/,
        )
        const translatedLeft = left + (transform ? Number(transform[1]) : 0)
        return domRect(
          translatedLeft * scale,
          paddingTop * scale,
          width * scale,
          (width / 2) * scale,
        )
      }

      const lastBottom = options.lastBottom ?? paddingTop + 40
      return domRect(
        paddingX * scale,
        (lastBottom - 40) * scale,
        contentWidth * scale,
        40 * scale,
      )
    })
}

function pageRefWithPadding(padding: {
  x: number
  top: number
  bottom: number
}) {
  return (page: HTMLDivElement | null) => {
    if (!page) return
    page.style.setProperty('--page-padding-x', `${padding.x}px`)
    page.style.setProperty('--page-padding-top', `${padding.top}px`)
    page.style.setProperty('--page-padding-bottom', `${padding.bottom}px`)
  }
}

async function mountPreview(
  padding: { x: number; top: number; bottom: number },
  overrides: Partial<ComponentProps<typeof Preview>> = {},
) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const props: ComponentProps<typeof Preview> = {
    ref: pageRefWithPadding(padding),
    html: '<p>正文</p>',
    themeClass: '',
    previewScale: PREVIEW_SCALE,
    ...overrides,
  }
  await act(async () => {
    root.render(createElement(Preview, props))
  })
  const item = { host, root }
  mounted.push(item)
  return item
}

function preparePointerTarget(element: Element) {
  Object.defineProperties(element, {
    setPointerCapture: { configurable: true, value: vi.fn() },
    hasPointerCapture: { configurable: true, value: vi.fn(() => true) },
    releasePointerCapture: { configurable: true, value: vi.fn() },
  })
}

async function dispatchPointer(
  element: Element,
  type: string,
  init: { pointerId: number; clientX: number; altKey?: boolean },
) {
  await act(async () => {
    element.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        pointerId: init.pointerId,
        clientX: init.clientX,
        altKey: init.altKey,
      }),
    )
  })
}

afterEach(async () => {
  for (const item of mounted.splice(0)) {
    await act(async () => item.root.unmount())
    item.host.remove()
  }
  vi.restoreAllMocks()
})

describe('Preview page-role geometry', () => {
  it.each([
    {
      name: '公考封面',
      padding: { x: 120, top: 300, bottom: 300 },
      pageIndex: 0,
    },
    {
      name: '公考内页',
      padding: { x: 96, top: 180, bottom: 300 },
      pageIndex: 1,
    },
    {
      name: '旧主题',
      padding: { x: 80, top: 300, bottom: 160 },
      pageIndex: 1,
    },
  ])('参考线跟随 $name 的实时安全区', async ({ padding, pageIndex }) => {
    installRectMock()
    const { host } = await mountPreview(padding, {
      themeClass:
        padding.x === 80 ? '' : 'theme-public-exam-landscape',
      pageIndex,
      pageTotal: 2,
      layoutGuidesOn: true,
    })

    expect(
      host.querySelector<HTMLElement>('.layout-guide--left')?.style.left,
    ).toBe(`${padding.x}px`)
    expect(
      host.querySelector<HTMLElement>('.layout-guide--right')?.style.right,
    ).toBe(`${padding.x}px`)
    expect(
      host.querySelector<HTMLElement>('.layout-guide--top')?.style.top,
    ).toBe(`${padding.top}px`)
    expect(
      host.querySelector<HTMLElement>('.layout-guide--bottom')?.style.bottom,
    ).toBe(`${padding.bottom}px`)
    const interactionLayer = host.querySelector<HTMLElement>(
      '.canvas-interaction-layer',
    )
    expect(
      interactionLayer?.style.getPropertyValue('--page-padding-x'),
    ).toBe(`${padding.x}px`)
    expect(host.querySelectorAll('.layout-guide')).toHaveLength(5)
    expect(host.querySelector('.layout-guide-label')?.textContent).toBe(
      '建议内容区',
    )
    expect(host.querySelector('.layout-guide-hint')?.textContent).toBe(
      '重要文字尽量放在线内；背景图片可以铺满整页。参考线不会导出。',
    )
  })

  it.each([
    { lastBottom: 1499, overflowing: false },
    { lastBottom: 1500, overflowing: false },
    { lastBottom: 1502, overflowing: true },
  ])(
    'Cover 1500px 安全底线：lastBottom=$lastBottom',
    async ({ lastBottom, overflowing }) => {
      installRectMock({ lastBottom, scale: 1 })
      const { host } = await mountPreview(
        { x: 120, top: 300, bottom: 300 },
        {
          themeClass: 'theme-public-exam-landscape',
          html: '<p>封面底部内容</p>',
          previewScale: 1,
        },
      )

      expect(Boolean(host.querySelector('.canvas-overflow-warning'))).toBe(
        overflowing,
      )
    },
  )

  it('公考 Cover 使用 1500px 底线，旧主题仍使用 1640px', async () => {
    installRectMock({ lastBottom: 1550, scale: 1 })
    const { host } = await mountPreview(
      { x: 120, top: 300, bottom: 300 },
      {
        themeClass: 'theme-public-exam-landscape',
        html: '<p>超出封面安全区的正文</p>',
        previewScale: 1,
      },
    )

    expect(host.querySelector('.canvas-overflow-warning')?.textContent).toContain(
      '超出安全区',
    )

    const legacy = await mountPreview(
      { x: 80, top: 320, bottom: 160 },
      {
        themeClass: '',
        html: '<p>旧主题封面内容</p>',
        previewScale: 1,
      },
    )
    expect(legacy.host.querySelector('.canvas-overflow-warning')).toBeNull()
  })

  it('公考 Cover 缩放用 840px 内容宽度，pointermove 不重复读布局且只提交一次', async () => {
    const rectSpy = installRectMock()
    const onCommitImage = vi.fn(() => true)
    const { host } = await mountPreview(
      { x: 120, top: 300, bottom: 300 },
      {
        themeClass: 'theme-public-exam-landscape',
        html: '<img data-image-id="cover-image" data-align="left" style="width: 50%">',
        selectedImageId: 'cover-image',
        onCommitImage,
      },
    )
    const handle = host.querySelector(
      '.image-resize-handle--right-bottom',
    )
    if (!handle) throw new Error('缺少缩放手柄')
    preparePointerTarget(handle)

    expect(
      host.querySelector<HTMLElement>('.image-selection-box')?.style.left,
    ).toBe('120px')
    await dispatchPointer(handle, 'pointerdown', {
      pointerId: 1,
      clientX: 100,
    })
    const rectReadsAtStart = rectSpy.mock.calls.length
    // Cover 内容宽 840：50% → 66% 增加 134.4 画布像素，屏幕上是 53.76px。
    await dispatchPointer(handle, 'pointermove', {
      pointerId: 1,
      clientX: 153.76,
    })

    expect(rectSpy.mock.calls).toHaveLength(rectReadsAtStart)
    expect(
      host.querySelector<HTMLElement>('.image-selection-box')?.style.width,
    ).toBe('554.4px')
    expect(host.querySelector<HTMLElement>('.snap-guide')?.style.left).toBe(
      '120px',
    )
    expect(onCommitImage).not.toHaveBeenCalled()

    await dispatchPointer(handle, 'pointerup', {
      pointerId: 1,
      clientX: 153.76,
    })
    expect(onCommitImage).toHaveBeenCalledTimes(1)
    expect(onCommitImage).toHaveBeenCalledWith(
      'cover-image',
      { width: '66%' },
      '调整为 66%',
    )
  })

  it('公考 Inner 对齐目标使用 x=96…984，松手时才提交语义对齐', async () => {
    installRectMock()
    const onCommitImage = vi.fn(() => true)
    const { host } = await mountPreview(
      { x: 96, top: 180, bottom: 300 },
      {
        themeClass: 'theme-public-exam-landscape',
        pageIndex: 1,
        pageTotal: 2,
        html: '<img data-image-id="inner-image" data-align="left" style="width: 50%">',
        selectedImageId: 'inner-image',
        onCommitImage,
      },
    )
    const grip = host.querySelector('.image-drag-grip')
    if (!grip) throw new Error('缺少对齐抓手')
    preparePointerTarget(grip)

    await dispatchPointer(grip, 'pointerdown', {
      pointerId: 2,
      clientX: 100,
    })
    // Inner 内容宽 888，50% 图片从 left=96 移到 right target=540。
    await dispatchPointer(grip, 'pointermove', {
      pointerId: 2,
      clientX: 277.6,
    })

    expect(
      host.querySelector<HTMLElement>('.image-selection-box')?.style.left,
    ).toBe('540px')
    expect(host.querySelector<HTMLElement>('.snap-guide')?.style.left).toBe(
      '984px',
    )
    expect(onCommitImage).not.toHaveBeenCalled()

    await dispatchPointer(grip, 'pointerup', {
      pointerId: 2,
      clientX: 277.6,
    })
    expect(onCommitImage).toHaveBeenCalledTimes(1)
    expect(onCommitImage).toHaveBeenCalledWith(
      'inner-image',
      { align: 'right' },
      '右对齐',
    )
  })
})

describe('Preview optical list markers', () => {
  it('HTML 替换后重建展示序号，布局 revision 复测不会重复注入', async () => {
    installRectMock()
    const firstHtml =
      '<ol start="9"><li><p>第九项</p></li><li><p>第十项</p></li></ol>'
    const item = await mountPreview(
      { x: 96, top: 180, bottom: 300 },
      { html: firstHtml, layoutRevision: 'font-a' },
    )

    const labels = () =>
      Array.from(
        item.host.querySelectorAll<HTMLElement>(
          '[data-optical-list-marker]',
        ),
        (marker) => marker.textContent,
      )
    expect(labels()).toEqual(['9.', '10.'])
    expect(
      item.host.querySelector('ol')?.getAttribute(
        'data-optical-list-marker-columns',
      ),
    ).toBe('3')
    expect(
      item.host.querySelector('[data-optical-list-marker]')?.getAttribute(
        'aria-hidden',
      ),
    ).toBeNull()
    await act(async () => {
      item.root.render(
        createElement(Preview, {
          ref: pageRefWithPadding({ x: 96, top: 180, bottom: 300 }),
          html: firstHtml,
          themeClass: '',
          previewScale: PREVIEW_SCALE,
          layoutRevision: 'font-b',
        }),
      )
    })
    expect(labels()).toEqual(['9.', '10.'])
    expect(
      item.host.querySelectorAll('[data-optical-list-marker]'),
    ).toHaveLength(2)
    expect(labels()).toEqual(['9.', '10.'])

    await act(async () => {
      item.root.render(
        createElement(Preview, {
          ref: pageRefWithPadding({ x: 96, top: 180, bottom: 300 }),
          html: '<ol reversed><li><p>A</p></li><li value="7"><p>B</p></li></ol>',
          themeClass: '',
          previewScale: PREVIEW_SCALE,
          layoutRevision: 'font-b',
        }),
      )
    })
    expect(labels()).toEqual(['2.', '7.'])
    expect(item.host.querySelector('.content')?.textContent).toContain('A')
    expect(item.host.querySelector('.content')?.textContent).toContain('B')
  })
})

describe('Preview deterministic typography transaction', () => {
  const readyFontResult = {
    ok: true,
    requests: [],
    verified: [],
    allowlisted: [],
    issues: [],
  }
  const timeoutFontResult = {
    ok: false,
    requests: [],
    verified: [],
    allowlisted: [],
    issues: [
      {
        kind: 'font',
        reason: 'timeout',
        family: 'Test Font',
        weight: '400',
        style: 'normal',
        sample: '汉A0',
        label: 'Test Font (400)',
        message: '等待字体 Test Font (400) 超时',
      },
    ],
  }
  const loadErrorFontResult = {
    ...timeoutFontResult,
    issues: [
      {
        ...timeoutFontResult.issues[0],
        reason: 'load-error',
        message: '加载字体 Test Font (400) 失败',
      },
    ],
  }
  const readyCalibration = {
    status: 'ready',
    h2Count: 0,
    markerCount: 0,
    fontIssues: [],
  }

  beforeEach(() => {
    let snapshotRevision = 0
    previewTypographyMocks.delegates.materialize = (
      pageValue,
      optionsValue,
    ) => {
      const page = pageValue as HTMLElement
      const options = optionsValue as {
        sourceHtml: string
        state?: 'pending' | 'ready'
      }
      const content = page.querySelector<HTMLElement>('.content')
      if (!content) throw new Error('Preview test page is missing .content')
      content.innerHTML = options.sourceHtml
      snapshotRevision += 1
      const snapshotId = `test-snapshot-${snapshotRevision}`
      page.dataset.layoutSnapshot = snapshotId
      page.dataset.layoutState = options.state ?? 'pending'
      page.dataset.layoutIssueCount = '0'
      page.dataset.layoutIssues = '[]'
      page.dataset.layoutFontRequest = '[]'
      return {
        snapshotId,
        blockCount: 1,
        lineCount: 1,
        fontRequests: [],
        issues: [],
      }
    }
    previewTypographyMocks.delegates.calibrateNow = () => ({
      h2Count: 0,
      markerCount: 0,
    })
    previewTypographyMocks.delegates.calibrate = () =>
      Promise.resolve(readyCalibration)
    previewTypographyMocks.delegates.fontReadiness = () =>
      Promise.resolve(readyFontResult)
  })

  it('保持 pending，直到精确字体、重物化与校准全部成功才封存 ready', async () => {
    const fontCheck = deferred<typeof readyFontResult>()
    previewTypographyMocks.delegates.fontReadiness = () => fontCheck.promise
    const { host } = await mountPreview(
      { x: 96, top: 180, bottom: 300 },
      { html: '<p>中文2026</p>' },
    )
    const page = host.querySelector<HTMLElement>('.page')
    expect(page?.dataset.layoutState).toBe('pending')

    await act(async () => {
      fontCheck.resolve(readyFontResult)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(page?.dataset.layoutState).toBe('ready')
    expect(previewTypographyMocks.materialize).toHaveBeenCalledTimes(2)
    expect(
      previewTypographyMocks.materialize.mock.calls.map(
        ([, options]) =>
          (options as { state?: string }).state,
      ),
    ).toEqual(['pending', 'pending'])
    expect(previewTypographyMocks.calibrate).toHaveBeenCalledWith(
      page,
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        recalibrateOnLateFonts: false,
      }),
    )
  })

  it('精确字体加载失败时保留明确 font-error 与结构化原因', async () => {
    previewTypographyMocks.delegates.fontReadiness = () =>
      Promise.resolve(loadErrorFontResult)
    const { host } = await mountPreview(
      { x: 96, top: 180, bottom: 300 },
      { html: '<p>字体失败</p>' },
    )
    const page = host.querySelector<HTMLElement>('.page')

    expect(page?.dataset.layoutState).toBe('font-error')
    expect(JSON.parse(page?.dataset.layoutFontIssues ?? '[]')).toEqual([
      expect.objectContaining({
        family: 'Test Font',
        weight: '400',
        message: expect.stringContaining('失败'),
      }),
    ])
    expect(previewTypographyMocks.materialize).toHaveBeenCalledTimes(1)
    expect(previewTypographyMocks.calibrate).not.toHaveBeenCalled()
  })

  it('校准 degraded 不封存 ready，而是降级为可见的 font-error', async () => {
    previewTypographyMocks.delegates.calibrate = () =>
      Promise.resolve({
        status: 'degraded',
        h2Count: 1,
        markerCount: 0,
        fontIssues: [
          {
            font: 'normal 400 40px "Test Font"',
            reason: 'timeout',
          },
        ],
      })
    const { host } = await mountPreview(
      { x: 96, top: 180, bottom: 300 },
      { html: '<h2>需要校准的标题</h2>' },
    )
    const page = host.querySelector<HTMLElement>('.page')

    expect(page?.dataset.layoutState).toBe('font-error')
    expect(page?.dataset.layoutFontIssues).toContain('Test Font')
  })

  it('字体超时后晚到时完整重跑字体检查、重物化和校准', async () => {
    const fontsReady = deferred<void>()
    installDocumentFonts(fontsReady.promise)
    previewTypographyMocks.fontReadiness
      .mockImplementationOnce(() => Promise.resolve(timeoutFontResult))
      .mockImplementationOnce(() => Promise.resolve(readyFontResult))
    const { host } = await mountPreview(
      { x: 96, top: 180, bottom: 300 },
      { html: '<p>晚到字体</p>' },
    )
    const page = host.querySelector<HTMLElement>('.page')
    expect(page?.dataset.layoutState).toBe('font-error')
    expect(previewTypographyMocks.fontReadiness).toHaveBeenCalledTimes(1)

    await act(async () => {
      fontsReady.resolve()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(previewTypographyMocks.fontReadiness).toHaveBeenCalledTimes(2)
    expect(previewTypographyMocks.materialize).toHaveBeenCalledTimes(2)
    expect(previewTypographyMocks.calibrate).toHaveBeenCalledTimes(1)
    expect(page?.dataset.layoutState).toBe('ready')
    expect(page?.hasAttribute('data-layout-font-issues')).toBe(false)
  })

  it('最终 marker 列宽变化时重物化后再校准才封存', async () => {
    const materialize = previewTypographyMocks.delegates.materialize
    let materializeCount = 0
    let calibrationCount = 0
    previewTypographyMocks.delegates.materialize = (...args) => {
      const result = materialize(...args)
      materializeCount += 1
      const page = args[0] as HTMLElement
      page.dataset.layoutListMarkerGeometry =
        materializeCount >= 3 ? 'final-marker-width' : 'fallback-marker-width'
      return result
    }
    previewTypographyMocks.delegates.calibrate = (pageValue) => {
      calibrationCount += 1
      const page = pageValue as HTMLElement
      if (calibrationCount === 1) {
        page.dataset.layoutListMarkerGeometry = 'final-marker-width'
      }
      return Promise.resolve(readyCalibration)
    }

    const { host } = await mountPreview(
      { x: 96, top: 180, bottom: 300 },
      {
        html: '<ol start="8"><li>八</li><li>九</li><li>十</li></ol>',
      },
    )
    const page = host.querySelector<HTMLElement>('.page')

    expect(previewTypographyMocks.materialize).toHaveBeenCalledTimes(3)
    expect(previewTypographyMocks.calibrate).toHaveBeenCalledTimes(2)
    expect(page?.dataset.layoutListMarkerGeometry).toBe('final-marker-width')
    expect(page?.dataset.layoutSnapshotPhase).toBe('sealed')
    expect(page?.dataset.layoutState).toBe('ready')
  })

  it('新 revision 完成后忽略旧字体检查的晚到结果', async () => {
    const staleCheck = deferred<typeof readyFontResult>()
    previewTypographyMocks.fontReadiness
      .mockImplementationOnce(() => staleCheck.promise)
      .mockImplementationOnce(() => Promise.resolve(readyFontResult))
    const item = await mountPreview(
      { x: 96, top: 180, bottom: 300 },
      { html: '<p>旧内容</p>', layoutRevision: 'old' },
    )

    await act(async () => {
      item.root.render(
        createElement(Preview, {
          ref: pageRefWithPadding({ x: 96, top: 180, bottom: 300 }),
          html: '<p>新内容</p>',
          themeClass: '',
          previewScale: PREVIEW_SCALE,
          layoutRevision: 'new',
        }),
      )
      await Promise.resolve()
      await Promise.resolve()
    })
    const page = item.host.querySelector<HTMLElement>('.page')
    expect(page?.dataset.layoutState).toBe('ready')
    expect(page?.querySelector('.content')?.textContent).toBe('新内容')

    await act(async () => {
      staleCheck.resolve(readyFontResult)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(page?.dataset.layoutState).toBe('ready')
    expect(page?.querySelector('.content')?.textContent).toBe('新内容')
    expect(previewTypographyMocks.calibrate).toHaveBeenCalledTimes(1)
  })
})
