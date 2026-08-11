import {
  decorateOpticalOrderedListMarkers,
  refreshOpticalOrderedListMarkerColumns,
} from './opticalListMarkers'
import {
  TYPOGRAPHY_SAMPLES,
  clearTypographyMetricsCache,
  fontSpecFromElement,
  h2BarLayout,
  markerScriptForValue,
  measureElementInk,
  measureFontInk,
  measureTextInk,
  orderedListMarkerShift,
  type TypographyScript,
} from './typographyMetrics'

const H2_CENTER_PROPERTY = '--h2-optical-center-y'
const H2_HEIGHT_PROPERTY = '--h2-optical-bar-height'
const MARKER_SHIFT_PROPERTY = '--optical-list-marker-shift-y'
const BASELINE_PROBE_ATTRIBUTE = 'data-optical-baseline-probe'
const DEFAULT_FONT_TIMEOUT_MS = 3_000
// 与 html2canvas-pro TextRenderer.hasCJKCharacters 保持同一字符范围。
// 当 letter-spacing 非 0 时，它会逐 grapheme 为这些字符切到
// ideographic baseline，其余拉丁字母/数字仍使用 alphabetic。
const HTML2CANVAS_CJK_CHARACTER =
  /[\u2E80-\u2FFF\u3000-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF01-\uFFEF]/u

export interface TypographyCalibrationOptions {
  signal?: AbortSignal
  fontTimeoutMs?: number
  /** ThemePreview 只需标题校准，不应命令式改动 React 列表子树。 */
  includeLists?: boolean
  /**
   * 预览超时后，字体最终到达时可再校准一次。导出必须关闭，
   * 避免 html2canvas 取样期间的离屏副本又发生布局变化。
   */
  recalibrateOnLateFonts?: boolean
  /**
   * html2canvas 用 `Range.top + fontSize` 作文字 baseline，且字距非 0
   * 时将 CJK 切到 ideographic baseline。导出 stage 需按这个真实
   * 栅格化模型校准；普通预览仍使用浏览器 DOM baseline。
   */
  renderTarget?: 'browser' | 'html2canvas'
}

export interface TypographyFontIssue {
  font: string
  reason: 'timeout' | 'load-error'
}

export interface TypographyCalibrationResult {
  status: 'ready' | 'degraded' | 'aborted'
  h2Count: number
  markerCount: number
  fontIssues: TypographyFontIssue[]
}

interface CalibrationCounts {
  h2Count: number
  markerCount: number
}

interface FontLoadRequest {
  font: string
  sample: string
}

interface FontLoadOutcome {
  timedOut: boolean
  issues: TypographyFontIssue[]
  completion: Promise<PromiseSettledResult<FontFace[]>[]>
}

function roundCssPx(value: number): string {
  const rounded = Math.round(value * 1_000) / 1_000
  return `${Object.is(rounded, -0) ? 0 : rounded}px`
}

function finitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function scriptForText(text: string | null | undefined): TypographyScript {
  return HTML2CANVAS_CJK_CHARACTER.test(text ?? '') ? 'cjk' : 'latin'
}

function computedStyle(element: HTMLElement): CSSStyleDeclaration | null {
  try {
    return element.ownerDocument.defaultView?.getComputedStyle(element) ?? null
  } catch {
    return null
  }
}

/** getBoundingClientRect 会包含 Preview / ThemePreview 祖先的 transform。 */
function pageScaleY(page: HTMLElement): number {
  const rect = page.getBoundingClientRect()
  const layoutHeight =
    page.offsetHeight ||
    Number.parseFloat(computedStyle(page)?.height ?? '') ||
    0
  if (!finitePositive(rect.height) || !finitePositive(layoutHeight)) return 1
  const scale = rect.height / layoutHeight
  return finitePositive(scale) ? scale : 1
}

function createBaselineProbe(
  ownerDocument: Document,
  position: 'first' | 'last',
): HTMLSpanElement {
  const probe = ownerDocument.createElement('span')
  probe.setAttribute(BASELINE_PROBE_ATTRIBUTE, position)
  probe.setAttribute('aria-hidden', 'true')
  probe.setAttribute('contenteditable', 'false')
  probe.style.cssText = [
    'display:inline-block',
    'width:0',
    'height:0',
    'padding:0',
    'margin:0',
    'border:0',
    'line-height:0',
    'vertical-align:baseline',
    'overflow:hidden',
    'pointer-events:none',
  ].join(';')
  return probe
}

function lineHeightPx(element: HTMLElement, fontSize: number): number {
  const parsed = Number.parseFloat(computedStyle(element)?.lineHeight ?? '')
  return finitePositive(parsed) ? parsed : fontSize * 1.2
}

function fallbackH2Geometry(
  heading: HTMLElement,
  originalHeight: number,
): { center: number; height: number } {
  const script = scriptForText(heading.textContent)
  const metrics = measureElementInk(heading, script)
  const lineHeight = lineHeightPx(heading, metrics.fontSize)
  const lineCount = finitePositive(originalHeight)
    ? Math.max(1, Math.round(originalHeight / lineHeight))
    : 1
  const layout = h2BarLayout(metrics, lineHeight, { lineCount })
  return { center: layout.center, height: layout.height }
}

interface GraphemeSlice {
  text: string
  start: number
  end: number
}

function graphemeSlices(text: string): GraphemeSlice[] {
  if (typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(undefined, {
      granularity: 'grapheme',
    })
    return Array.from(segmenter.segment(text), (item) => ({
      text: item.segment,
      start: item.index,
      end: item.index + item.segment.length,
    }))
  }

  const slices: GraphemeSlice[] = []
  let offset = 0
  for (const grapheme of Array.from(text)) {
    slices.push({
      text: grapheme,
      start: offset,
      end: offset + grapheme.length,
    })
    offset += grapheme.length
  }
  return slices
}

function setCanvasFont(
  context: CanvasRenderingContext2D,
  style: CSSStyleDeclaration,
  fontSize: number,
): void {
  const fontVariant = style.fontVariant?.trim() || 'normal'
  context.font = [
    style.fontStyle || 'normal',
    fontVariant,
    style.fontWeight || '400',
    `${fontSize}px`,
    style.fontFamily || 'sans-serif',
  ].join(' ')
}

interface TextRun {
  element: HTMLElement
  text: string
}

interface VisibleGrapheme extends TextRun {
  rect: DOMRect
}

function textRunsWithin(root: HTMLElement): TextRun[] {
  const ownerDocument = root.ownerDocument
  const showText = ownerDocument.defaultView?.NodeFilter.SHOW_TEXT ?? 4
  const walker = ownerDocument.createTreeWalker(root, showText)
  const runs: TextRun[] = []
  let node = walker.nextNode()
  while (node) {
    const text = node.textContent?.trim() ?? ''
    const element = node.parentElement
    if (
      text &&
      element &&
      !element.closest(`[${BASELINE_PROBE_ATTRIBUTE}]`) &&
      !element.closest('[data-optical-list-marker]')
    ) {
      runs.push({ element, text })
    }
    node = walker.nextNode()
  }
  return runs
}

function visibleGraphemes(
  root: HTMLElement,
  firstLineOnly = false,
): VisibleGrapheme[] {
  const ownerDocument = root.ownerDocument
  const showText = ownerDocument.defaultView?.NodeFilter.SHOW_TEXT ?? 4
  const walker = ownerDocument.createTreeWalker(root, showText)
  const graphemes: VisibleGrapheme[] = []
  let firstLineBand: { top: number; bottom: number } | null = null
  let node = walker.nextNode()
  while (node) {
    const value = node.textContent ?? ''
    const element = node.parentElement
    if (
      !value ||
      !element ||
      element.closest(`[${BASELINE_PROBE_ATTRIBUTE}]`) ||
      element.closest('[data-optical-list-marker]')
    ) {
      node = walker.nextNode()
      continue
    }
    const range = ownerDocument.createRange()
    try {
      for (const grapheme of graphemeSlices(value)) {
        if (!grapheme.text.trim()) continue
        range.setStart(node, grapheme.start)
        range.setEnd(node, grapheme.end)
        for (const rect of Array.from(range.getClientRects())) {
          if (!finitePositive(rect.height)) continue
          if (firstLineOnly && firstLineBand) {
            const overlap =
              Math.min(firstLineBand.bottom, rect.bottom) -
              Math.max(firstLineBand.top, rect.top)
            const minHeight = Math.min(
              firstLineBand.bottom - firstLineBand.top,
              rect.height,
            )
            if (overlap <= Math.max(0.5, minHeight * 0.25)) {
              return graphemes
            }
            firstLineBand.top = Math.min(firstLineBand.top, rect.top)
            firstLineBand.bottom = Math.max(firstLineBand.bottom, rect.bottom)
          } else if (firstLineOnly) {
            firstLineBand = { top: rect.top, bottom: rect.bottom }
          }
          graphemes.push({ element, text: grapheme.text, rect })
        }
      }
    } catch {
      // happy-dom / 已卸载 iframe 可能没有 Range layout；调用方会走 text run fallback。
    } finally {
      range.detach()
    }
    node = walker.nextNode()
  }
  return graphemes
}

function graphemeMetrics(run: TextRun) {
  const script = scriptForText(run.text)
  const spec = fontSpecFromElement(run.element, script)
  return measureTextInk({
    document: run.element.ownerDocument,
    fontFamily: spec.fontFamily,
    fontWeight: spec.fontWeight,
    fontSize: spec.fontSize,
    fontStyle: spec.fontStyle,
    text: run.text,
    script,
  })
}

function unionRunMetrics(runs: TextRun[]) {
  const measured = runs.map(graphemeMetrics)
  const first = measured[0]
  if (!first) return null
  const ascent = Math.max(...measured.map((item) => item.ascent))
  const descent = Math.max(...measured.map((item) => item.descent))
  return {
    ...first,
    ascent,
    descent,
    height: ascent + descent,
    centerFromBaseline: (descent - ascent) / 2,
    fontSize: Math.max(...measured.map((item) => item.fontSize)),
    fontBoxAscent: Math.max(...measured.map((item) => item.fontBoxAscent)),
    fontBoxDescent: Math.max(...measured.map((item) => item.fontBoxDescent)),
  }
}

function visualLineMetrics(root: HTMLElement, firstLineOnly = false) {
  const graphemes = visibleGraphemes(root, firstLineOnly)
  if (graphemes.length === 0) return []
  const lines: Array<{
    top: number
    bottom: number
    runs: VisibleGrapheme[]
  }> = []
  for (const grapheme of graphemes) {
    const top = grapheme.rect.top
    const bottom = grapheme.rect.bottom
    const current = lines.at(-1)
    if (current) {
      const overlap = Math.min(current.bottom, bottom) - Math.max(current.top, top)
      const minHeight = Math.min(current.bottom - current.top, bottom - top)
      if (overlap > Math.max(0.5, minHeight * 0.25)) {
        current.top = Math.min(current.top, top)
        current.bottom = Math.max(current.bottom, bottom)
        current.runs.push(grapheme)
        continue
      }
    }
    lines.push({ top, bottom, runs: [grapheme] })
  }
  return lines
    .map((line) => unionRunMetrics(line.runs))
    .filter((metrics): metrics is NonNullable<typeof metrics> => metrics !== null)
}

function firstRunMetrics(root: HTMLElement) {
  const lines = visualLineMetrics(root, true)
  if (lines[0]) return lines[0]
  const first = textRunsWithin(root)[0]
  return first ? graphemeMetrics(first) : null
}

function html2CanvasH2Geometry(
  page: HTMLElement,
  heading: HTMLElement,
  originalRect: DOMRect,
  originalHeight: number,
): { center: number; height: number } | null {
  const ownerDocument = heading.ownerDocument
  const style = computedStyle(heading)
  if (!style) return null
  const scaleY = pageScaleY(page)
  const headingFontSize = Number.parseFloat(style.fontSize)
  if (!finitePositive(headingFontSize)) return null

  try {
    const canvas = ownerDocument.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) return null
    const inkTops: number[] = []
    const inkBottoms: number[] = []
    const showText =
      ownerDocument.defaultView?.NodeFilter.SHOW_TEXT ?? 4
    const walker = ownerDocument.createTreeWalker(heading, showText)
    let node = walker.nextNode()
    while (node) {
      const value = node.textContent ?? ''
      if (value) {
        const element = node.parentElement ?? heading
        const nodeStyle = computedStyle(element) ?? style
        const nodeFontSize = Number.parseFloat(nodeStyle.fontSize)
        if (finitePositive(nodeFontSize)) {
          setCanvasFont(context, nodeStyle, nodeFontSize)
          const letterSpacing = Number.parseFloat(nodeStyle.letterSpacing)
          const usesPerScriptBaseline =
            Number.isFinite(letterSpacing) && letterSpacing !== 0
          const range = ownerDocument.createRange()
          try {
            for (const grapheme of graphemeSlices(value)) {
              range.setStart(node, grapheme.start)
              range.setEnd(node, grapheme.end)
              context.textBaseline =
                usesPerScriptBaseline &&
                HTML2CANVAS_CJK_CHARACTER.test(grapheme.text)
                  ? 'ideographic'
                  : 'alphabetic'
              const measured = context.measureText(grapheme.text)
              const ascent = measured.actualBoundingBoxAscent
              const descent = measured.actualBoundingBoxDescent
              if (
                !Number.isFinite(ascent) ||
                !Number.isFinite(descent) ||
                ascent + descent <= 0
              ) {
                continue
              }
              for (const rect of Array.from(range.getClientRects())) {
                if (!finitePositive(rect.height)) continue
                const top = (rect.top - originalRect.top) / scaleY
                if (!Number.isFinite(top)) continue
                // html2canvas-pro 的实际绘制坐标：
                // fillText(grapheme, rangeBounds.left, rangeBounds.top + fontSize)。
                const baseline = top + nodeFontSize
                inkTops.push(baseline - ascent)
                inkBottoms.push(baseline + descent)
              }
            }
          } finally {
            range.detach()
          }
        }
      }
      node = walker.nextNode()
    }
    if (inkTops.length === 0 || inkBottoms.length === 0) return null

    const inkTop = Math.min(...inkTops)
    const inkBottom = Math.max(...inkBottoms)
    const rawCenter = (inkTop + inkBottom) / 2
    const blockCenter = originalHeight / 2
    const center = blockCenter + clamp(
      rawCenter - blockCenter,
      // 真实预设里 Songti 的 ideographic baseline 会让 ink 中线
      // 偏离 line box 约 0.30em；0.25em 会把正确值反向夹坏。
      // 仍保留 0.40em 安全阈值，防止损坏字体把竖线推离标题。
      -headingFontSize * 0.4,
      headingFontSize * 0.4,
    )
    return {
      center,
      height: clamp(
        inkBottom - inkTop,
        Math.max(1, headingFontSize * 0.35),
        Math.max(1, originalHeight * 1.5),
      ),
    }
  } catch {
    return null
  }
}

function calibrateH2(
  page: HTMLElement,
  heading: HTMLElement,
  renderTarget: 'browser' | 'html2canvas',
): boolean {
  heading
    .querySelectorAll<HTMLElement>(`[${BASELINE_PROBE_ATTRIBUTE}]`)
    .forEach((probe) => probe.remove())
  const text = heading.textContent?.trim() ?? ''
  if (!text) {
    heading.style.removeProperty(H2_CENTER_PROPERTY)
    heading.style.removeProperty(H2_HEIGHT_PROPERTY)
    heading.removeAttribute('data-optical-h2')
    return false
  }

  const scaleY = pageScaleY(page)
  const originalRect = heading.getBoundingClientRect()
  const originalHeight = originalRect.height / scaleY
  const script = scriptForText(text)
  const metrics = measureElementInk(heading, script)
  const fallback = fallbackH2Geometry(heading, originalHeight)
  const rendererGeometry =
    renderTarget === 'html2canvas'
      ? html2CanvasH2Geometry(page, heading, originalRect, originalHeight)
      : null
  if (rendererGeometry) {
    heading.style.setProperty(
      H2_CENTER_PROPERTY,
      roundCssPx(rendererGeometry.center),
    )
    heading.style.setProperty(
      H2_HEIGHT_PROPERTY,
      roundCssPx(rendererGeometry.height),
    )
    heading.setAttribute('data-optical-h2', 'ready')
    return true
  }
  const lineMetrics = visualLineMetrics(heading)
  const firstLineMetrics = lineMetrics[0] ?? metrics
  const lastLineMetrics = lineMetrics.at(-1) ?? metrics
  const firstProbe = createBaselineProbe(heading.ownerDocument, 'first')
  const lastProbe = createBaselineProbe(heading.ownerDocument, 'last')

  let center = fallback.center
  let height = fallback.height
  try {
    heading.prepend(firstProbe)
    heading.append(lastProbe)
    const firstRect = firstProbe.getBoundingClientRect()
    const lastRect = lastProbe.getBoundingClientRect()
    const firstBaseline = (firstRect.top - originalRect.top) / scaleY
    let lastBaseline = (lastRect.top - originalRect.top) / scaleY

    if (
      finitePositive(originalHeight) &&
      Number.isFinite(firstBaseline) &&
      Number.isFinite(lastBaseline)
    ) {
      const cssLineHeight = lineHeightPx(heading, metrics.fontSize)
      const lineCount = Math.max(1, Math.round(originalHeight / cssLineHeight))
      const measuredLineStep = originalHeight / lineCount
      const expectedLastBaseline =
        firstBaseline + (lineCount - 1) * measuredLineStep

      // 极端情况下，末尾零宽 probe 会被浏览器挤到新的空行。
      // 这时用原始 block 高度推回末行 baseline，不让探针本身改变设计。
      if (
        Math.abs(lastBaseline - expectedLastBaseline) >
        Math.max(1, measuredLineStep * 0.45)
      ) {
        lastBaseline = expectedLastBaseline
      }

      const rawTop = firstBaseline - firstLineMetrics.ascent
      const rawBottom = lastBaseline + lastLineMetrics.descent
      if (Number.isFinite(rawTop) && rawBottom > rawTop) {
        const rawCenter = (rawTop + rawBottom) / 2
        const blockCenter = originalHeight / 2
        const maxShift = metrics.fontSize * 0.25
        center = blockCenter + clamp(
          rawCenter - blockCenter,
          -maxShift,
          maxShift,
        )
        height = clamp(
          rawBottom - rawTop,
          Math.max(1, metrics.fontSize * 0.35),
          Math.max(1, originalHeight * 1.5),
        )
      }
    }
  } finally {
    firstProbe.remove()
    lastProbe.remove()
  }

  heading.style.setProperty(H2_CENTER_PROPERTY, roundCssPx(center))
  heading.style.setProperty(H2_HEIGHT_PROPERTY, roundCssPx(height))
  heading.setAttribute('data-optical-h2', 'ready')
  return true
}

function isListItem(element: Element | null): element is HTMLLIElement {
  return element?.tagName === 'LI'
}

function directReferenceElement(item: HTMLLIElement): HTMLElement {
  const paragraph = Array.from(item.children).find(
    (child): child is HTMLParagraphElement => child.tagName === 'P',
  )
  if (paragraph) return paragraph
  const directContent = Array.from(item.children).find(
    (child): child is HTMLElement =>
      child.tagName !== 'OL' &&
      child.tagName !== 'UL' &&
      !child.hasAttribute('data-optical-list-marker'),
  )
  return directContent ?? item
}

function markerAdvanceWidth(marker: HTMLSpanElement, label: string): number | null {
  const spec = fontSpecFromElement(marker, markerScriptForValue(Number(label.replace(/\.$/, ''))))
  const metrics = measureTextInk({
    document: marker.ownerDocument,
    fontFamily: spec.fontFamily,
    fontWeight: spec.fontWeight,
    fontSize: spec.fontSize,
    fontStyle: spec.fontStyle,
    text: label,
    script: spec.script,
  })
  return finitePositive(metrics.advanceWidth) ? metrics.advanceWidth : null
}

function calibrateLists(root: HTMLElement): number {
  const widthOptions = {
    measureMarkerWidth: (marker: HTMLSpanElement, context: { label: string }) =>
      markerAdvanceWidth(marker, context.label),
  }
  decorateOpticalOrderedListMarkers(root, widthOptions)
  refreshOpticalOrderedListMarkerColumns(root, widthOptions)

  const markers = Array.from(
    root.querySelectorAll<HTMLSpanElement>(
      'span[data-optical-list-marker]',
    ),
  )
  for (const marker of markers) {
    const item = marker.parentElement
    if (!isListItem(item)) continue
    const referenceElement = directReferenceElement(item)
    const reference =
      firstRunMetrics(referenceElement) ??
      measureFontInk(
        fontSpecFromElement(
          referenceElement,
          scriptForText(referenceElement.textContent),
        ),
        referenceElement,
      )
    const value = Number(marker.dataset.opticalListValue)
    const markerScript = markerScriptForValue(value)
    const markerSpec = fontSpecFromElement(marker, markerScript)
    const markerMetrics = measureTextInk({
      document: marker.ownerDocument,
      fontFamily: markerSpec.fontFamily,
      fontWeight: markerSpec.fontWeight,
      fontSize: markerSpec.fontSize,
      fontStyle: markerSpec.fontStyle,
      text: marker.textContent ?? `${value}.`,
      script: markerScript,
    })
    marker.style.setProperty(
      MARKER_SHIFT_PROPERTY,
      roundCssPx(orderedListMarkerShift(reference, markerMetrics)),
    )
  }
  return markers.length
}

export function calibratePageTypographyNow(
  page: HTMLElement,
  includeLists: boolean,
  renderTarget: 'browser' | 'html2canvas' = 'browser',
): CalibrationCounts {
  if (!page.isConnected) return { h2Count: 0, markerCount: 0 }
  let h2Count = 0
  for (const heading of Array.from(page.querySelectorAll<HTMLElement>('.content h2'))) {
    if (calibrateH2(page, heading, renderTarget)) h2Count += 1
  }
  return {
    h2Count,
    markerCount: includeLists ? calibrateLists(page) : 0,
  }
}

function fontLoadRequest(element: HTMLElement, sample: string): FontLoadRequest | null {
  const style = computedStyle(element)
  if (!style) return null
  const fontFamily = style.fontFamily.trim()
  const fontSize = style.fontSize.trim()
  if (!fontFamily || !fontSize) return null
  return {
    font: `${style.fontStyle || 'normal'} ${style.fontWeight || '400'} ${fontSize} ${fontFamily}`,
    sample,
  }
}

function collectFontLoadRequests(
  page: HTMLElement,
  includeLists: boolean,
): FontLoadRequest[] {
  const requests = new Map<string, FontLoadRequest>()
  const add = (element: HTMLElement, sample: string) => {
    const request = fontLoadRequest(element, sample)
    if (!request) return
    requests.set(`${request.font}\u0000${request.sample}`, request)
  }
  const addRuns = (element: HTMLElement) => {
    const runs = textRunsWithin(element)
    if (runs.length === 0) {
      const script = scriptForText(element.textContent)
      add(element, TYPOGRAPHY_SAMPLES[script])
      const actualText = element.textContent?.trim()
      if (actualText) add(element, actualText)
      return
    }
    for (const run of runs) {
      add(run.element, TYPOGRAPHY_SAMPLES[scriptForText(run.text)])
      add(run.element, run.text)
    }
  }

  for (const heading of Array.from(page.querySelectorAll<HTMLElement>('.content h2'))) {
    addRuns(heading)
  }
  if (includeLists) {
    for (const marker of Array.from(
      page.querySelectorAll<HTMLSpanElement>('span[data-optical-list-marker]'),
    )) {
      add(marker, marker.textContent ?? '1.')
      const item = marker.parentElement
      if (isListItem(item)) {
        const reference = directReferenceElement(item)
        addRuns(reference)
      }
    }
  }
  return Array.from(requests.values())
}

function normalizedTimeout(value: number | undefined): number {
  return Number.isFinite(value) && (value ?? 0) >= 0
    ? Math.round(value ?? DEFAULT_FONT_TIMEOUT_MS)
    : DEFAULT_FONT_TIMEOUT_MS
}

async function loadFonts(
  ownerDocument: Document,
  requests: FontLoadRequest[],
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<FontLoadOutcome | 'aborted' | 'unsupported'> {
  const fonts = ownerDocument.fonts
  if (!fonts || typeof fonts.load !== 'function' || requests.length === 0) {
    return 'unsupported'
  }

  const completion = Promise.allSettled(
    requests.map((request) => fonts.load(request.font, request.sample)),
  )
  let timeoutId = 0
  let removeAbortListener: () => void = () => {}
  const timeout = new Promise<'timeout'>((resolve) => {
    timeoutId = ownerDocument.defaultView?.setTimeout(
      () => resolve('timeout'),
      timeoutMs,
    ) ?? 0
  })
  const aborted = new Promise<'aborted'>((resolve) => {
    if (!signal) return
    const handleAbort = () => resolve('aborted')
    if (signal.aborted) handleAbort()
    else {
      signal.addEventListener('abort', handleAbort, { once: true })
      removeAbortListener = () => signal.removeEventListener('abort', handleAbort)
    }
  })

  const outcome = await Promise.race([
    completion.then((results) => ({ type: 'loaded' as const, results })),
    timeout,
    aborted,
  ])
  if (timeoutId) ownerDocument.defaultView?.clearTimeout(timeoutId)
  removeAbortListener()
  if (outcome === 'aborted') return 'aborted'
  if (outcome === 'timeout') {
    return {
      timedOut: true,
      issues: requests.map(({ font }) => ({ font, reason: 'timeout' })),
      completion,
    }
  }

  return {
    timedOut: false,
    issues: outcome.results.flatMap((result, index) =>
      result.status === 'rejected'
        ? [{ font: requests[index].font, reason: 'load-error' as const }]
        : [],
    ),
    completion,
  }
}

/**
 * 为一张真实 `.page` 校准字体伴随元素。
 *
 * 函数在第一个 await 之前就会完成首轮 DOM 装饰，因此 React
 * useLayoutEffect 可以在首帧绘制前关掉原生序号。字体加载后清空缓存
 * 再测一次，避免把 fallback 度量永久留在当前 family 上。
 */
export async function calibratePageTypography(
  page: HTMLElement,
  options: TypographyCalibrationOptions = {},
): Promise<TypographyCalibrationResult> {
  const includeLists = options.includeLists !== false
  const renderTarget = options.renderTarget ?? 'browser'
  const firstCounts = calibratePageTypographyNow(
    page,
    includeLists,
    renderTarget,
  )
  if (options.signal?.aborted) {
    return { status: 'aborted', ...firstCounts, fontIssues: [] }
  }

  const requests = collectFontLoadRequests(page, includeLists)
  const loaded = await loadFonts(
    page.ownerDocument,
    requests,
    normalizedTimeout(options.fontTimeoutMs),
    options.signal,
  )
  if (loaded === 'aborted' || options.signal?.aborted) {
    return { status: 'aborted', ...firstCounts, fontIssues: [] }
  }
  if (loaded === 'unsupported') {
    return { status: 'ready', ...firstCounts, fontIssues: [] }
  }

  if (loaded.timedOut) {
    if (options.recalibrateOnLateFonts !== false) {
      void loaded.completion.then(() => {
        if (options.signal?.aborted || !page.isConnected) return
        clearTypographyMetricsCache(page.ownerDocument)
        calibratePageTypographyNow(page, includeLists, renderTarget)
      })
    }
    return {
      status: 'degraded',
      ...firstCounts,
      fontIssues: loaded.issues,
    }
  }

  clearTypographyMetricsCache(page.ownerDocument)
  if (options.signal?.aborted || !page.isConnected) {
    return { status: 'aborted', ...firstCounts, fontIssues: [] }
  }
  const finalCounts = calibratePageTypographyNow(
    page,
    includeLists,
    renderTarget,
  )
  return {
    status: loaded.issues.length > 0 ? 'degraded' : 'ready',
    ...finalCounts,
    fontIssues: loaded.issues,
  }
}
