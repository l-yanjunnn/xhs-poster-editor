import {
  classifyLayoutGrapheme,
  deterministicLayoutSnapshotHash,
  solveDeterministicTextLayout,
  type DeterministicLayoutLine,
  type LayoutAtomInput,
  type LayoutAtomKind,
} from './deterministicTextLayout'
import { freezeOpticalListMarkerGeometry } from './opticalTypography'
import { fnv1a32Hex } from './stableHash'

export interface DeterministicFontRequest {
  family: string
  weight: string
  style: string
  sample: string
}

export interface DeterministicTypographyIssue {
  code:
    | 'invalid-width'
    | 'ink-metrics-unmeasurable'
    | 'unsatisfied-line'
    | 'text-mismatch'
    | 'baseline-unmeasurable'
    | 'baseline-out-of-range'
  blockIndex: number
  blockText: string
  message: string
}

export type DeterministicLayoutIssueSeverity = 'warning' | 'blocking'

export interface SerializedLayoutIssue {
  code: string
  blockIndex: number
  blockText: string
  message: string
}

/**
 * 预检分级：只有「DOM 与文字完整、字体和 baseline 已校准、当前预览
 * 可实际渲染，仅排版质量约束未满足」的 unsatisfied-line 是可覆盖
 * 警告。其余与未知 code 一律硬阻断——失败时闭合，绝不把新问题
 * 默认放行。
 */
export function deterministicLayoutIssueSeverity(
  code: string,
): DeterministicLayoutIssueSeverity {
  return code === 'unsatisfied-line' ? 'warning' : 'blocking'
}

export function hasBlockingDeterministicLayoutIssues(
  issues: ReadonlyArray<{ code?: string }>,
): boolean {
  return issues.some(
    (issue) =>
      deterministicLayoutIssueSeverity(issue.code ?? '') === 'blocking',
  )
}

/** 从页面 dataset 读取结构化排版问题；历史页面缺字段时给空串。 */
export function readDeterministicLayoutIssues(
  page: HTMLElement,
): SerializedLayoutIssue[] {
  try {
    const parsed = JSON.parse(
      page.dataset.layoutIssues ?? '[]',
    ) as Array<Partial<SerializedLayoutIssue>>
    if (!Array.isArray(parsed)) return []
    return parsed.map((issue) => ({
      code: typeof issue.code === 'string' ? issue.code : '',
      blockIndex:
        typeof issue.blockIndex === 'number' ? issue.blockIndex : -1,
      blockText: typeof issue.blockText === 'string' ? issue.blockText : '',
      message: typeof issue.message === 'string' ? issue.message : '',
    }))
  } catch {
    return []
  }
}

export interface DeterministicTypographyResult {
  snapshotId: string
  blockCount: number
  lineCount: number
  fontRequests: DeterministicFontRequest[]
  issues: DeterministicTypographyIssue[]
}

interface LayoutRunStyle {
  font: string
  family: string
  weight: string
  fontStyle: string
  fontSize: number
  letterSpacing: number
  color: string
  underlineThickness: number
}

interface LayoutAtomMeta {
  input: LayoutAtomInput
  wrappers: HTMLElement[]
  style: LayoutRunStyle
  underline: boolean
  highlightColor: string | null
  actualAscent: number
  actualDescent: number
}

interface TextMetricsLike {
  width: number
  actualBoundingBoxLeft?: number
  actualBoundingBoxRight?: number
  actualBoundingBoxAscent?: number
  actualBoundingBoxDescent?: number
  fontBoundingBoxAscent?: number
  fontBoundingBoxDescent?: number
}

interface BlockLayoutResult {
  snapshotId: string
  lineCount: number
  fontRequests: DeterministicFontRequest[]
  issues: DeterministicTypographyIssue[]
}

interface LayoutOptions {
  sourceHtml: string
  state?: 'pending' | 'ready'
}

const BLOCK_SELECTOR = 'p, h1, h2, h3'
const TRANSPARENT_COLORS = new Set([
  'transparent',
  'rgba(0, 0, 0, 0)',
  'rgba(0,0,0,0)',
])

let canvasContext: CanvasRenderingContext2D | null | undefined
let canvasGetContext: HTMLCanvasElement['getContext'] | undefined

function finite(value: number | undefined, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : fallback
}

function measuredNumber(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : null
}

function cssPixels(value: string, fallback = 0): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function context2d(): CanvasRenderingContext2D | null {
  const currentGetContext = HTMLCanvasElement.prototype.getContext
  // 测试环境和 canvas polyfill 可能替换 getContext。把 provider 身份也
  // 纳入缓存键，避免继续使用替换前缓存的 null/旧 context。
  if (
    canvasContext !== undefined &&
    canvasGetContext === currentGetContext
  ) {
    return canvasContext
  }
  try {
    canvasGetContext = currentGetContext
    canvasContext = document.createElement('canvas').getContext('2d')
  } catch {
    canvasGetContext = currentGetContext
    canvasContext = null
  }
  return canvasContext
}

function canvasFont(style: CSSStyleDeclaration): string {
  const fontStyle = style.fontStyle || 'normal'
  const fontVariant = style.fontVariant || 'normal'
  const fontWeight = style.fontWeight || '400'
  const fontSize = style.fontSize || '16px'
  const fontFamily = style.fontFamily || 'sans-serif'
  // Canvas 2D 在当前 Chromium 仍会拒绝包含 font-stretch 的
  // CSS Fonts Level 4 shorthand，并悄然退回 10px sans-serif。
  return `${fontStyle} ${fontVariant} ${fontWeight} ${fontSize} ${fontFamily}`
}

function fallbackAdvance(text: string, fontSize: number): number {
  const kind = classifyLayoutGrapheme(text)
  if (
    kind === 'han' ||
    kind === 'opening-punctuation' ||
    kind === 'closing-punctuation' ||
    kind === 'middle-punctuation'
  ) {
    return fontSize
  }
  if (kind === 'space') return fontSize * 0.25
  return fontSize * 0.6
}

function measureText(
  text: string,
  runStyle: LayoutRunStyle,
): TextMetricsLike {
  const context = context2d()
  if (!context) {
    // 近似指标 fallback 是 jsdom 单测的排版基座（测试环境无 Canvas），
    // 引擎层必须保持宽容。生产端 Canvas 被禁用的 fail-closed 由导出预检
    // 的 Canvas 探针负责（App 的 handleExport），不在这里阻断。
    return {
      width: fallbackAdvance(text, runStyle.fontSize),
      actualBoundingBoxAscent: runStyle.fontSize * 0.82,
      actualBoundingBoxDescent: runStyle.fontSize * 0.18,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: fallbackAdvance(text, runStyle.fontSize),
      fontBoundingBoxAscent: runStyle.fontSize * 0.88,
      fontBoundingBoxDescent: runStyle.fontSize * 0.22,
    }
  }
  context.font = runStyle.font
  context.textBaseline = 'alphabetic'
  context.fontKerning = 'normal'
  return context.measureText(text)
}

function runStyleFor(element: HTMLElement): LayoutRunStyle {
  const style = window.getComputedStyle(element)
  const fontSize = Math.max(1, cssPixels(style.fontSize, 16))
  const decorationThickness = cssPixels(style.textDecorationThickness)
  return {
    font: canvasFont(style),
    family: style.fontFamily || 'sans-serif',
    weight: style.fontWeight || '400',
    fontStyle: style.fontStyle || 'normal',
    fontSize,
    letterSpacing:
      style.letterSpacing === 'normal'
        ? 0
        : cssPixels(style.letterSpacing),
    color: style.color || 'rgb(0, 0, 0)',
    underlineThickness:
      decorationThickness > 0 ? decorationThickness : fontSize * 0.06,
  }
}

function segmentGraphemes(text: string): string[] {
  if (typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter('zh-CN', {
      granularity: 'grapheme',
    })
    return Array.from(segmenter.segment(text), (part) => part.segment)
  }
  return Array.from(text)
}

/** CSS Text 在 normal 空白处理下会折叠的 ASCII 空白。
 * NBSP、NNBSP 等 Unicode 空格不属于这个集合：它们必须保留
 * 自身 advance，也不能在两侧断行。 */
function isCollapsibleAsciiWhitespace(grapheme: string): boolean {
  return Array.from(grapheme).every(
    (character) =>
      character === ' ' ||
      ((character.codePointAt(0) ?? 0) >= 0x09 &&
        (character.codePointAt(0) ?? 0) <= 0x0d),
  )
}

function cloneWrapperTemplate(element: HTMLElement): HTMLElement {
  const clone = element.cloneNode(false) as HTMLElement
  clone.removeAttribute('id')
  for (const name of Array.from(clone.getAttributeNames())) {
    if (name.startsWith('data-layout-')) clone.removeAttribute(name)
  }
  return clone
}

function inlineWrappers(
  element: HTMLElement,
  block: HTMLElement,
): HTMLElement[] {
  const wrappers: HTMLElement[] = []
  let current: HTMLElement | null = element
  while (current && current !== block) {
    wrappers.unshift(cloneWrapperTemplate(current))
    current = current.parentElement
  }
  return wrappers
}

function nowrapOwner(
  element: HTMLElement,
  block: HTMLElement,
): HTMLElement | null {
  let current: HTMLElement | null = element
  while (current && current !== block) {
    if (
      current.matches('.nowrap-phrase, [data-no-wrap-phrase]')
    ) {
      return current
    }
    current = current.parentElement
  }
  return null
}

function highlightColor(
  element: HTMLElement,
  block: HTMLElement,
): string | null {
  let current: HTMLElement | null = element
  while (current && current !== block) {
    if (current.hasAttribute('data-text-highlight')) {
      const color = window.getComputedStyle(current).backgroundColor
      return TRANSPARENT_COLORS.has(color) ? null : color
    }
    current = current.parentElement
  }
  return null
}

function isUnderlined(
  element: HTMLElement,
  block: HTMLElement,
): boolean {
  let current: HTMLElement | null = element
  while (current && current !== block) {
    if (
      current.tagName === 'U' ||
      window.getComputedStyle(current).textDecorationLine.includes('underline')
    ) {
      return true
    }
    current = current.parentElement
  }
  return false
}

function isRunKind(kind: LayoutAtomKind): boolean {
  return kind === 'digit' || kind === 'latin'
}

const SOFT_RUN_CONNECTORS = new Set(['.', '/', '-', '_', ':'])
const SOFT_RUN_SUFFIXES = new Set(['%'])

function isSoftRunCore(meta: LayoutAtomMeta | undefined): boolean {
  return Boolean(
    meta &&
      !meta.input.hardNoBreak &&
      meta.input.text !== '' &&
      isRunKind(meta.input.kind),
  )
}

function assignSoftRunGroups(atoms: LayoutAtomMeta[], blockIndex: number) {
  let groupIndex = 0
  let index = 0
  while (index < atoms.length) {
    if (!isSoftRunCore(atoms[index])) {
      index += 1
      continue
    }

    const members: LayoutAtomMeta[] = []
    let cursor = index
    while (cursor < atoms.length && isSoftRunCore(atoms[cursor])) {
      const core = atoms[cursor]
      members.push(core)
      cursor += 1
      if (core.input.forcedBreakAfter) break
      if (isSoftRunCore(atoms[cursor])) continue

      const punctuation = atoms[cursor]
      if (
        punctuation &&
        !punctuation.input.hardNoBreak &&
        !punctuation.input.forcedBreakAfter &&
        SOFT_RUN_CONNECTORS.has(punctuation.input.text) &&
        isSoftRunCore(atoms[cursor + 1])
      ) {
        members.push(punctuation)
        cursor += 1
        continue
      }
      if (
        punctuation &&
        !punctuation.input.hardNoBreak &&
        SOFT_RUN_SUFFIXES.has(punctuation.input.text)
      ) {
        members.push(punctuation)
        cursor += 1
      }
      break
    }

    groupIndex += 1
    const group = `run-${blockIndex}-${groupIndex}`
    for (const member of members) member.input.breakGroup = group
    index = Math.max(cursor, index + 1)
  }
}

function extractAtoms(
  block: HTMLElement,
  blockIndex: number,
): LayoutAtomMeta[] {
  const atoms: LayoutAtomMeta[] = []
  const nowrapGroups = new WeakMap<HTMLElement, string>()
  let nextNowrapGroup = 0
  let atomIndex = 0
  let previousWasCollapsedSpace = true

  const appendBreak = () => {
    const previous = atoms.at(-1)
    if (previous && !previous.input.forcedBreakAfter) {
      previous.input.forcedBreakAfter = true
    } else {
      const style = runStyleFor(block)
      atoms.push({
        input: {
          id: `b${blockIndex}-a${atomIndex++}`,
          text: '',
          kind: 'other',
          advance: 0,
          em: style.fontSize,
          forcedBreakAfter: true,
        },
        wrappers: [],
        style,
        underline: false,
        highlightColor: null,
        actualAscent: 0,
        actualDescent: 0,
      })
    }
    previousWasCollapsedSpace = true
  }

  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const parent = node.parentElement
      if (!parent) return
      const style = runStyleFor(parent)
      const wrappers = inlineWrappers(parent, block)
      const owner = nowrapOwner(parent, block)
      let hardGroup: string | undefined
      if (owner) {
        hardGroup = nowrapGroups.get(owner)
        if (!hardGroup) {
          nextNowrapGroup += 1
          hardGroup = `nowrap-${blockIndex}-${nextNowrapGroup}`
          nowrapGroups.set(owner, hardGroup)
        }
      }
      for (const sourceGrapheme of segmentGraphemes(node.textContent ?? '')) {
        const collapsibleWhitespace =
          isCollapsibleAsciiWhitespace(sourceGrapheme)
        const collapsed =
          collapsibleWhitespace && previousWasCollapsedSpace
        // 布局测量把 CSS 可折叠空白当作一个普通空格，
        // 但 DOM 仍存放 sourceGrapheme；后续重复空白仅以 0
        // advance 表达折叠，不删除或替换 Unicode 文本。
        const measuredGrapheme = collapsibleWhitespace
          ? ' '
          : sourceGrapheme
        const kind = classifyLayoutGrapheme(sourceGrapheme)
        const metrics = measureText(measuredGrapheme, style)
        const advance = collapsed
          ? 0
          : Math.max(0, finite(metrics.width))
        const measuredInkLeft = collapsed
          ? 0
          : measuredNumber(metrics.actualBoundingBoxLeft)
        const measuredInkRight = collapsed
          ? 0
          : measuredNumber(metrics.actualBoundingBoxRight)
        atoms.push({
          input: {
            id: `b${blockIndex}-a${atomIndex++}`,
            text: sourceGrapheme,
            kind,
            advance,
            inkLeft: measuredInkLeft ?? undefined,
            inkRight: measuredInkRight ?? undefined,
            opticalMetricsMissing:
              !collapsed &&
              (measuredInkLeft === null || measuredInkRight === null),
            em: style.fontSize,
            letterSpacing: style.letterSpacing,
            breakGroup: hardGroup,
            hardNoBreak: Boolean(hardGroup),
          },
          wrappers,
          style,
          underline: isUnderlined(parent, block),
          highlightColor: highlightColor(parent, block),
          actualAscent: Math.max(
            0,
            finite(metrics.actualBoundingBoxAscent, style.fontSize * 0.82),
          ),
          actualDescent: Math.max(
            0,
            finite(metrics.actualBoundingBoxDescent, style.fontSize * 0.18),
          ),
        })
        previousWasCollapsedSpace = collapsibleWhitespace
      }
      return
    }
    if (!(node instanceof HTMLElement)) return
    if (node.tagName === 'BR') {
      appendBreak()
      return
    }
    if (
      node.matches(
        '[data-preview-only], [data-optical-list-marker], script, style',
      )
    ) {
      return
    }
    for (const child of Array.from(node.childNodes)) visit(child)
  }

  for (const child of Array.from(block.childNodes)) visit(child)
  assignSoftRunGroups(atoms, blockIndex)
  return atoms
}

function blockTargets(content: HTMLElement): HTMLElement[] {
  const primary = Array.from(
    content.querySelectorAll<HTMLElement>(BLOCK_SELECTOR),
  )
  const fallback: HTMLElement[] = []
  for (const element of Array.from(
    content.querySelectorAll<HTMLElement>('blockquote, li'),
  )) {
    const hasNestedBlock = Array.from(element.children).some((child) =>
      child.matches(
        'p, h1, h2, h3, ul, ol, blockquote, pre, [data-optical-list-marker]',
      ),
    )
    if (!hasNestedBlock) {
      if (
        Array.from(element.childNodes).some(
          (node) =>
            node.nodeType === Node.TEXT_NODE ||
            (node instanceof HTMLElement &&
              !node.matches(
                '[data-optical-list-marker], ul, ol, blockquote, pre, img',
              )),
        )
      ) {
        fallback.push(element)
      }
      continue
    }

    // 旧 HTML 可能是 <li>外层文字<ul>…</ul></li>，没有 Tiptap
    // 标准的 <p>。只把连续的直属 inline 节点包成独立排版块，
    // 绝不 replaceChildren 父 li/blockquote，因而嵌套列表结构仍在。
    let segment: Node[] = []
    const flush = () => {
      if (
        segment.length === 0 ||
        !segment.some((node) => (node.textContent ?? '').trim().length > 0)
      ) {
        segment = []
        return
      }
      const wrapper = element.ownerDocument.createElement('span')
      wrapper.dataset.layoutFallbackBlock = ''
      wrapper.style.display = 'block'
      element.insertBefore(wrapper, segment[0])
      for (const node of segment) wrapper.appendChild(node)
      fallback.push(wrapper)
      segment = []
    }
    for (const node of Array.from(element.childNodes)) {
      if (
        node instanceof HTMLElement &&
        node.matches(
          '[data-optical-list-marker], p, h1, h2, h3, ul, ol, blockquote, pre, img, hr',
        )
      ) {
        flush()
        continue
      }
      segment.push(node)
    }
    flush()
  }
  return [...primary, ...fallback].sort((left, right) => {
    const position = left.compareDocumentPosition(right)
    return position & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
  })
}

function contentBoxWidth(block: HTMLElement): number {
  const style = window.getComputedStyle(block)
  const borderBoxWidth = block.clientWidth || cssPixels(style.width)
  return Math.max(
    0,
    borderBoxWidth -
      cssPixels(style.paddingLeft) -
      cssPixels(style.paddingRight),
  )
}

function contentBoxOrigin(block: HTMLElement): { x: number; y: number } {
  const style = window.getComputedStyle(block)
  return {
    x: cssPixels(style.paddingLeft),
    y: cssPixels(style.paddingTop),
  }
}

const stableHash = fnv1a32Hex

function createSemanticGlyph(
  document: Document,
  meta: LayoutAtomMeta,
): HTMLElement {
  const glyph = document.createElement('span')
  glyph.className = 'dtl-glyph'
  glyph.textContent = meta.input.text
  let child: HTMLElement = glyph
  for (const template of [...meta.wrappers].reverse()) {
    const wrapper = template.cloneNode(false) as HTMLElement
    wrapper.appendChild(child)
    child = wrapper
  }
  return child
}

function fontRequest(meta: LayoutAtomMeta): DeterministicFontRequest {
  return {
    family: meta.style.family,
    weight: meta.style.weight,
    style: meta.style.fontStyle,
    sample: meta.input.text || '国Ag',
  }
}

function requestKey(request: DeterministicFontRequest): string {
  return [
    request.family,
    request.weight,
    request.style,
  ].join('\u0000')
}

function mergeFontRequest(
  requests: Map<string, DeterministicFontRequest>,
  request: DeterministicFontRequest,
) {
  const key = requestKey(request)
  const current = requests.get(key)
  if (!current) {
    requests.set(key, request)
    return
  }
  const seen = new Set(segmentGraphemes(current.sample))
  let sample = current.sample
  for (const grapheme of segmentGraphemes(request.sample)) {
    if (seen.has(grapheme)) continue
    seen.add(grapheme)
    sample += grapheme
  }
  current.sample = sample
}

function fallbackLineBaseline(
  lineHeight: number,
  blockStyle: LayoutRunStyle,
): number {
  const metrics = measureText('国Ag', blockStyle)
  const ascent = Math.max(
    0,
    finite(metrics.fontBoundingBoxAscent, blockStyle.fontSize * 0.88),
  )
  const descent = Math.max(
    0,
    finite(metrics.fontBoundingBoxDescent, blockStyle.fontSize * 0.22),
  )
  return Math.max(0, (lineHeight - ascent - descent) / 2 + ascent)
}

function lineBaseline(
  ownerDocument: Document,
  lineHeight: number,
  blockStyle: LayoutRunStyle,
): number {
  const body = ownerDocument.body
  if (!body) return fallbackLineBaseline(lineHeight, blockStyle)
  const line = ownerDocument.createElement('span')
  const probe = ownerDocument.createElement('span')
  line.setAttribute('aria-hidden', 'true')
  line.style.cssText = [
    'position:fixed',
    'left:-99999px',
    'top:0',
    'display:block',
    'visibility:hidden',
    'white-space:nowrap',
    'padding:0',
    'margin:0',
    'border:0',
    `font:${blockStyle.font}`,
    `height:${lineHeight}px`,
    `line-height:${lineHeight}px`,
    'letter-spacing:0',
  ].join(';')
  probe.style.cssText = [
    'display:inline-block',
    'width:0',
    'height:0',
    'padding:0',
    'margin:0',
    'border:0',
    'vertical-align:baseline',
  ].join(';')
  line.append(ownerDocument.createTextNode('国Ag'), probe)
  body.appendChild(line)
  try {
    const lineRect = line.getBoundingClientRect()
    const probeRect = probe.getBoundingClientRect()
    const measured = probeRect.top - lineRect.top
    return Number.isFinite(measured) && measured > 0 && measured < lineHeight
      ? measured
      : fallbackLineBaseline(lineHeight, blockStyle)
  } finally {
    line.remove()
  }
}

interface MaterializedBaselineMeasurement {
  value: number
  measured: boolean
}

function materializedAtomBaselines(
  atoms: readonly HTMLElement[],
  lineHeight: number,
  fallback: number,
): Map<HTMLElement, MaterializedBaselineMeasurement> {
  const measurements = new Map<
    HTMLElement,
    MaterializedBaselineMeasurement
  >()
  // P7：baseline 在 atom 盒内的偏移只由字体（style/weight/size/family/
  // line-height）、vertical-align 与盒高决定，与 atom 位置无关——同类
  // atom 只在代表元素上放一个 probe，其余按类查表。一个块通常只有
  // 1–3 个类，probe 数从逐字素降为逐类。
  const classKeyByAtom = new Map<HTMLElement, string>()
  const representatives = new Map<
    string,
    { atom: HTMLElement; glyph: HTMLElement; probe?: HTMLElement }
  >()
  for (const atom of atoms) {
    const glyph = atom.querySelector<HTMLElement>('.dtl-glyph')
    if (!glyph) {
      measurements.set(atom, { value: fallback, measured: false })
      continue
    }
    const style = atom.ownerDocument.defaultView?.getComputedStyle(glyph)
    const key = [
      style?.fontStyle ?? '',
      style?.fontWeight ?? '',
      style?.fontSize ?? '',
      style?.lineHeight ?? '',
      style?.fontFamily ?? '',
      style?.verticalAlign ?? '',
      atom.style.height,
    ].join('|')
    classKeyByAtom.set(atom, key)
    if (!representatives.has(key)) {
      representatives.set(key, { atom, glyph })
    }
  }
  const valueByClass = new Map<string, MaterializedBaselineMeasurement>()
  try {
    for (const representative of representatives.values()) {
      const probe = representative.atom.ownerDocument.createElement('span')
      probe.setAttribute('aria-hidden', 'true')
      probe.setAttribute('data-dtl-baseline-probe', '')
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
      representative.glyph.appendChild(probe)
      representative.probe = probe
    }
    // 批量写入 probe 后再统一读取 rect，避免 19 页逐字素反复布局。
    for (const [key, { atom, probe }] of representatives) {
      if (!probe) continue
      const atomRect = atom.getBoundingClientRect()
      const probeRect = probe.getBoundingClientRect()
      // style.height 保留 75.6px 之类的小数行高；offsetHeight 会先
      // 取整，再用于 transform 比例会制造约 0.3px 的伪偏差。
      const layoutHeight =
        cssPixels(atom.style.height) || atom.offsetHeight || lineHeight
      const scaleY =
        atomRect.height > 0 && layoutHeight > 0
          ? atomRect.height / layoutHeight
          : 1
      const value = (probeRect.top - atomRect.top) / scaleY
      const measured =
        Number.isFinite(value) && value > 0 && value < lineHeight
      valueByClass.set(key, {
        value: measured ? value : fallback,
        measured,
      })
    }
  } finally {
    for (const { probe } of representatives.values()) probe?.remove()
  }
  for (const atom of atoms) {
    if (measurements.has(atom)) continue
    const key = classKeyByAtom.get(atom)
    const classValue = key === undefined ? undefined : valueByClass.get(key)
    measurements.set(
      atom,
      classValue ?? { value: fallback, measured: false },
    )
  }
  return measurements
}

/**
 * html2canvas-pro 2.0.x 会把 Range.top + fontSize 当作 alphabetic
 * baseline。行级快照先在物化后的真实 atom 内测得浏览器 baseline，
 * 导出副本再据此反推每个 atom 的 top；只移动离屏副本，不改变预览、
 * 断行、横向坐标或 source snapshot ID。
 */
export function calibrateDeterministicGlyphBaselinesForHtml2Canvas(
  root: HTMLElement,
): number {
  interface BaselineAdjustment {
    atom: HTMLElement
    atomTop: number
    delta: number
    signature: string
  }
  interface BaselineCandidate {
    atom: HTMLElement
    glyph: HTMLElement
    textNode: Node
    baseline: number
    lineTop: number
    atomTop: number
  }
  const targetAtoms = Array.from(
    root.querySelectorAll<HTMLElement>('.dtl-atom'),
  ).filter((atom) => (atom.textContent ?? '') !== '')
  const adjustments: BaselineAdjustment[] = []
  const adjustmentByAtom = new Map<HTMLElement, BaselineAdjustment>()
  const signature: string[] = []
  let failed = false

  // P5 写读分相：先对全部 atom 做结构校验与 top 复位（纯写 + 不触发
  // 布局的 dataset/树读取），再统一进入几何读取。此前逐 atom 的
  // 写 top → 读 rect 交替会让每个字素强制一次 reflow，2160×3600 导出
  // 下是逐页最大的校准开销；分相后整批只有首次读取触发一次布局。
  const candidates: BaselineCandidate[] = []
  for (const atom of targetAtoms) {
    const glyph = atom.querySelector<HTMLElement>('.dtl-glyph')
    if (!glyph) {
      atom.dataset.layoutExportBaselineError = 'missing glyph element'
      failed = true
      continue
    }
    const baseline = Number(atom.dataset.layoutBaseline)
    const lineTop = Number(
      atom.dataset.layoutLineTop ?? atom.dataset.layoutTop,
    )
    const atomTop = Number(atom.dataset.layoutTop)
    if (
      !Number.isFinite(baseline) ||
      !Number.isFinite(lineTop) ||
      !Number.isFinite(atomTop)
    ) {
      atom.dataset.layoutExportBaselineError = 'invalid snapshot baseline'
      failed = true
      continue
    }
    const showText =
      atom.ownerDocument.defaultView?.NodeFilter.SHOW_TEXT ?? 4
    const walker = atom.ownerDocument.createTreeWalker(atom, showText)
    const textNode = walker.nextNode()
    if (!textNode || !(textNode.textContent ?? '')) {
      atom.dataset.layoutExportBaselineError = 'missing text node'
      failed = true
      continue
    }

    // 允许测试/重试幂等：每次都先回到 snapshot 的预览 atom top。
    atom.style.top = `${atomTop}px`
    delete atom.dataset.layoutExportBaselineError
    atom.dataset.layoutExportBaselineShift = ''
    candidates.push({ atom, glyph, textNode, baseline, lineTop, atomTop })
  }

  for (const { atom, glyph, textNode, baseline, lineTop, atomTop } of candidates) {
    const style = atom.ownerDocument.defaultView?.getComputedStyle(glyph)
    const fontSize = Number.parseFloat(style?.fontSize ?? '')
    if (!finite(fontSize) || fontSize <= 0) {
      atom.dataset.layoutExportBaselineError = 'invalid font size'
      failed = true
      continue
    }
    const atomRect = atom.getBoundingClientRect()
    const layoutHeight =
      cssPixels(atom.style.height) || atom.offsetHeight
    const scaleY =
      atomRect.height > 0 && layoutHeight > 0
        ? atomRect.height / layoutHeight
        : 1
    const range = atom.ownerDocument.createRange()
    try {
      range.selectNodeContents(textNode)
      const rect = range.getBoundingClientRect()
      if (!Number.isFinite(rect.top) || rect.height <= 0) {
        atom.dataset.layoutExportBaselineError = 'invalid range bounds'
        failed = true
        continue
      }
      const rendererBaseline =
        atomTop + (rect.top - atomRect.top) / scaleY + fontSize
      const delta = lineTop + baseline - rendererBaseline
      const limit = fontSize * 0.45
      if (Math.abs(delta) > limit) {
        atom.dataset.layoutExportBaselineError =
          `shift ${delta.toFixed(3)}px exceeds ${limit.toFixed(3)}px`
        atom.dataset.layoutExportBaselineShift = ''
        failed = true
        continue
      }
      adjustments.push({
        atom,
        atomTop,
        delta,
        signature: [
          atom.dataset.layoutAtom ?? '',
          lineTop.toFixed(3),
          atomTop.toFixed(3),
          baseline.toFixed(3),
          Number(atom.dataset.layoutNativeBaseline).toFixed(3),
          fontSize.toFixed(3),
          delta.toFixed(3),
        ].join(':'),
      })
    } finally {
      range.detach()
    }
  }

  // 失败时保持整个副本原子不变，不能出现前半页已移动、后半页失败。
  if (failed || adjustments.length !== targetAtoms.length) {
    for (const atom of targetAtoms) {
      const top = Number(atom.dataset.layoutTop)
      if (Number.isFinite(top)) atom.style.top = `${top}px`
      atom.dataset.layoutExportBaselineShift = ''
    }
    delete root.dataset.layoutExportBaselineHash
    return 0
  }

  for (const adjustment of adjustments) {
    adjustmentByAtom.set(adjustment.atom, adjustment)
    adjustment.atom.style.top = `${adjustment.atomTop + adjustment.delta}px`
    adjustment.atom.dataset.layoutExportBaselineShift =
      adjustment.delta.toFixed(3)
    signature.push(adjustment.signature)
  }

  // 列表 marker 仍由浏览器作为普通文本渲染，而列表正文已变成逐 atom
  // 的确定性行。html2canvas 的 Range baseline 会让正文 atom 产生 renderer
  // 适配位移；marker 若留在预览位置，就会与首行文字出现同幅反向错位。
  // 这里让 marker 继承其直接正文首 atom 的同一垂直位移，只修离屏副本，
  // 不重算预览的光学净空，也不改变 sealed source snapshot。
  for (const marker of Array.from(
    root.querySelectorAll<HTMLElement>('[data-optical-list-marker]'),
  )) {
    const item = marker.parentElement
    const reference = item
      ? Array.from(item.children).find(
          (child) =>
            child !== marker &&
            child.tagName !== 'OL' &&
            child.tagName !== 'UL',
        )
      : null
    const referenceAtom = reference?.querySelector<HTMLElement>(
      '.dtl-atom:not([data-layout-kind="space"])',
    )
    const adjustment = referenceAtom
      ? adjustmentByAtom.get(referenceAtom)
      : undefined
    const delta = adjustment?.delta ?? 0
    marker.style.setProperty(
      '--optical-list-marker-export-shift-y',
      `${delta.toFixed(3)}px`,
    )
    marker.dataset.layoutExportBaselineShift = delta.toFixed(3)
    signature.push(
      `marker:${marker.textContent ?? ''}:${delta.toFixed(3)}`,
    )
  }
  root.dataset.layoutExportBaselineHash = stableHash(signature.join('|'))
  return adjustments.length
}

/**
 * 光学校准会写入 H2 竖条变量和显式列表 marker。必须在这些最终
 * 变更完成后封存页面快照，ready 才代表可直接克隆的完整渲染树。
 */
export function sealDeterministicTypographySnapshot(
  page: HTMLElement,
): string {
  const baseSnapshot =
    page.dataset.layoutBaseSnapshot ?? page.dataset.layoutSnapshot ?? ''
  const h2 = Array.from(
    page.querySelectorAll<HTMLElement>('.content h2'),
    (heading) => ({
      center: heading.style.getPropertyValue('--h2-optical-center-y'),
      height: heading.style.getPropertyValue('--h2-optical-bar-height'),
      state: heading.dataset.opticalH2 ?? '',
    }),
  )
  const markers = Array.from(
    page.querySelectorAll<HTMLElement>('[data-optical-list-marker]'),
    (marker) => ({
      text: marker.textContent ?? '',
      style: marker.getAttribute('style') ?? '',
    }),
  )
  const snapshotId = stableHash(
    JSON.stringify({ baseSnapshot, h2, markers }),
  )
  page.dataset.layoutBaseSnapshot = baseSnapshot
  page.dataset.layoutSnapshot = snapshotId
  page.dataset.layoutSnapshotPhase = 'sealed'
  return snapshotId
}

function decorationRuns<T>(
  line: DeterministicLayoutLine,
  metaById: ReadonlyMap<string, LayoutAtomMeta>,
  valueFor: (meta: LayoutAtomMeta) => T | null,
): Array<{ start: number; end: number; value: T; metas: LayoutAtomMeta[] }> {
  const runs: Array<{
    start: number
    end: number
    value: T
    metas: LayoutAtomMeta[]
  }> = []
  let active: (typeof runs)[number] | null = null
  const lastVisibleIndex = line.atoms.findLastIndex(
    (atom) => atom.text !== '' && atom.boxWidth > 0,
  )
  for (const [atomIndex, atom] of line.atoms.entries()) {
    // CSS 折叠的行尾 ASCII 空格仍保留 Unicode 节点，但不应延长或
    // 截断前一个语义装饰；行末悬挂判断同样以最后可见字素为准。
    if (atom.boxWidth <= 0) continue
    const meta = metaById.get(atom.id)
    if (!meta || atom.text === '') continue
    const value = valueFor(meta)
    if (value === null) {
      // 相同颜色/样式的两个语义片段，中间只要出现普通文字就必须
      // 断开；否则 <u>甲</u>乙<u>丙</u> 会被错误画成连续下划线。
      active = null
      continue
    }
    const isHangingLineEndClosing =
      atomIndex === lastVisibleIndex &&
      atom.kind === 'closing-punctuation' &&
      (line.justified ||
        // 末行闭标点透明净空悬挂到版心外时，装饰同样只画到可见
        // 墨迹；未悬挂的末行保持原有整 box 行为不变。
        atom.x + atom.boxWidth > line.targetWidth)
    const atomDecorationEnd = isHangingLineEndClosing
      ? Math.min(
          line.targetWidth,
          atom.x + atom.glyphOffset + (atom.inkRight ?? atom.boxWidth),
        )
      : atom.x + atom.boxWidth
    if (active && Object.is(active.value, value)) {
      active.end = atomDecorationEnd
      active.metas.push(meta)
    } else {
      active = {
        start: atom.x,
        end: atomDecorationEnd,
        value,
        metas: [meta],
      }
      runs.push(active)
    }
  }
  return runs
}

function appendDecorations(
  lineElement: HTMLElement,
  line: DeterministicLayoutLine,
  metaById: ReadonlyMap<string, LayoutAtomMeta>,
  baseline: number,
  lineHeight: number,
) {
  const highlights = decorationRuns(
    line,
    metaById,
    (meta) => meta.highlightColor,
  )
  for (const run of highlights) {
    const fontSize = Math.max(...run.metas.map((meta) => meta.style.fontSize))
    const decoration = lineElement.ownerDocument.createElement('span')
    decoration.className = 'dtl-decoration dtl-decoration--highlight'
    decoration.setAttribute('aria-hidden', 'true')
    decoration.style.left = `${run.start}px`
    decoration.style.width = `${Math.max(0, run.end - run.start)}px`
    decoration.style.top = `${Math.max(0, baseline - fontSize * 0.84)}px`
    decoration.style.height = `${Math.min(lineHeight, fontSize * 1.04)}px`
    decoration.style.backgroundColor = run.value
    lineElement.appendChild(decoration)
  }

  const underlines = decorationRuns(
    line,
    metaById,
    (meta) => (meta.underline ? meta.style.color : null),
  )
  for (const run of underlines) {
    const fontSize = Math.max(...run.metas.map((meta) => meta.style.fontSize))
    const thickness = Math.max(
      1,
      ...run.metas.map((meta) => meta.style.underlineThickness),
    )
    const maxDescent = Math.max(
      0,
      ...run.metas.map((meta) => meta.actualDescent),
    )
    const offset = Math.max(
      thickness,
      Math.min(fontSize * 0.12, maxDescent + fontSize * 0.025),
    )
    const y = Math.min(lineHeight - thickness, baseline + offset)
    const decoration = lineElement.ownerDocument.createElement('span')
    decoration.className = 'dtl-decoration dtl-decoration--underline'
    decoration.setAttribute('aria-hidden', 'true')
    decoration.dataset.layoutBaseline = baseline.toFixed(3)
    decoration.dataset.layoutUnderlineY = y.toFixed(3)
    decoration.dataset.layoutUnderlineDescent = maxDescent.toFixed(3)
    decoration.dataset.layoutUnderlineFontSize = fontSize.toFixed(3)
    decoration.dataset.layoutUnderlineThickness = thickness.toFixed(3)
    decoration.style.left = `${run.start}px`
    decoration.style.width = `${Math.max(0, run.end - run.start)}px`
    decoration.style.top = `${y}px`
    decoration.style.height = `${thickness}px`
    decoration.style.backgroundColor = run.value
    lineElement.appendChild(decoration)
  }
}

function materializeBlock(
  block: HTMLElement,
  blockIndex: number,
): BlockLayoutResult {
  const originalText = block.textContent ?? ''
  const atoms = extractAtoms(block, blockIndex)
  const inkMetricIssues = atoms.flatMap((meta) =>
    meta.input.text !== '' &&
      meta.input.kind !== 'space' &&
      (meta.input.inkLeft === undefined || meta.input.inkRight === undefined)
      ? [
          {
            code: 'ink-metrics-unmeasurable' as const,
            blockIndex,
            blockText: originalText.slice(0, 48),
            message: `无法测量字形“${meta.input.text}”的可见墨迹边界`,
          },
        ]
      : [],
  )
  const metaById = new Map(atoms.map((meta) => [meta.input.id, meta]))
  const width = contentBoxWidth(block)
  const origin = contentBoxOrigin(block)
  if (width <= 0) {
    return {
      snapshotId: 'invalid-width',
      lineCount: 0,
      fontRequests: [],
      issues: [
        {
          code: 'invalid-width',
          blockIndex,
          blockText: originalText.slice(0, 48),
          message: '无法测量文本块的有效行宽',
        },
      ],
    }
  }
  if (atoms.length === 0) {
    return {
      snapshotId: stableHash(`empty:${blockIndex}:${width}`),
      lineCount: 0,
      fontRequests: [],
      issues: [],
    }
  }

  const computed = window.getComputedStyle(block)
  const blockStyle = runStyleFor(block)
  const lineHeight = Math.max(
    blockStyle.fontSize,
    cssPixels(computed.lineHeight, blockStyle.fontSize * 1.2),
  )
  const justify = computed.textAlign === 'justify'
  const lines = solveDeterministicTextLayout(
    atoms.map((meta) => meta.input),
    width,
    { justifyWrappedLines: justify },
  )
  const provisionalBaseline = lineBaseline(
    block.ownerDocument,
    lineHeight,
    blockStyle,
  )
  const fragment = block.ownerDocument.createDocumentFragment()
  const requests = new Map<string, DeterministicFontRequest>()
  const lineElements: HTMLElement[] = []

  for (const [lineIndex, line] of lines.entries()) {
    const lineElement = block.ownerDocument.createElement('span')
    lineElement.className = 'dtl-line'
    // 行盒只承载几何快照与显式装饰，不承载可访问文本。真实
    // Unicode 字素按原 DOM 顺序直接放在 block 下，软换行不会
    // 注入额外文本节点，因此复制、搜索与辅助技术仍看到原文。
    lineElement.setAttribute('aria-hidden', 'true')
    lineElement.dataset.layoutLine = String(lineIndex)
    lineElement.dataset.layoutEnd = line.end
    lineElement.dataset.layoutJustified = String(line.justified)
    lineElement.dataset.layoutRight = line.actualWidth.toFixed(3)
    lineElement.dataset.layoutTarget = line.targetWidth.toFixed(3)
    lineElement.dataset.layoutResidual = line.residual.toFixed(3)
    lineElement.dataset.layoutBaseline = provisionalBaseline.toFixed(3)
    lineElement.style.left = `${origin.x}px`
    lineElement.style.top = `${origin.y + lineIndex * lineHeight}px`
    lineElement.style.width = `${width}px`
    lineElement.style.height = `${lineHeight}px`
    lineElement.style.lineHeight = `${lineHeight}px`

    lineElements.push(lineElement)
    fragment.appendChild(lineElement)

    for (const atom of line.atoms) {
      const meta = metaById.get(atom.id)
      if (!meta) continue
      const atomElement = block.ownerDocument.createElement('span')
      atomElement.className = 'dtl-atom'
      atomElement.dataset.layoutAtom = atom.id
      atomElement.dataset.layoutLine = String(lineIndex)
      atomElement.dataset.layoutKind = atom.kind
      atomElement.dataset.layoutX = atom.x.toFixed(3)
      atomElement.dataset.layoutAdvance = atom.advance.toFixed(3)
      atomElement.dataset.layoutBox = atom.boxWidth.toFixed(3)
      atomElement.dataset.layoutGap = atom.gapAfter.toFixed(3)
      atomElement.dataset.layoutGlyphOffset = atom.glyphOffset.toFixed(3)
      if (atom.inkLeft !== undefined) {
        atomElement.dataset.layoutInkLeft = atom.inkLeft.toFixed(3)
        atomElement.dataset.layoutInkStart = (-atom.inkLeft).toFixed(3)
      }
      if (atom.inkRight !== undefined) {
        atomElement.dataset.layoutInkRight = atom.inkRight.toFixed(3)
        atomElement.dataset.layoutInkEnd = atom.inkRight.toFixed(3)
      }
      if (atom.breakGroup) {
        atomElement.dataset.layoutBreakGroup = atom.breakGroup
      }
      atomElement.dataset.layoutBaseline = provisionalBaseline.toFixed(3)
      atomElement.dataset.layoutLineTop = (
        origin.y + lineIndex * lineHeight
      ).toFixed(3)
      atomElement.dataset.layoutTop = (
        origin.y + lineIndex * lineHeight
      ).toFixed(3)
      atomElement.style.left = `${origin.x + atom.x}px`
      atomElement.style.top = `${origin.y + lineIndex * lineHeight}px`
      atomElement.style.width = `${atom.boxWidth}px`
      atomElement.style.height = `${lineHeight}px`
      atomElement.style.lineHeight = `${lineHeight}px`

      const request = fontRequest(meta)
      mergeFontRequest(requests, request)
      const semanticGlyph = createSemanticGlyph(
        block.ownerDocument,
        meta,
      )
      if (atom.glyphOffset !== 0) {
        semanticGlyph.style.position = 'relative'
        semanticGlyph.style.left = `${atom.glyphOffset}px`
      }
      atomElement.appendChild(semanticGlyph)
      fragment.appendChild(atomElement)
    }
    if (line.end === 'explicit') {
      const explicitBreak = block.ownerDocument.createElement('br')
      explicitBreak.className = 'dtl-explicit-break'
      explicitBreak.dataset.layoutExplicitBreak = ''
      fragment.appendChild(explicitBreak)
    }
  }

  block.replaceChildren(fragment)
  block.classList.add('deterministic-text-layout')
  block.style.height = `${lines.length * lineHeight}px`
  const atomElements = Array.from(
    block.querySelectorAll<HTMLElement>(':scope > .dtl-atom'),
  )
  const baseline = provisionalBaseline
  const nativeBaselines = materializedAtomBaselines(
    atomElements,
    lineHeight,
    baseline,
  )
  const blockRect = block.getBoundingClientRect()
  const hasLayoutGeometry = blockRect.width > 0 && blockRect.height > 0
  const baselineIssues: DeterministicTypographyIssue[] = []
  const vertical: Array<{
    id: string
    top: number
    nativeBaseline: number
  }> = []
  for (const atomElement of atomElements) {
    const lineTop = Number(atomElement.dataset.layoutLineTop)
    const measurement = nativeBaselines.get(atomElement) ?? {
      value: baseline,
      measured: false,
    }
    const nativeBaseline = measurement.value
    const meta = metaById.get(atomElement.dataset.layoutAtom ?? '')
    const limit = (meta?.style.fontSize ?? blockStyle.fontSize) * 0.45
    const correction = baseline - nativeBaseline
    if (!measurement.measured && hasLayoutGeometry) {
      baselineIssues.push({
        code: 'baseline-unmeasurable',
        blockIndex,
        blockText: originalText.slice(0, 48),
        message: `无法测量字形“${atomElement.textContent ?? ''}”的浏览器基线`,
      })
    }
    if (!Number.isFinite(correction) || Math.abs(correction) > limit) {
      baselineIssues.push({
        code: 'baseline-out-of-range',
        blockIndex,
        blockText: originalText.slice(0, 48),
        message: `字形“${atomElement.textContent ?? ''}”的基线归一化超出 ${limit.toFixed(3)}px 上限`,
      })
    }
    const top =
      Number.isFinite(correction) && Math.abs(correction) <= limit
        ? lineTop + correction
        : lineTop
    atomElement.style.top = `${top}px`
    atomElement.dataset.layoutTop = top.toFixed(3)
    atomElement.dataset.layoutBaseline = baseline.toFixed(3)
    atomElement.dataset.layoutNativeBaseline = nativeBaseline.toFixed(3)
    vertical.push({
      id: atomElement.dataset.layoutAtom ?? '',
      top: Number(top.toFixed(3)),
      nativeBaseline: Number(nativeBaseline.toFixed(3)),
    })
  }
  for (const [lineIndex, lineElement] of lineElements.entries()) {
    lineElement.dataset.layoutBaseline = baseline.toFixed(3)
    appendDecorations(
      lineElement,
      lines[lineIndex],
      metaById,
      baseline,
      lineHeight,
    )
  }
  const snapshotId = stableHash(
    JSON.stringify({
      horizontal: deterministicLayoutSnapshotHash(lines),
      width: Number(width.toFixed(3)),
      origin: {
        x: Number(origin.x.toFixed(3)),
        y: Number(origin.y.toFixed(3)),
      },
      lineHeight: Number(lineHeight.toFixed(3)),
      baseline: Number(baseline.toFixed(3)),
      vertical,
      runs: atoms.map((meta) => ({
        id: meta.input.id,
        font: meta.style.font,
        fontSize: Number(meta.style.fontSize.toFixed(3)),
        underline: meta.underline,
        underlineThickness: Number(
          meta.style.underlineThickness.toFixed(3),
        ),
        highlight: meta.highlightColor,
        descent: Number(meta.actualDescent.toFixed(3)),
      })),
    }),
  )
  block.dataset.layoutSnapshot = snapshotId
  block.dataset.layoutWidth = width.toFixed(3)
  block.dataset.layoutLineCount = String(lines.length)

  const issues: DeterministicTypographyIssue[] = [
    ...inkMetricIssues,
    ...baselineIssues,
    ...lines.flatMap((line, lineIndex) =>
      line.emergency
        ? [
            {
              code: 'unsatisfied-line' as const,
              blockIndex,
              blockText: originalText.slice(0, 48),
              message: `第 ${lineIndex + 1} 行在字距/标点上限内无法排入版心`,
            },
          ]
        : [],
    ),
  ]
  if ((block.textContent ?? '') !== originalText) {
    issues.push({
      code: 'text-mismatch',
      blockIndex,
      blockText: originalText.slice(0, 48),
      message: '物化排版后的 Unicode 文本与编辑源不一致',
    })
  }
  return {
    snapshotId,
    lineCount: lines.length,
    fontRequests: Array.from(requests.values()),
    issues,
  }
}

/**
 * 把编辑器 HTML 还原后一次性生成可克隆的行级快照。预览与导出
 * 不再分别触发浏览器 justify；导出只复制这棵已物化 DOM。
 */
export function materializeDeterministicTypography(
  page: HTMLElement,
  options: LayoutOptions,
): DeterministicTypographyResult {
  const content = page.querySelector<HTMLElement>('.content')
  if (!content) {
    const emptyResult = {
      snapshotId: 'missing-content',
      blockCount: 0,
      lineCount: 0,
      fontRequests: [],
      issues: [],
    }
    page.dataset.layoutSnapshot = emptyResult.snapshotId
    page.dataset.layoutBaseSnapshot = emptyResult.snapshotId
    page.dataset.layoutSnapshotPhase = 'error'
    page.dataset.layoutState = 'error'
    return emptyResult
  }

  // React 只在 html prop 变化时重写 innerHTML；字体就绪后的第二次
  // 排版必须先恢复编辑器语义源，不能再分词上次产生的 span。
  content.innerHTML = options.sourceHtml
  // marker 列宽会改变 ol 的 padding-left，从而改变列表内正文
  // 的可用行宽。必须在 blockTargets/contentBoxWidth 之前冻结。
  const listMarkerGeometry = freezeOpticalListMarkerGeometry(page)
  const blocks = blockTargets(content)
  const blockResults = blocks.map((block, index) =>
    materializeBlock(block, index),
  )
  const issues = blockResults.flatMap((result) => result.issues)
  const fontRequests = new Map<string, DeterministicFontRequest>()
  for (const request of blockResults.flatMap(
    (result) => result.fontRequests,
  )) {
    mergeFontRequest(fontRequests, request)
  }
  const pageTags = Array.from(
    page.querySelectorAll<HTMLElement>('.page-tag'),
    (label) => {
      const style = runStyleFor(label)
      const text = label.textContent?.trim() || '01 / 19'
      mergeFontRequest(fontRequests, {
        family: style.family,
        weight: style.weight,
        style: style.fontStyle,
        sample: text,
      })
      return {
        text,
        family: style.family,
        weight: style.weight,
        style: style.fontStyle,
      }
    },
  )
  for (const marker of Array.from(
    content.querySelectorAll<HTMLElement>('[data-optical-list-marker]'),
  )) {
    // 不能用列表项的第一个正文 run 猜 marker 字体。例如整项
    // 只有 <strong> 或是空项时，marker 仍按 li 自身的 400 绘制。
    const style = runStyleFor(marker)
    mergeFontRequest(fontRequests, {
      family: style.family,
      weight: style.weight,
      style: style.fontStyle,
      sample: '0123456789.-•',
    })
  }
  // 无序列表仍使用浏览器 marker，为其项目符补全字体分片。
  if (content.querySelector('ul')) {
    for (const request of Array.from(fontRequests.values())) {
      mergeFontRequest(fontRequests, { ...request, sample: '•' })
    }
  }
  const snapshotId = stableHash(
    JSON.stringify({
      blocks: blockResults.map((result) => result.snapshotId),
      listMarkerGeometry,
      pageTags,
      fontRequests: Array.from(fontRequests.values()),
    }),
  )
  page.dataset.layoutSnapshot = snapshotId
  page.dataset.layoutBaseSnapshot = snapshotId
  page.dataset.layoutSnapshotPhase = 'layout'
  // 只有含硬阻断问题才进入 error；warning-only（如 unsatisfied-line）
  // 允许事务继续走到封存，最终由 Preview 标记 ready-with-warnings。
  page.dataset.layoutState = hasBlockingDeterministicLayoutIssues(issues)
    ? 'error'
    : (options.state ?? 'pending')
  page.dataset.layoutIssueCount = String(issues.length)
  page.dataset.layoutIssues = JSON.stringify(
    issues.map((issue) => ({
      code: issue.code,
      blockIndex: issue.blockIndex,
      blockText: issue.blockText,
      message: issue.message,
    })),
  )
  page.dataset.layoutBlockCount = String(blocks.length)
  page.dataset.layoutLineCount = String(
    blockResults.reduce((total, result) => total + result.lineCount, 0),
  )
  page.dataset.layoutFontRequest = JSON.stringify(
    Array.from(fontRequests.values()),
  )
  return {
    snapshotId,
    blockCount: blocks.length,
    lineCount: blockResults.reduce(
      (total, result) => total + result.lineCount,
      0,
    ),
    fontRequests: Array.from(fontRequests.values()),
    issues,
  }
}
