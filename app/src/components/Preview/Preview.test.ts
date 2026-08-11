import { act, createElement, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@/lib/canvas'
import { Preview } from './Preview'

type ReactActGlobal = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
;(globalThis as ReactActGlobal).IS_REACT_ACT_ENVIRONMENT = true

const PREVIEW_SCALE = 0.4
const mounted: Array<{ host: HTMLDivElement; root: Root }> = []

beforeEach(() => {
  if (!document.fonts) {
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { ready: Promise.resolve() },
    })
  }
})

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

function installRectMock(options: { lastBottom?: number } = {}) {
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
          CANVAS_WIDTH * PREVIEW_SCALE,
          CANVAS_HEIGHT * PREVIEW_SCALE,
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
          translatedLeft * PREVIEW_SCALE,
          paddingTop * PREVIEW_SCALE,
          width * PREVIEW_SCALE,
          (width / 2) * PREVIEW_SCALE,
        )
      }

      const lastBottom = options.lastBottom ?? paddingTop + 40
      return domRect(
        paddingX * PREVIEW_SCALE,
        (lastBottom - 40) * PREVIEW_SCALE,
        contentWidth * PREVIEW_SCALE,
        40 * PREVIEW_SCALE,
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
      padding: { x: 120, top: 340, bottom: 620 },
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
  })

  it('Cover 溢出检查使用 1180px 安全底线，不沿用旧主题 1640px', async () => {
    installRectMock({ lastBottom: 1200 })
    const { host } = await mountPreview(
      { x: 120, top: 340, bottom: 620 },
      {
        themeClass: 'theme-public-exam-landscape',
        html: '<p>超出封面安全区的正文</p>',
      },
    )

    expect(host.querySelector('.canvas-overflow-warning')?.textContent).toContain(
      '超出安全区',
    )
  })

  it('公考 Cover 缩放用 840px 内容宽度，pointermove 不重复读布局且只提交一次', async () => {
    const rectSpy = installRectMock()
    const onCommitImage = vi.fn(() => true)
    const { host } = await mountPreview(
      { x: 120, top: 340, bottom: 620 },
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
    const firstMarker = item.host.querySelector('[data-optical-list-marker]')

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
    expect(item.host.querySelector('[data-optical-list-marker]')).toBe(
      firstMarker,
    )

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
