// 字体光学度量层：Canvas 负责读取真实字形边界，下方的纯函数
// 把边界转成标题竖线和列表序号可直接使用的几何量。
//
// 不用实际文案作样本，是为了避免同一字体因标题内容不同而轻微跳动。
// 样本覆盖中文常用结构、拉丁字母的升/降部和有序列表的数字+句点。

export type TypographyScript =
  | 'cjk'
  | 'latin'
  | 'marker-1'
  | 'marker-2'
  | 'marker-3-plus'

export const TYPOGRAPHY_SAMPLES: Readonly<Record<TypographyScript, string>> =
  Object.freeze({
    cjk: '申论国考归纳概括',
    latin: 'HgxQy0123456789',
    'marker-1': '8.',
    'marker-2': '88.',
    'marker-3-plus': '888.',
  })

const DEFAULT_FONT_SIZE = 16
const MIN_FONT_SIZE = 1
const MAX_FONT_SIZE = 1000
const MAX_BOUND_MULTIPLIER = 2
const DEFAULT_LINE_HEIGHT_MULTIPLIER = 1.2
const DEFAULT_MAX_SHIFT_MULTIPLIER = 0.25

export interface TypographyFontSpec {
  fontFamily: string
  fontWeight: string | number
  fontSize: number
  fontStyle?: string
  script: TypographyScript
}

/** 精确文本度量：列表集成层会用实际的 `1.` / `12.` 调用它。 */
export interface MeasureTextInkRequest {
  document?: Document | null
  fontFamily: string
  fontWeight: string | number
  fontSize: number
  fontStyle?: string
  text: string
  /** 不传时由 text 推断，主要用于选择 Canvas 失效时的回退比例。 */
  script?: TypographyScript
}

export interface TypographyInkBox {
  /** 从 baseline 向上的字形距离（正数）。 */
  ascent: number
  /** 从 baseline 向下的字形距离（正数）。 */
  descent: number
  height: number
  /** baseline 为 0 时的字形视觉中线，通常为负数。 */
  centerFromBaseline: number
}

export type TypographyMetricSource =
  | 'actualBoundingBox'
  | 'fontBoundingBox'
  | 'fallback'

export interface TypographyMetrics extends TypographyInkBox {
  fontFamily: string
  fontWeight: string
  fontSize: number
  fontStyle: string
  script: TypographyScript
  sample: string
  /** Canvas measureText 的逻辑宽度，可用于估算 marker 列宽。 */
  advanceWidth: number
  /** CSS line box 定位 baseline 所需的字体框度量。 */
  fontBoxAscent: number
  fontBoxDescent: number
  source: TypographyMetricSource
  canvasFont: string
}

export interface H2BarLayout {
  /** 相对标题 block 顶部的竖线上边界。 */
  top: number
  height: number
  /** 相对标题 block 顶部的字形联合中线。 */
  center: number
  /** 竖线中线相对整个 CSS line block 几何中线的偏移。 */
  shiftFromBlockCenter: number
  lineCount: number
}

export interface H2BarLayoutOptions {
  lineCount?: number
  /** 只缩放首/末行的字形高度，行与行之间的距离保持不变。 */
  heightScale?: number
  maxShiftPx?: number
}

interface CanvasTextMetricsLike {
  width?: number
  actualBoundingBoxAscent?: number
  actualBoundingBoxDescent?: number
  fontBoundingBoxAscent?: number
  fontBoundingBoxDescent?: number
}

interface NormalizedTypographyFontSpec {
  fontFamily: string
  fontWeight: string
  fontSize: number
  fontStyle: string
  script: TypographyScript
}

type MetricsCache = Map<string, TypographyMetrics>

let cacheByDocument = new WeakMap<Document, MetricsCache>()

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function normalizeFontSize(value: number): number {
  return clamp(finiteOr(value, DEFAULT_FONT_SIZE), MIN_FONT_SIZE, MAX_FONT_SIZE)
}

function normalizeFontFamily(value: string): string {
  const normalized = value.trim()
  return normalized || 'sans-serif'
}

function normalizeFontWeight(value: string | number): string {
  const normalized = String(value).trim()
  return normalized || '400'
}

function normalizeFontStyle(value: string | undefined): string {
  const normalized = value?.trim().toLowerCase() ?? ''
  // computedStyle 正常只会给出这三类值；拒绝其他片段避免破坏 ctx.font。
  if (normalized === 'italic' || normalized.startsWith('oblique')) {
    return normalized
  }
  return 'normal'
}

function normalizeSpec(spec: TypographyFontSpec): NormalizedTypographyFontSpec {
  return {
    fontFamily: normalizeFontFamily(spec.fontFamily),
    fontWeight: normalizeFontWeight(spec.fontWeight),
    fontSize: normalizeFontSize(spec.fontSize),
    fontStyle: normalizeFontStyle(spec.fontStyle),
    script: spec.script,
  }
}

function fallbackRatios(script: TypographyScript): {
  ascent: number
  descent: number
} {
  if (script === 'cjk') return { ascent: 0.88, descent: 0.12 }
  if (script === 'latin') return { ascent: 0.78, descent: 0.22 }
  return { ascent: 0.76, descent: 0.16 }
}

/**
 * 把 Canvas 的 ascent/descent 转成统一字形框。不可信的负值、Infinity
 * 和异常大的自定义字体数值都会被夹到 0..2em，避免一次坏度量
 * 把竖线或序号移出画布。
 */
export function inkBoxFromBounds(
  ascent: number,
  descent: number,
  fontSize: number,
): TypographyInkBox {
  const safeFontSize = normalizeFontSize(fontSize)
  const maxBound = safeFontSize * MAX_BOUND_MULTIPLIER
  const safeAscent = clamp(finiteOr(ascent, 0), 0, maxBound)
  const safeDescent = clamp(finiteOr(descent, 0), 0, maxBound)
  const height = safeAscent + safeDescent
  return {
    ascent: safeAscent,
    descent: safeDescent,
    height,
    centerFromBaseline: (safeDescent - safeAscent) / 2,
  }
}

/** HTML ordered-list 的展示序号，保留 start/value 可能产生的负数。 */
export function orderedListMarkerText(value: number): string {
  const normalized = Number.isFinite(value) ? Math.trunc(value) : 1
  return `${normalized}.`
}

/** 将序号归入稳定样本桶，使 1→9、10→99 不会因具体数字改变纵向校准。 */
export function markerScriptForValue(value: number): TypographyScript {
  const normalized = Number.isFinite(value) ? Math.abs(Math.trunc(value)) : 1
  const digits = String(normalized).length
  if (digits <= 1) return 'marker-1'
  if (digits === 2) return 'marker-2'
  return 'marker-3-plus'
}

function fallbackMetrics(
  spec: NormalizedTypographyFontSpec,
  canvasFont: string,
  sample = TYPOGRAPHY_SAMPLES[spec.script],
): TypographyMetrics {
  const ratios = fallbackRatios(spec.script)
  const ink = inkBoxFromBounds(
    spec.fontSize * ratios.ascent,
    spec.fontSize * ratios.descent,
    spec.fontSize,
  )
  return {
    ...ink,
    fontFamily: spec.fontFamily,
    fontWeight: spec.fontWeight,
    fontSize: spec.fontSize,
    fontStyle: spec.fontStyle,
    script: spec.script,
    sample,
    advanceWidth: 0,
    fontBoxAscent: spec.fontSize * 0.8,
    fontBoxDescent: spec.fontSize * 0.2,
    source: 'fallback',
    canvasFont,
  }
}

function cacheKey(
  spec: NormalizedTypographyFontSpec,
  sample = TYPOGRAPHY_SAMPLES[spec.script],
): string {
  return JSON.stringify([
    spec.fontFamily,
    spec.fontWeight,
    spec.fontSize,
    spec.fontStyle,
    spec.script,
    sample,
  ])
}

function documentFromSource(
  source: Document | HTMLElement | null | undefined,
): Document | null {
  if (source === null) return null
  if (source === undefined) {
    return typeof document === 'undefined' ? null : document
  }
  if (source.nodeType === 9) return source as Document
  return source.ownerDocument ?? null
}

function buildCanvasFont(spec: NormalizedTypographyFontSpec): string {
  return `${spec.fontStyle} ${spec.fontWeight} ${spec.fontSize}px ${spec.fontFamily}`
}

function usableBound(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function metricsFromTextMetrics(
  raw: CanvasTextMetricsLike,
  spec: NormalizedTypographyFontSpec,
  canvasFont: string,
  sample = TYPOGRAPHY_SAMPLES[spec.script],
): TypographyMetrics {
  const hasActualBounds =
    usableBound(raw.actualBoundingBoxAscent) &&
    usableBound(raw.actualBoundingBoxDescent) &&
    raw.actualBoundingBoxAscent + raw.actualBoundingBoxDescent > 0
  const hasFontBounds =
    usableBound(raw.fontBoundingBoxAscent) &&
    usableBound(raw.fontBoundingBoxDescent) &&
    raw.fontBoundingBoxAscent + raw.fontBoundingBoxDescent > 0

  if (!hasActualBounds && !hasFontBounds) {
    const fallback = fallbackMetrics(spec, canvasFont, sample)
    return {
      ...fallback,
      advanceWidth: clamp(
        finiteOr(raw.width, 0),
        0,
        spec.fontSize * sample.length * 2,
      ),
    }
  }

  const source: TypographyMetricSource = hasActualBounds
    ? 'actualBoundingBox'
    : 'fontBoundingBox'
  const ascent = hasActualBounds
    ? raw.actualBoundingBoxAscent!
    : raw.fontBoundingBoxAscent!
  const descent = hasActualBounds
    ? raw.actualBoundingBoxDescent!
    : raw.fontBoundingBoxDescent!
  const ink = inkBoxFromBounds(ascent, descent, spec.fontSize)
  const fallbackFontAscent = Math.max(spec.fontSize * 0.8, ink.ascent)
  const fallbackFontDescent = Math.max(spec.fontSize * 0.2, ink.descent)
  const fontBox = inkBoxFromBounds(
    hasFontBounds ? raw.fontBoundingBoxAscent! : fallbackFontAscent,
    hasFontBounds ? raw.fontBoundingBoxDescent! : fallbackFontDescent,
    spec.fontSize,
  )

  return {
    ...ink,
    fontFamily: spec.fontFamily,
    fontWeight: spec.fontWeight,
    fontSize: spec.fontSize,
    fontStyle: spec.fontStyle,
    script: spec.script,
    sample,
    advanceWidth: clamp(
      finiteOr(raw.width, 0),
      0,
      spec.fontSize * sample.length * 2,
    ),
    fontBoxAscent: fontBox.ascent,
    fontBoxDescent: fontBox.descent,
    source,
    canvasFont,
  }
}

function measureSample(
  spec: NormalizedTypographyFontSpec,
  sample: string,
  ownerDocument: Document | null,
): TypographyMetrics {
  const canvasFont = buildCanvasFont(spec)
  if (!ownerDocument) return fallbackMetrics(spec, canvasFont, sample)

  let cache = cacheByDocument.get(ownerDocument)
  if (!cache) {
    cache = new Map()
    cacheByDocument.set(ownerDocument, cache)
  }
  const key = cacheKey(spec, sample)
  const cached = cache.get(key)
  if (cached) return cached

  let measured = fallbackMetrics(spec, canvasFont, sample)
  try {
    const canvas = ownerDocument.createElement('canvas')
    const context = canvas.getContext('2d')
    if (context) {
      context.font = canvasFont
      context.textBaseline = 'alphabetic'
      const raw = context.measureText(sample) as CanvasTextMetricsLike
      measured = metricsFromTextMetrics(raw, spec, canvasFont, sample)
    }
  } catch {
    // SSR、happy-dom、被禁用的 Canvas 或损坏字体都不应阻断排版。
  }

  cache.set(key, measured)
  return measured
}

/**
 * 在指定 Document 的字体环境中度量。HTMLElement 也可作为 source，
 * 用于自动取它的 ownerDocument。缓存按 Document 隔离，因此导出 iframe
 * 不会复用主文档尚未加载或不同版本的用户字体度量。
 */
export function measureFontInk(
  fontSpec: TypographyFontSpec,
  source?: Document | HTMLElement | null,
): TypographyMetrics {
  const spec = normalizeSpec(fontSpec)
  const ownerDocument = documentFromSource(source)
  return measureSample(spec, TYPOGRAPHY_SAMPLES[spec.script], ownerDocument)
}

function inferScriptFromText(text: string): TypographyScript {
  const markerMatch = text.trim().match(/^[+-]?(\d+)[.)、]?$/u)
  if (markerMatch) {
    const digits = markerMatch[1].replace(/^0+(?=\d)/, '').length
    if (digits <= 1) return 'marker-1'
    if (digits === 2) return 'marker-2'
    return 'marker-3-plus'
  }
  if (/\p{Script=Han}/u.test(text)) return 'cjk'
  return 'latin'
}

/**
 * 度量任意实际文本的 ink box。与 measureFontInk 的稳定样本不同，
 * 该接口把 text 也纳入缓存键，适合列表展示层传入正在渲染的 `N.`。
 */
export function measureTextInk(
  request: MeasureTextInkRequest,
): TypographyMetrics {
  const spec = normalizeSpec({
    fontFamily: request.fontFamily,
    fontWeight: request.fontWeight,
    fontSize: request.fontSize,
    fontStyle: request.fontStyle,
    script: request.script ?? inferScriptFromText(request.text),
  })
  return measureSample(
    spec,
    request.text,
    documentFromSource(request.document),
  )
}

/** 从元素当前 computed style 生成度量请求，适合 Preview 直接接入。 */
export function fontSpecFromElement(
  element: HTMLElement,
  script: TypographyScript,
): TypographyFontSpec {
  let style: CSSStyleDeclaration | null = null
  try {
    style = element.ownerDocument.defaultView?.getComputedStyle(element) ?? null
  } catch {
    // 跨 realm/已卸载 iframe 可能在读 computedStyle 时报错。
  }
  return {
    fontFamily: style?.fontFamily || element.style.fontFamily || 'sans-serif',
    fontWeight: style?.fontWeight || element.style.fontWeight || '400',
    fontSize: Number.parseFloat(style?.fontSize || element.style.fontSize) ||
      DEFAULT_FONT_SIZE,
    fontStyle: style?.fontStyle || element.style.fontStyle || 'normal',
    script,
  }
}

export function measureElementInk(
  element: HTMLElement,
  script: TypographyScript,
): TypographyMetrics {
  return measureFontInk(fontSpecFromElement(element, script), element)
}

/**
 * 清理度量缓存。不传 source 则清空所有 Document（主文档+导出 iframe）。
 * 不提供按 family 精确失效：缓存键里的 fontFamily 是完整 computed
 * stack（如 `"Foo", sans-serif`），按单 family 匹配永远失配（CODE-REVIEW M4，
 * fontRegistry 因此始终全量清理）。
 */
export function clearTypographyMetricsCache(
  source?: Document | HTMLElement | null,
): void {
  if (source === undefined) {
    cacheByDocument = new WeakMap()
    return
  }
  const ownerDocument = documentFromSource(source)
  if (!ownerDocument) return
  cacheByDocument.delete(ownerDocument)
}

/**
 * 将移动对象（moving）的字形中线对齐到参考文字（reference）。
 * 返回正数下移、负数上移，可直接用于 CSS translateY。
 */
export function opticalCenterShift(
  reference: TypographyInkBox,
  moving: TypographyInkBox,
  maxShiftPx = Number.POSITIVE_INFINITY,
): number {
  const rawShift =
    finiteOr(reference.centerFromBaseline, 0) -
    finiteOr(moving.centerFromBaseline, 0)
  const safeMax = Math.max(0, finiteOr(maxShiftPx, Number.MAX_SAFE_INTEGER))
  return clamp(rawShift, -safeMax, safeMax)
}

/** 有序列表序号相对首行中文的默认光学偏移，极限为 0.25em。 */
export function orderedListMarkerShift(
  text: TypographyMetrics,
  marker: TypographyMetrics,
  maxShiftPx =
    Math.min(text.fontSize, marker.fontSize) * DEFAULT_MAX_SHIFT_MULTIPLIER,
): number {
  return opticalCenterShift(text, marker, maxShiftPx)
}

function normalizedLineHeight(lineHeightPx: number, fontSize: number): number {
  const fallback = fontSize * DEFAULT_LINE_HEIGHT_MULTIPLIER
  return clamp(
    finiteOr(lineHeightPx, fallback),
    Math.max(1, fontSize * 0.5),
    fontSize * 5,
  )
}

/**
 * 将 H2 字形框转成竖线 top/height。baseline 依据 Canvas 的 fontBoundingBox
 * 放入 CSS line-height，多行时使用首行到末行的联合字形框，而不是只跟第一行。
 */
export function h2BarLayout(
  metrics: TypographyMetrics,
  lineHeightPx: number,
  options: H2BarLayoutOptions = {},
): H2BarLayout {
  const lineHeight = normalizedLineHeight(lineHeightPx, metrics.fontSize)
  const lineCount = clamp(
    Math.trunc(finiteOr(options.lineCount ?? 1, 1)),
    1,
    100,
  )
  const fontBoxHeight = Math.max(
    1,
    finiteOr(metrics.fontBoxAscent + metrics.fontBoxDescent, metrics.fontSize),
  )
  const halfLeading = (lineHeight - fontBoxHeight) / 2
  const baselineFromFirstLineTop = halfLeading + metrics.fontBoxAscent
  const firstInkCenter =
    baselineFromFirstLineTop + finiteOr(metrics.centerFromBaseline, 0)
  const blockHeight = lineHeight * lineCount
  const rawCenter = firstInkCenter + ((lineCount - 1) * lineHeight) / 2
  const defaultMaxShift = metrics.fontSize * DEFAULT_MAX_SHIFT_MULTIPLIER
  const maxShift = Math.max(
    0,
    finiteOr(options.maxShiftPx ?? defaultMaxShift, defaultMaxShift),
  )
  const shiftFromBlockCenter = clamp(
    rawCenter - blockHeight / 2,
    -maxShift,
    maxShift,
  )
  const center = blockHeight / 2 + shiftFromBlockCenter
  const heightScale = clamp(
    finiteOr(options.heightScale ?? 1, 1),
    0.5,
    1.5,
  )
  const firstAndLastInkHeight =
    clamp(
      metrics.height * heightScale,
      Math.max(1, metrics.fontSize * 0.35),
      metrics.fontSize * 1.5,
    ) +
    (lineCount - 1) * lineHeight
  const height = clamp(firstAndLastInkHeight, 1, blockHeight * 1.5)

  return {
    top: center - height / 2,
    height,
    center,
    shiftFromBlockCenter,
    lineCount,
  }
}
