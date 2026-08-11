import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearTypographyMetricsCache,
  fontSpecFromElement,
  h2BarLayout,
  inkBoxFromBounds,
  markerScriptForValue,
  measureElementInk,
  measureFontInk,
  measureTextInk,
  opticalCenterShift,
  orderedListMarkerShift,
  orderedListMarkerText,
  TYPOGRAPHY_SAMPLES,
  type TypographyMetrics,
} from './typographyMetrics'

function fakeDocument(
  textMetrics: Partial<TextMetrics> | Error,
  measureText = vi.fn(),
) {
  measureText.mockImplementation(() => {
    if (textMetrics instanceof Error) throw textMetrics
    return textMetrics
  })
  const context = {
    font: '',
    textBaseline: 'top',
    measureText,
  }
  const doc = {
    nodeType: 9,
    createElement: vi.fn(() => ({
      getContext: vi.fn(() => context),
    })),
    defaultView: null,
  } as unknown as Document
  return { context, doc, measureText }
}

function metrics(
  patch: Partial<TypographyMetrics> = {},
): TypographyMetrics {
  return {
    ascent: 32,
    descent: 4,
    height: 36,
    centerFromBaseline: -14,
    fontFamily: 'Test Sans',
    fontWeight: '400',
    fontSize: 40,
    fontStyle: 'normal',
    script: 'cjk',
    sample: TYPOGRAPHY_SAMPLES.cjk,
    advanceWidth: 200,
    fontBoxAscent: 36,
    fontBoxDescent: 8,
    source: 'actualBoundingBox',
    canvasFont: 'normal 400 40px Test Sans',
    ...patch,
  }
}

beforeEach(() => clearTypographyMetricsCache())

describe('字形样本和列表 marker', () => {
  it('使用稳定中文/拉丁/一到三位 marker 样本', () => {
    expect(TYPOGRAPHY_SAMPLES.cjk).toBe('申论国考归纳概括')
    expect(TYPOGRAPHY_SAMPLES.latin).toBe('HgxQy0123456789')
    expect(TYPOGRAPHY_SAMPLES['marker-1']).toBe('8.')
    expect(TYPOGRAPHY_SAMPLES['marker-2']).toBe('88.')
    expect(TYPOGRAPHY_SAMPLES['marker-3-plus']).toBe('888.')
  })

  it('生成实际序号文本并按位数进入度量桶', () => {
    expect(orderedListMarkerText(7)).toBe('7.')
    expect(orderedListMarkerText(-2.8)).toBe('-2.')
    expect(orderedListMarkerText(Number.NaN)).toBe('1.')
    expect(markerScriptForValue(9)).toBe('marker-1')
    expect(markerScriptForValue(10)).toBe('marker-2')
    expect(markerScriptForValue(-999)).toBe('marker-3-plus')
  })
})

describe('字形边界纯函数', () => {
  it('由 ascent/descent 得到高度和 baseline 坐标中线', () => {
    expect(inkBoxFromBounds(42, 8, 56)).toEqual({
      ascent: 42,
      descent: 8,
      height: 50,
      centerFromBaseline: -17,
    })
  })

  it('夹住非法或超大的用户字体边界', () => {
    expect(inkBoxFromBounds(Number.POSITIVE_INFINITY, -9, 40)).toEqual({
      ascent: 0,
      descent: 0,
      height: 0,
      centerFromBaseline: 0,
    })
    expect(inkBoxFromBounds(9999, 9999, 40)).toEqual({
      ascent: 80,
      descent: 80,
      height: 160,
      centerFromBaseline: 0,
    })
  })

  it('计算移动对象到参考字形中线的偏移并夹住极值', () => {
    const cjk = inkBoxFromBounds(36, 4, 40)
    const marker = inkBoxFromBounds(29, 5, 40)
    expect(opticalCenterShift(cjk, marker)).toBe(-4)
    expect(
      opticalCenterShift(
        { ...cjk, centerFromBaseline: -100 },
        marker,
        10,
      ),
    ).toBe(-10)
  })
})

describe('Canvas TextMetrics 运行时度量', () => {
  it('优先使用 actualBoundingBox，同时保留 fontBoundingBox', () => {
    const { context, doc, measureText } = fakeDocument({
      width: 210,
      actualBoundingBoxAscent: 42,
      actualBoundingBoxDescent: 8,
      fontBoundingBoxAscent: 48,
      fontBoundingBoxDescent: 12,
    } as TextMetrics)

    const result = measureFontInk(
      {
        fontFamily: '"Noto Serif SC", serif',
        fontWeight: 700,
        fontSize: 56,
        script: 'cjk',
      },
      doc,
    )

    expect(context.font).toBe(
      'normal 700 56px "Noto Serif SC", serif',
    )
    expect(context.textBaseline).toBe('alphabetic')
    expect(measureText).toHaveBeenCalledWith(TYPOGRAPHY_SAMPLES.cjk)
    expect(result).toMatchObject({
      ascent: 42,
      descent: 8,
      height: 50,
      centerFromBaseline: -17,
      fontBoxAscent: 48,
      fontBoxDescent: 12,
      advanceWidth: 210,
      source: 'actualBoundingBox',
    })
  })

  it('按 document + family/weight/size/style/script 缓存，可精确失效 family', () => {
    const { doc, measureText } = fakeDocument({
      width: 100,
      actualBoundingBoxAscent: 30,
      actualBoundingBoxDescent: 5,
    } as TextMetrics)
    const spec = {
      fontFamily: 'Test Sans',
      fontWeight: 400,
      fontSize: 40,
      script: 'cjk' as const,
    }

    expect(measureFontInk(spec, doc)).toBe(measureFontInk(spec, doc))
    expect(measureText).toHaveBeenCalledTimes(1)
    measureFontInk({ ...spec, script: 'latin' }, doc)
    expect(measureText).toHaveBeenCalledTimes(2)

    clearTypographyMetricsCache(doc, 'Test Sans')
    measureFontInk(spec, doc)
    expect(measureText).toHaveBeenCalledTimes(3)
  })

  it('可度量实际 marker 文本，且 text 是缓存键的一部分', () => {
    const { doc, measureText } = fakeDocument({
      width: 54,
      actualBoundingBoxAscent: 28,
      actualBoundingBoxDescent: 5,
    } as TextMetrics)
    const base = {
      document: doc,
      fontFamily: 'Test Sans',
      fontWeight: 400,
      fontSize: 40,
    }

    expect(measureTextInk({ ...base, text: '12.' })).toMatchObject({
      script: 'marker-2',
      sample: '12.',
      ascent: 28,
      descent: 5,
    })
    measureTextInk({ ...base, text: '12.' })
    measureTextInk({ ...base, text: '13.' })
    expect(measureText).toHaveBeenNthCalledWith(1, '12.')
    expect(measureText).toHaveBeenNthCalledWith(2, '13.')
    expect(measureText).toHaveBeenCalledTimes(2)
  })

  it('actualBoundingBox 缺失时回退 fontBoundingBox', () => {
    const { doc } = fakeDocument({
      width: 80,
      fontBoundingBoxAscent: 34,
      fontBoundingBoxDescent: 6,
    } as TextMetrics)
    const result = measureFontInk(
      {
        fontFamily: 'Fallback Serif',
        fontWeight: '600',
        fontSize: 40,
        script: 'latin',
      },
      doc,
    )
    expect(result).toMatchObject({
      ascent: 34,
      descent: 6,
      source: 'fontBoundingBox',
    })
  })

  it('Canvas/context/measureText 不可用时返回有界的稳定回退值', () => {
    const { doc } = fakeDocument(new Error('canvas disabled'))
    const result = measureFontInk(
      {
        fontFamily: '',
        fontWeight: '',
        fontSize: Number.POSITIVE_INFINITY,
        script: 'cjk',
      },
      doc,
    )
    expect(result.source).toBe('fallback')
    expect(result.fontFamily).toBe('sans-serif')
    expect(result.fontSize).toBe(16)
    expect(result.ascent).toBeCloseTo(14.08)
    expect(result.descent).toBeCloseTo(1.92)
  })

  it('可直接从 HTMLElement computed style 读取字体并度量', () => {
    const { doc, measureText } = fakeDocument({
      width: 80,
      actualBoundingBoxAscent: 31,
      actualBoundingBoxDescent: 4,
    } as TextMetrics)
    const defaultView = {
      getComputedStyle: vi.fn(() => ({
        fontFamily: '"LXGW WenKai", serif',
        fontWeight: '500',
        fontSize: '40px',
        fontStyle: 'normal',
      })),
    }
    Object.assign(doc, { defaultView })
    const element = {
      ownerDocument: doc,
      style: {
        fontFamily: '',
        fontWeight: '',
        fontSize: '',
        fontStyle: '',
      },
    } as unknown as HTMLElement

    expect(fontSpecFromElement(element, 'cjk')).toEqual({
      fontFamily: '"LXGW WenKai", serif',
      fontWeight: '500',
      fontSize: 40,
      fontStyle: 'normal',
      script: 'cjk',
    })
    expect(measureElementInk(element, 'cjk').source).toBe(
      'actualBoundingBox',
    )
    expect(measureText).toHaveBeenCalledTimes(1)
  })
})

describe('光学对齐几何', () => {
  it('列表序号对齐首行中文字形中线，默认最多移动 0.25em', () => {
    const text = metrics({ centerFromBaseline: -16 })
    const marker = metrics({
      script: 'marker-1',
      centerFromBaseline: -12,
    })
    expect(orderedListMarkerShift(text, marker)).toBe(-4)
    expect(
      orderedListMarkerShift(
        metrics({ centerFromBaseline: -100 }),
        marker,
      ),
    ).toBe(-10)
  })

  it('H2 竖线使用字形中线/高度，而非 CSS 行盒中线/高度', () => {
    const layout = h2BarLayout(
      metrics({
        ascent: 34,
        descent: 2,
        centerFromBaseline: -16,
      }),
      60,
    )
    // font box 44px：半 leading=8px，baseline=44px，ink center=28px。
    expect(layout).toEqual({
      top: 10,
      height: 36,
      center: 28,
      shiftFromBlockCenter: -2,
      lineCount: 1,
    })
  })

  it('多行 H2 竖线覆盖首行到末行的联合字形框', () => {
    const titleMetrics = metrics({
      ascent: 34,
      descent: 2,
      centerFromBaseline: -16,
    })
    expect(h2BarLayout(titleMetrics, 60, { lineCount: 2 })).toEqual({
      top: 10,
      height: 96,
      center: 58,
      shiftFromBlockCenter: -2,
      lineCount: 2,
    })
  })

  it('H2 的异常字体偏移与 heightScale 都被限制', () => {
    const odd = metrics({
      height: 500,
      centerFromBaseline: -500,
      fontBoxAscent: 36,
      fontBoxDescent: 8,
    })
    const layout = h2BarLayout(odd, 60, { heightScale: 99 })
    expect(layout.shiftFromBlockCenter).toBe(-10)
    expect(layout.center).toBe(20)
    expect(layout.height).toBe(60)
  })
})
