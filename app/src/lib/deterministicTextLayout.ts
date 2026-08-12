export type LayoutAtomKind =
  | 'han'
  | 'digit'
  | 'latin'
  | 'opening-punctuation'
  | 'closing-punctuation'
  | 'middle-punctuation'
  | 'space'
  | 'other'

export interface LayoutAtomInput {
  id: string
  text: string
  kind: LayoutAtomKind
  /** Canvas measureText 得到的字形 advance，不含可伸缩字缝。 */
  advance: number
  /** 实际墨迹相对排版原点的左/右边界，用于行首尾标点光学对齐。 */
  inkLeft?: number
  inkRight?: number
  /** 当前字形的 em，用于把所有弹性上限转换为像素。 */
  em: number
  /** 原 CSS letter-spacing；求解后不再交给浏览器/html2canvas。 */
  letterSpacing?: number
  /** 数字串、拉丁串或“短语不拆”的连续分组。 */
  breakGroup?: string
  /** `true` 表示用户显式设置的不可拆短语，绝不自动拆。 */
  hardNoBreak?: boolean
  /** 对应原文中的 `<br>`；本字素后强制结束当前行。 */
  forcedBreakAfter?: boolean
  /** 内部标记：可见墨迹指标缺失时禁止生成可导出快照。 */
  opticalMetricsMissing?: boolean
}

export type LayoutLineEnd = 'wrap' | 'explicit' | 'paragraph'

export interface PositionedLayoutAtom extends LayoutAtomInput {
  x: number
  boxWidth: number
  glyphOffset: number
  gapAfter: number
}

export interface DeterministicLayoutLine {
  atoms: PositionedLayoutAtom[]
  end: LayoutLineEnd
  justified: boolean
  targetWidth: number
  naturalWidth: number
  actualWidth: number
  residual: number
  hanGapDelta: number
  maxHanGapDeviation: number
  minPunctuationRatio: number | null
  maxPunctuationRatio: number | null
  emergency: boolean
}

export interface DeterministicLayoutOptions {
  /** 标题/封面副标题传 false：仍由同一求解器断行，但不拉伸包行。 */
  justifyWrappedLines?: boolean
  /** @deprecated 双侧墨迹净空现在按字符 profile 求解，仅保留 API 兼容。 */
  punctuationPreferredEm?: number
  punctuationMinEm?: number
  boundaryGapMaxEm?: number
  hanGapExpandMaxEm?: number
  hanGapCompressMaxEm?: number
  /** @deprecated 普通字符边界不再参与两端对齐；仅保留字段兼容旧快照。 */
  otherGapMaxEm?: number
  epsilon?: number
}

interface ResolvedLayoutOptions {
  justifyWrappedLines: boolean
  punctuationMinEm: number
  boundaryGapMaxEm: number
  hanGapExpandMaxEm: number
  hanGapCompressMaxEm: number
  epsilon: number
}

interface WidthSlot {
  min: number
  preferred: number
  max: number
  stage: 1 | 2 | 3 | 4
  uniform: boolean
  /** 开始求解前保存标点两侧的独立净空区间。 */
  opticalLeadingRange?: OpticalRange
  opticalTrailingRange?: OpticalRange
  /**
   * 标点的逻辑 box 被拆成 leading clearance + ink + trailing
   * clearance。三个采样点与 min/preferred/max 一一对应；求解后用
   * 线性插值得到字形原点，保证余差不会只挤在标点某一侧。
   */
  optical?: {
    inkLeft: number
    inkRight: number
    inkWidth: number
    leadingAtMin: number
    leadingAtPreferred: number
    leadingAtMax: number
  }
}

interface OpticalRange {
  min: number
  preferred: number
  max: number
}

interface LineWidthModel {
  atoms: readonly LayoutAtomInput[]
  boxes: WidthSlot[]
  /** 非两端对齐行实际采用的光学 box；与断行宽度必须共用。 */
  raggedBoxes: number[]
  gaps: WidthSlot[]
  min: number
  preferred: number
  natural: number
  max: number
}

interface SegmentSolution {
  cost: number
  lines: DeterministicLayoutLine[]
}

const DEFAULT_OPTIONS: ResolvedLayoutOptions = {
  justifyWrappedLines: true,
  punctuationMinEm: 0.5,
  boundaryGapMaxEm: 0.25,
  // 极端行宽会先耗尽标点和混排边界。0.12em 仍是整行统一的微调，
  // 肉眼远小于旧浏览器 justify 集中到单点的巨大字缝，同时避免
  // 为 1–2px 残差把本可用的中文行误判为失败。
  hanGapExpandMaxEm: 0.12,
  hanGapCompressMaxEm: 0.02,
  epsilon: 0.01,
}

const OPENING_PUNCTUATION = new Set(
  Array.from('“‘（〔［｛〈《「『【〖〘〚﹙﹛﹝'),
)
const CLOSING_PUNCTUATION = new Set(
  Array.from('”’）〕］｝〉》」』】〗〙〛，。、；：？！％‰℃°'),
)
const MIDDLE_PUNCTUATION = new Set(Array.from('·・—…～'))

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function positive(value: number, fallback = 1): number {
  return Math.max(0.001, finite(value, fallback))
}

function resolveOptions(
  options: DeterministicLayoutOptions,
): ResolvedLayoutOptions {
  return {
    justifyWrappedLines: options.justifyWrappedLines ?? true,
    punctuationMinEm: clamp(
      finite(
        options.punctuationMinEm ?? DEFAULT_OPTIONS.punctuationMinEm,
      ),
      0.5,
      1,
    ),
    boundaryGapMaxEm: clamp(
      finite(
        options.boundaryGapMaxEm ?? DEFAULT_OPTIONS.boundaryGapMaxEm,
      ),
      0,
      0.5,
    ),
    hanGapExpandMaxEm: clamp(
      finite(
        options.hanGapExpandMaxEm ?? DEFAULT_OPTIONS.hanGapExpandMaxEm,
      ),
      0,
      0.18,
    ),
    hanGapCompressMaxEm: clamp(
      finite(
        options.hanGapCompressMaxEm ??
          DEFAULT_OPTIONS.hanGapCompressMaxEm,
      ),
      0,
      0.08,
    ),
    epsilon: clamp(
      finite(options.epsilon ?? DEFAULT_OPTIONS.epsilon),
      0.0001,
      0.5,
    ),
  }
}

export function classifyLayoutGrapheme(grapheme: string): LayoutAtomKind {
  if (/^\s+$/u.test(grapheme)) return 'space'
  if (OPENING_PUNCTUATION.has(grapheme)) return 'opening-punctuation'
  if (CLOSING_PUNCTUATION.has(grapheme)) return 'closing-punctuation'
  if (MIDDLE_PUNCTUATION.has(grapheme)) return 'middle-punctuation'
  if (/^\p{Script=Han}$/u.test(grapheme)) return 'han'
  if (/^\p{Number}+$/u.test(grapheme)) return 'digit'
  if (/^\p{Script=Latin}/u.test(grapheme)) return 'latin'
  return 'other'
}

export function isPunctuationKind(kind: LayoutAtomKind): boolean {
  return (
    kind === 'opening-punctuation' ||
    kind === 'closing-punctuation' ||
    kind === 'middle-punctuation'
  )
}

function isLatinLike(kind: LayoutAtomKind): boolean {
  return kind === 'digit' || kind === 'latin'
}

function isCollapsibleSpace(atom: LayoutAtomInput): boolean {
  return (
    atom.kind === 'space' &&
    Array.from(atom.text).every(
      (character) =>
        character === ' ' ||
        (character.codePointAt(0) ?? 0) >= 0x09 &&
          (character.codePointAt(0) ?? 0) <= 0x0d,
    )
  )
}

function isNonBreakingSpace(atom: LayoutAtomInput): boolean {
  return (
    atom.kind === 'space' &&
    /^[\u00a0\u202f]+$/u.test(atom.text)
  )
}

function isHanLatinBoundary(
  left: LayoutAtomInput,
  right: LayoutAtomInput,
): boolean {
  return (
    (left.kind === 'han' && isLatinLike(right.kind)) ||
    (right.kind === 'han' && isLatinLike(left.kind))
  )
}

const OPENING_QUOTES = new Set(Array.from('“‘'))
const CLOSING_QUOTES = new Set(Array.from('”’'))
const OPENING_BRACKETS = new Set(Array.from('（〔［｛〈《「『【〖〘〚﹙﹛﹝'))
const CLOSING_BRACKETS = new Set(Array.from('）〕］｝〉》」』】〗〙〛'))

function opticalRange(
  em: number,
  minEm: number,
  preferredEm: number,
  maxEm: number,
): OpticalRange {
  return {
    min: em * minEm,
    preferred: em * preferredEm,
    max: em * maxEm,
  }
}

function orderedOpticalRange(range: OpticalRange): OpticalRange {
  const min = Math.max(0, finite(range.min))
  const preferred = Math.max(min, finite(range.preferred, min))
  return {
    min,
    preferred,
    max: Math.max(preferred, finite(range.max, preferred)),
  }
}

/**
 * 标点一侧与普通文字相邻时，约束的是两枚字形“可见墨迹”之间的
 * 总净空，而不是标点逻辑 box 的某一条边。数值来自 Noto/思源中文
 * 字体实测，并以 em 表示，所以字号变化不会改变视觉节奏。
 */
function punctuationTextGapRange(
  atom: LayoutAtomInput,
  side: 'leading' | 'trailing',
  em: number,
): OpticalRange {
  const text = atom.text
  if (text === '：') return opticalRange(em, 0.18, 0.24, 0.32)
  if (text === '；') {
    return side === 'leading'
      ? opticalRange(em, 0.15, 0.20, 0.29)
      : opticalRange(em, 0.18, 0.24, 0.32)
  }
  if (text === '，' || text === '、') {
    return side === 'leading'
      ? opticalRange(em, 0.15, 0.18, 0.28)
      : opticalRange(em, 0.16, 0.22, 0.30)
  }
  if (text === '。') {
    return side === 'leading'
      ? opticalRange(em, 0.15, 0.18, 0.26)
      : opticalRange(em, 0.18, 0.24, 0.32)
  }
  if (text === '？' || text === '！') {
    return side === 'leading'
      ? opticalRange(em, 0.15, 0.20, 0.29)
      : opticalRange(em, 0.18, 0.24, 0.32)
  }
  if (OPENING_QUOTES.has(text)) {
    return side === 'leading'
      ? opticalRange(em, 0.16, 0.22, 0.28)
      : opticalRange(em, 0.14, 0.18, 0.24)
  }
  if (CLOSING_QUOTES.has(text)) {
    return side === 'leading'
      ? opticalRange(em, 0.14, 0.18, 0.24)
      : opticalRange(em, 0.16, 0.22, 0.28)
  }
  if (OPENING_BRACKETS.has(text)) {
    return side === 'leading'
      ? opticalRange(em, 0.14, 0.20, 0.28)
      : opticalRange(em, 0.08, 0.12, 0.18)
  }
  if (CLOSING_BRACKETS.has(text)) {
    return side === 'leading'
      ? opticalRange(em, 0.08, 0.12, 0.18)
      : opticalRange(em, 0.14, 0.20, 0.28)
  }
  return opticalRange(em, 0.13, 0.20, 0.30)
}

/** 标点没有同侧邻字（段首/行首/行尾）时自身保留的安全净空。 */
function punctuationEdgeClearanceRange(
  atom: LayoutAtomInput,
  side: 'leading' | 'trailing',
): OpticalRange {
  const em = positive(atom.em)
  if (OPENING_QUOTES.has(atom.text) && side === 'leading') {
    return opticalRange(em, 0.05, 0.08, 0.12)
  }
  if (CLOSING_QUOTES.has(atom.text) && side === 'trailing') {
    return opticalRange(em, 0.08, 0.12, 0.18)
  }
  if (atom.text === '，' || atom.text === '、' || atom.text === '。') {
    return side === 'leading'
      ? opticalRange(em, 0.08, 0.13, 0.20)
      : opticalRange(em, 0.12, 0.17, 0.24)
  }
  return opticalRange(em, 0.10, 0.16, 0.24)
}

/** 连续标点共享一次净空，避免 `。”` / `”，` 把两份边距叠加。 */
function punctuationClusterGapRange(
  left: LayoutAtomInput,
  right: LayoutAtomInput,
): OpticalRange {
  const em = Math.min(positive(left.em), positive(right.em))
  if (
    left.kind === 'closing-punctuation' &&
    right.kind === 'opening-punctuation'
  ) {
    return opticalRange(em, 0.08, 0.12, 0.16)
  }
  if (
    left.kind === 'closing-punctuation' &&
    right.kind === 'closing-punctuation'
  ) {
    return opticalRange(em, 0.06, 0.10, 0.14)
  }
  if (
    left.kind === 'opening-punctuation' &&
    right.kind === 'opening-punctuation'
  ) {
    return opticalRange(em, 0.06, 0.10, 0.14)
  }
  return opticalRange(em, 0.08, 0.13, 0.20)
}

function atomInkMetrics(atom: LayoutAtomInput): {
  inkLeft: number
  inkRight: number
  inkWidth: number
} {
  const advance = atom.text === '' ? 0 : positive(atom.advance)
  const inkLeft = finite(atom.inkLeft ?? 0)
  const inkRight = finite(atom.inkRight ?? advance, advance)
  return {
    inkLeft,
    inkRight,
    // actualBoundingBoxLeft 是从原点向左的有符号距离，因此墨迹区间
    // 是 [-inkLeft, inkRight]，宽度为两者之和。
    inkWidth: Math.max(0, inkLeft + inkRight),
  }
}

function atomLeadingBearing(atom: LayoutAtomInput): number {
  return -atomInkMetrics(atom).inkLeft
}

function atomTrailingBearing(atom: LayoutAtomInput): number {
  return positive(atom.advance) - atomInkMetrics(atom).inkRight
}

function subtractFixedClearance(
  range: OpticalRange,
  fixed: number,
): OpticalRange {
  return orderedOpticalRange({
    min: range.min - fixed,
    preferred: range.preferred - fixed,
    max: range.max - fixed,
  })
}

function splitClusterClearance(
  range: OpticalRange,
  fixedGap: number,
): OpticalRange {
  return orderedOpticalRange({
    min: (range.min - fixedGap) / 2,
    preferred: (range.preferred - fixedGap) / 2,
    max: (range.max - fixedGap) / 2,
  })
}

function leadingForClearanceLevel(
  totalClearance: number,
  desiredLeading: number,
  desiredTrailing: number,
  leadingFloor: number,
  trailingFloor: number,
): number {
  const safeLeadingFloor = Math.max(0, leadingFloor)
  const safeTrailingFloor = Math.max(0, trailingFloor)
  const available = Math.max(
    safeLeadingFloor + safeTrailingFloor,
    totalClearance,
  )
  const desiredLeadingExtra = Math.max(0, desiredLeading - safeLeadingFloor)
  const desiredTrailingExtra = Math.max(0, desiredTrailing - safeTrailingFloor)
  const desiredExtra = desiredLeadingExtra + desiredTrailingExtra
  const availableExtra = available - safeLeadingFloor - safeTrailingFloor
  if (availableExtra <= 0) return safeLeadingFloor
  if (desiredExtra <= 0) return safeLeadingFloor + availableExtra / 2
  const usedDesired = Math.min(availableExtra, desiredExtra)
  const desiredShare = desiredLeadingExtra / desiredExtra
  const surplus = availableExtra - usedDesired
  const surplusShare = desiredLeading + desiredTrailing > 0
    ? desiredLeading / (desiredLeading + desiredTrailing)
    : 0.5
  return safeLeadingFloor + usedDesired * desiredShare + surplus * surplusShare
}

function punctuationSlot(
  atom: LayoutAtomInput,
  options: ResolvedLayoutOptions,
  leadingRange: OpticalRange,
  trailingRange: OpticalRange,
  participatesInCluster: boolean,
): WidthSlot {
  const advance = atom.text === ''
    ? 0
    : atom.kind === 'space'
      ? Math.max(0, finite(atom.advance))
      : positive(atom.advance)
  const em = positive(atom.em)
  if (!isPunctuationKind(atom.kind)) {
    if (atom.kind === 'space') {
      return {
        min: advance,
        preferred: advance,
        max: advance,
        stage: 4,
        uniform: false,
      }
    }
    return {
      min: advance,
      preferred: advance,
      max: advance,
      stage: 4,
      uniform: false,
    }
  }

  const metrics = atomInkMetrics(atom)
  if (
    atom.opticalMetricsMissing ||
    atom.inkLeft === undefined ||
    atom.inkRight === undefined
  ) {
    // 没有字形墨迹指标便无法判断左右可见距离。生产路径会由字体预检
    // 阻止这种快照；此处保守保留完整 advance，不猜测半宽位置。
    return {
      min: advance,
      preferred: advance,
      max: advance,
      stage: 1,
      uniform: false,
      optical: {
        ...metrics,
        leadingAtMin: 0,
        leadingAtPreferred: 0,
        leadingAtMax: 0,
      },
    }
  }

  const leading = orderedOpticalRange(leadingRange)
  const trailing = orderedOpticalRange(trailingRange)
  // 0.5em 是全角分隔标点的极端占宽下限。成对标点 cluster 与
  // 引号本身更窄，若强行补足半字宽，补出的透明量会把 cluster
  // 间距撑过上限；这些场景改由“墨迹 + 双侧硬净空”决定下限。
  const usesHalfEmFloor =
    !participatesInCluster &&
    (atom.kind === 'middle-punctuation' ||
    (
      !OPENING_QUOTES.has(atom.text) &&
      !CLOSING_QUOTES.has(atom.text) &&
      atom.kind !== 'opening-punctuation' &&
      leading.min + trailing.min >= em * 0.1 &&
      // 连续标点必须共享同一份 cluster 净空；不能因为全局半字宽
      // 下限又把其中一枚撑大，重现 `：《` / `：“` 的不协调空洞。
      leading.min >= em * 0.06 &&
      trailing.min >= em * 0.06
    ))
  const min = Math.max(
    usesHalfEmFloor ? em * options.punctuationMinEm : 0,
    metrics.inkWidth + leading.min + trailing.min,
  )
  const preferred = Math.max(
    min,
    metrics.inkWidth + leading.preferred + trailing.preferred,
  )
  // 极端标点的墨迹本身可能接近 1em。绝不缩放/裁切墨迹；若安全净空
  // 已超过原 advance，就允许逻辑 box 略大于 advance，并交给断行处理。
  const max = Math.max(
    preferred,
    Math.min(
      Math.max(advance, metrics.inkWidth),
      metrics.inkWidth + leading.max + trailing.max,
    ),
  )
  const minClearance = Math.max(0, min - metrics.inkWidth)
  const leadingAtMin = leadingForClearanceLevel(
    minClearance,
    leading.min,
    trailing.min,
    0,
    0,
  )
  const preferredClearance = Math.max(0, preferred - metrics.inkWidth)
  const leadingAtPreferred = leadingForClearanceLevel(
    preferredClearance,
    leading.preferred,
    trailing.preferred,
    leadingAtMin,
    minClearance - leadingAtMin,
  )
  const maxClearance = Math.max(0, max - metrics.inkWidth)
  const leadingAtMax = leadingForClearanceLevel(
    maxClearance,
    leading.max,
    trailing.max,
    leadingAtPreferred,
    preferredClearance - leadingAtPreferred,
  )
  return {
    min,
    preferred,
    max,
    stage: 1,
    uniform: false,
    optical: {
      ...metrics,
      leadingAtMin,
      leadingAtPreferred,
      leadingAtMax,
    },
    opticalLeadingRange: leading,
    opticalTrailingRange: trailing,
  }
}

function gapSlot(
  left: LayoutAtomInput,
  right: LayoutAtomInput,
  options: ResolvedLayoutOptions,
): WidthSlot {
  if (
    (left.kind === 'space' && left.advance === 0) ||
    (right.kind === 'space' && right.advance === 0)
  ) {
    return {
      min: 0,
      preferred: 0,
      max: 0,
      stage: 4,
      uniform: false,
    }
  }
  const base = finite(left.letterSpacing ?? 0)
  const em = Math.min(positive(left.em), positive(right.em))
  // 数字/拉丁串内部的原始 tracking 属于字形排版，不是两端
  // 对齐的弹性来源。保持它不变才不会拉伸“2026”本身。
  if (
    left.breakGroup &&
    left.breakGroup === right.breakGroup &&
    isLatinLike(left.kind) &&
    isLatinLike(right.kind)
  ) {
    return {
      min: base,
      preferred: base,
      max: base,
      stage: 4,
      uniform: false,
    }
  }
  if (left.kind === 'han' && right.kind === 'han') {
    return {
      min: base - em * options.hanGapCompressMaxEm,
      preferred: base,
      max: base + em * options.hanGapExpandMaxEm,
      stage: 3,
      uniform: true,
    }
  }
  if (isHanLatinBoundary(left, right)) {
    return {
      min: Math.min(0, base),
      preferred: base,
      max: base + em * options.boundaryGapMaxEm,
      stage: 2,
      uniform: false,
    }
  }
  return {
    min: base,
    preferred: base,
    max: base,
    stage: 4,
    uniform: false,
  }
}

function collapseLineEdgeSpaces(
  atoms: readonly LayoutAtomInput[],
): readonly LayoutAtomInput[] {
  let firstVisible = 0
  while (
    firstVisible < atoms.length &&
    isCollapsibleSpace(atoms[firstVisible])
  ) {
    firstVisible += 1
  }
  let lastVisible = atoms.length - 1
  while (
    lastVisible >= firstVisible &&
    isCollapsibleSpace(atoms[lastVisible])
  ) {
    lastVisible -= 1
  }
  if (firstVisible === 0 && lastVisible === atoms.length - 1) return atoms
  return atoms.map((atom, index) =>
    isCollapsibleSpace(atom) &&
      (index < firstVisible || index > lastVisible)
      ? {
          ...atom,
          advance: 0,
          inkLeft: 0,
          inkRight: 0,
          letterSpacing: 0,
        }
      : atom,
  )
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

function widthModel(
  atoms: readonly LayoutAtomInput[],
  options: ResolvedLayoutOptions,
  collapseEdgeSpaces = true,
): LineWidthModel {
  const measuredAtoms = collapseEdgeSpaces
    ? collapseLineEdgeSpaces(atoms)
    : atoms
  const gaps = measuredAtoms.slice(0, -1).map((atom, index) =>
    gapSlot(atom, measuredAtoms[index + 1], options),
  )
  const leadingRanges = measuredAtoms.map((atom) =>
    punctuationEdgeClearanceRange(atom, 'leading'),
  )
  const trailingRanges = measuredAtoms.map((atom) =>
    punctuationEdgeClearanceRange(atom, 'trailing'),
  )
  const clusterMembers = new Set<number>()

  measuredAtoms.slice(0, -1).forEach((left, index) => {
    const right = measuredAtoms[index + 1]
    if (
      left.kind === 'space' ||
      right.kind === 'space' ||
      left.text === '' ||
      right.text === ''
    ) {
      return
    }
    const leftPunctuation = isPunctuationKind(left.kind)
    const rightPunctuation = isPunctuationKind(right.kind)
    if (!leftPunctuation && !rightPunctuation) return
    const fixedGap = gaps[index]?.preferred ?? 0

    if (leftPunctuation && rightPunctuation) {
      clusterMembers.add(index)
      clusterMembers.add(index + 1)
      const shared = splitClusterClearance(
        punctuationClusterGapRange(left, right),
        fixedGap,
      )
      trailingRanges[index] = shared
      leadingRanges[index + 1] = shared
      return
    }
    if (leftPunctuation) {
      trailingRanges[index] = subtractFixedClearance(
        punctuationTextGapRange(left, 'trailing', positive(left.em)),
        fixedGap + atomLeadingBearing(right),
      )
      return
    }
    leadingRanges[index + 1] = subtractFixedClearance(
      punctuationTextGapRange(right, 'leading', positive(right.em)),
      atomTrailingBearing(left) + fixedGap,
    )
  })

  const boxes = measuredAtoms.map((atom, index) =>
    punctuationSlot(
      atom,
      options,
      leadingRanges[index],
      trailingRanges[index],
      clusterMembers.has(index),
    ),
  )
  // 非两端对齐行与求解器的 preferred 状态完全相同，避免编辑器和
  // 导出分别走“自然 1em”与“压缩 0.5em”两套浏览器行为。
  const raggedBoxes = boxes.map((slot) => slot.preferred)
  return {
    atoms: measuredAtoms,
    boxes,
    raggedBoxes,
    gaps,
    min: sum(boxes.map((slot) => slot.min)) +
      sum(gaps.map((slot) => slot.min)),
    preferred: sum(boxes.map((slot) => slot.preferred)) +
      sum(gaps.map((slot) => slot.preferred)),
    natural: sum(raggedBoxes) + sum(gaps.map((slot) => slot.preferred)),
    max: sum(boxes.map((slot) => slot.max)) +
      sum(gaps.map((slot) => slot.max)),
  }
}

function distributeProportionally(
  values: number[],
  slots: readonly WidthSlot[],
  indexes: readonly number[],
  amount: number,
  expand: boolean,
): number {
  if (amount <= 0 || indexes.length === 0) return 0
  const capacities = indexes.map((index) =>
    expand
      ? Math.max(0, slots[index].max - values[index])
      : Math.max(0, values[index] - slots[index].min),
  )
  const totalCapacity = sum(capacities)
  if (totalCapacity <= 0) return 0
  const used = Math.min(amount, totalCapacity)
  indexes.forEach((index, offset) => {
    const delta = used * (capacities[offset] / totalCapacity)
    values[index] += expand ? delta : -delta
  })
  return used
}

function distributeUniformly(
  values: number[],
  slots: readonly WidthSlot[],
  indexes: readonly number[],
  amount: number,
  expand: boolean,
): number {
  if (amount <= 0 || indexes.length === 0) return 0
  const perSlotCapacity = Math.min(
    ...indexes.map((index) =>
      expand
        ? Math.max(0, slots[index].max - values[index])
        : Math.max(0, values[index] - slots[index].min),
    ),
  )
  const used = Math.min(amount, perSlotCapacity * indexes.length)
  const delta = used / indexes.length
  indexes.forEach((index) => {
    values[index] += expand ? delta : -delta
  })
  return used
}

function visibleBoundaryGap(
  model: LineWidthModel,
  boxes: readonly number[],
  gaps: readonly number[],
  index: number,
): number {
  const left = model.atoms[index]
  const right = model.atoms[index + 1]
  const leftSlot = model.boxes[index]
  const rightSlot = model.boxes[index + 1]
  return (
    boxes[index] - glyphOffset(leftSlot, boxes[index]) -
      atomInkMetrics(left).inkRight +
    (gaps[index] ?? 0) +
    glyphOffset(rightSlot, boxes[index + 1]) -
      atomInkMetrics(right).inkLeft
  )
}

function punctuationBoundaryProfile(
  left: LayoutAtomInput,
  right: LayoutAtomInput,
): OpticalRange | null {
  const leftPunctuation = isPunctuationKind(left.kind)
  const rightPunctuation = isPunctuationKind(right.kind)
  if (!leftPunctuation && !rightPunctuation) return null
  if (leftPunctuation && rightPunctuation) {
    return punctuationClusterGapRange(left, right)
  }
  return leftPunctuation
    ? punctuationTextGapRange(left, 'trailing', positive(left.em))
    : punctuationTextGapRange(right, 'leading', positive(right.em))
}

function visiblePunctuationCorridorsPass(
  model: LineWidthModel,
  boxes: readonly number[],
  gaps: readonly number[],
  epsilon: number,
): boolean {
  for (let index = 0; index < model.atoms.length - 1; index += 1) {
    const left = model.atoms[index]
    const right = model.atoms[index + 1]
    if (left.kind === 'space' || right.kind === 'space') continue
    const profile = punctuationBoundaryProfile(left, right)
    if (!profile) continue
    const gap = visibleBoundaryGap(model, boxes, gaps, index)
    if (gap < profile.min - epsilon || gap > profile.max + epsilon) {
      return false
    }
  }
  return true
}

function solvePunctuationBoxOrigins(
  model: LineWidthModel,
  boxes: readonly number[],
  gaps: readonly number[],
  epsilon: number,
): { model: LineWidthModel; feasible: boolean } {
  interface LeadingInterval {
    min: number
    preferred: number
    max: number
  }

  const leadingIntervals = model.atoms.map(
    (atom, index): LeadingInterval | null => {
      const slot = model.boxes[index]
      if (!isPunctuationKind(atom.kind) || !slot.optical) return null
      const totalClearance = Math.max(0, boxes[index] - slot.optical.inkWidth)
      const leading = slot.opticalLeadingRange ?? opticalRange(
        positive(atom.em),
        0,
        0,
        1,
      )
      const trailing = slot.opticalTrailingRange ?? opticalRange(
        positive(atom.em),
        0,
        0,
        1,
      )
      const minimum = Math.max(
        0,
        leading.min,
        totalClearance - trailing.max,
      )
      const maximum = Math.min(
        totalClearance,
        leading.max,
        totalClearance - trailing.min,
      )
      const preferred = clamp(
        (leading.preferred + totalClearance - trailing.preferred) / 2,
        minimum,
        maximum,
      )
      return { min: minimum, preferred, max: maximum }
    },
  )

  // 把普通文字—标点两侧都转成“标点墨迹前的净空”同一
  // 变量的连续区间。只有交集中的位置才可用，因此不会为了
  // 照顾一边而把另一边挤出安全范围。
  for (let index = 0; index < model.atoms.length; index += 1) {
    const interval = leadingIntervals[index]
    if (!interval) continue
    const atom = model.atoms[index]
    const slot = model.boxes[index]
    const optical = slot.optical!
    const totalClearance = Math.max(0, boxes[index] - optical.inkWidth)
    const left = model.atoms[index - 1]
    if (
      left &&
      left.kind !== 'space' &&
      !isPunctuationKind(left.kind)
    ) {
      const profile = punctuationBoundaryProfile(left, atom)!
      const fixed = atomTrailingBearing(left) + (gaps[index - 1] ?? 0)
      interval.min = Math.max(interval.min, profile.min - fixed)
      interval.max = Math.min(interval.max, profile.max - fixed)
      interval.preferred = clamp(
        profile.preferred - fixed,
        interval.min,
        interval.max,
      )
    }
    const right = model.atoms[index + 1]
    if (
      right &&
      right.kind !== 'space' &&
      !isPunctuationKind(right.kind)
    ) {
      const profile = punctuationBoundaryProfile(atom, right)!
      const fixed = (gaps[index] ?? 0) + atomLeadingBearing(right)
      interval.min = Math.max(
        interval.min,
        totalClearance + fixed - profile.max,
      )
      interval.max = Math.min(
        interval.max,
        totalClearance + fixed - profile.min,
      )
      const rightPreferred = totalClearance + fixed - profile.preferred
      interval.preferred = clamp(
        (interval.preferred + rightPreferred) / 2,
        interval.min,
        interval.max,
      )
    }
  }

  const clusters: number[][] = []
  let cursor = 0
  while (cursor < model.atoms.length) {
    if (!isPunctuationKind(model.atoms[cursor].kind)) {
      cursor += 1
      continue
    }
    const cluster = [cursor]
    cursor += 1
    while (
      cursor < model.atoms.length &&
      isPunctuationKind(model.atoms[cursor].kind)
    ) {
      cluster.push(cursor)
      cursor += 1
    }
    clusters.push(cluster)
  }

  const chosenLeading = new Map<number, number>()
  for (const cluster of clusters) {
    const reachable: LeadingInterval[] = []
    let feasible = true
    for (let offset = 0; offset < cluster.length; offset += 1) {
      const atomIndex = cluster[offset]
      const local = leadingIntervals[atomIndex]
      if (!local || local.min > local.max + epsilon) {
        feasible = false
        break
      }
      if (offset === 0) {
        reachable.push({ ...local })
        continue
      }
      const previousIndex = cluster[offset - 1]
      const previousReachable = reachable[offset - 1]
      const previousSlot = model.boxes[previousIndex]
      const previousClearance = Math.max(
        0,
        boxes[previousIndex] - previousSlot.optical!.inkWidth,
      )
      const profile = punctuationClusterGapRange(
        model.atoms[previousIndex],
        model.atoms[atomIndex],
      )
      const fixedGap = gaps[previousIndex] ?? 0
      // visibleGap = previousClearance - L(prev) + gap + L(current)
      const differenceMin = profile.min - previousClearance - fixedGap
      const differenceMax = profile.max - previousClearance - fixedGap
      const minimum = Math.max(
        local.min,
        previousReachable.min + differenceMin,
      )
      const maximum = Math.min(
        local.max,
        previousReachable.max + differenceMax,
      )
      if (minimum > maximum + epsilon) {
        feasible = false
        break
      }
      reachable.push({
        min: minimum,
        preferred: clamp(local.preferred, minimum, maximum),
        max: maximum,
      })
    }
    if (!feasible) return { model, feasible: false }

    const values = new Array<number>(cluster.length)
    const lastOffset = cluster.length - 1
    values[lastOffset] = clamp(
      reachable[lastOffset].preferred,
      reachable[lastOffset].min,
      reachable[lastOffset].max,
    )
    for (let offset = lastOffset - 1; offset >= 0; offset -= 1) {
      const atomIndex = cluster[offset]
      const nextIndex = cluster[offset + 1]
      const slot = model.boxes[atomIndex]
      const clearance = Math.max(
        0,
        boxes[atomIndex] - slot.optical!.inkWidth,
      )
      const profile = punctuationClusterGapRange(
        model.atoms[atomIndex],
        model.atoms[nextIndex],
      )
      const fixedGap = gaps[atomIndex] ?? 0
      const differenceMin = profile.min - clearance - fixedGap
      const differenceMax = profile.max - clearance - fixedGap
      const minimum = Math.max(
        reachable[offset].min,
        values[offset + 1] - differenceMax,
      )
      const maximum = Math.min(
        reachable[offset].max,
        values[offset + 1] - differenceMin,
      )
      values[offset] = clamp(
        reachable[offset].preferred,
        minimum,
        maximum,
      )
    }
    cluster.forEach((atomIndex, offset) => {
      chosenLeading.set(atomIndex, values[offset])
    })
  }

  if (chosenLeading.size === 0) return { model, feasible: true }
  const solvedBoxes = model.boxes.map((slot, index) => {
    const leading = chosenLeading.get(index)
    return leading === undefined || !slot.optical
      ? slot
      : {
          ...slot,
          optical: {
            ...slot.optical,
            leadingAtMin: leading,
            leadingAtPreferred: leading,
            leadingAtMax: leading,
          },
        }
  })
  return { model: { ...model, boxes: solvedBoxes }, feasible: true }
}

function enforceVisiblePunctuationCorridors(
  model: LineWidthModel,
  boxes: number[],
  gaps: readonly number[],
  expand: boolean,
  epsilon: number,
): number {
  if (!expand) return 0
  let released = 0
  for (let index = 0; index < model.atoms.length - 1; index += 1) {
    const left = model.atoms[index]
    const right = model.atoms[index + 1]
    if (left.kind === 'space' || right.kind === 'space') continue
    const profile = punctuationBoundaryProfile(left, right)
    if (!profile) continue
    let overflow = visibleBoundaryGap(model, boxes, gaps, index) - profile.max
    if (overflow <= epsilon) continue

    // 正余差只能把可见净空释放到字符相应的上限。若该 boundary 已满，
    // 撤回相邻标点 box 的扩张，把余差留给后续混排边界/统一汉缝。
    for (const boxIndex of [index, index + 1]) {
      if (overflow <= epsilon) break
      if (!isPunctuationKind(model.atoms[boxIndex].kind)) continue
      const reducible = Math.max(0, boxes[boxIndex] - model.boxes[boxIndex].preferred)
      if (reducible <= 0) continue
      // 二分找到仍满足 corridor 的最大可撤回量；glyphOffset 随 box
      // 插值，不能把 box delta 直接当作 visible-gap delta。
      let low = 0
      let high = reducible
      boxes[boxIndex] -= high
      const fullReductionFits = visibleBoundaryGap(
        model,
        boxes,
        gaps,
        index,
      ) <= profile.max + epsilon
      boxes[boxIndex] += high
      if (!fullReductionFits) {
        boxes[boxIndex] -= high
        released += high
        overflow = visibleBoundaryGap(model, boxes, gaps, index) - profile.max
        continue
      }
      for (let iteration = 0; iteration < 24; iteration += 1) {
        const middle = (low + high) / 2
        boxes[boxIndex] -= middle
        const fits = visibleBoundaryGap(model, boxes, gaps, index) <=
          profile.max + epsilon
        boxes[boxIndex] += middle
        if (fits) high = middle
        else low = middle
      }
      const reduction = Math.min(reducible, high)
      boxes[boxIndex] -= reduction
      released += reduction
      overflow = visibleBoundaryGap(model, boxes, gaps, index) - profile.max
    }
  }
  return released
}

function balanceInternalColonSides(
  model: LineWidthModel,
  boxes: number[],
  gaps: readonly number[],
): LineWidthModel {
  const balancedBoxes = [...model.boxes]
  for (let index = 1; index < model.atoms.length - 1; index += 1) {
    const atom = model.atoms[index]
    if (atom.text !== '：') continue
    const left = model.atoms[index - 1]
    const right = model.atoms[index + 1]
    if (
      isPunctuationKind(left.kind) ||
      isPunctuationKind(right.kind) ||
      left.kind === 'space' ||
      right.kind === 'space'
    ) {
      continue
    }
    const leadingGap = visibleBoundaryGap(model, boxes, gaps, index - 1)
    const trailingGap = visibleBoundaryGap(model, boxes, gaps, index)
    const desiredShift = (trailingGap - leadingGap) / 2
    if (Math.abs(desiredShift) <= 1e-6) continue
    const slot = balancedBoxes[index]
    const optical = slot.optical
    if (!optical) continue
    const currentLeading = glyphOffset(slot, boxes[index]) - optical.inkLeft
    const currentTrailing = boxes[index] - optical.inkWidth - currentLeading
    const nextLeading = clamp(
      currentLeading + desiredShift,
      0,
      Math.max(0, boxes[index] - optical.inkWidth),
    )
    const nextTrailing = boxes[index] - optical.inkWidth - nextLeading
    // 只接受不会令任一侧更差的平衡移动；逻辑宽度完全不变。
    if (
      nextLeading >= 0 &&
      nextTrailing >= 0 &&
      Math.abs((leadingGap + nextLeading - currentLeading) -
        (trailingGap + nextTrailing - currentTrailing)) <
        Math.abs(leadingGap - trailingGap)
    ) {
      balancedBoxes[index] = stabilizedOpticalSlot(
        slot,
        boxes[index],
        nextLeading,
      )
    }
  }
  return balancedBoxes.some((slot, index) => slot !== model.boxes[index])
    ? { ...model, boxes: balancedBoxes }
    : model
}

function stabilizedOpticalSlot(
  slot: WidthSlot,
  boxWidth: number,
  leading: number,
): WidthSlot {
  const optical = slot.optical
  if (!optical) return slot
  const width = Math.max(optical.inkWidth, boxWidth)
  const stableLeading = clamp(leading, 0, width - optical.inkWidth)
  const stableTrailing = width - optical.inkWidth - stableLeading
  return {
    ...slot,
    min: width,
    preferred: width,
    max: width,
    opticalLeadingRange: {
      min: stableLeading,
      preferred: stableLeading,
      max: stableLeading,
    },
    opticalTrailingRange: {
      min: stableTrailing,
      preferred: stableTrailing,
      max: stableTrailing,
    },
    optical: {
      ...optical,
      leadingAtMin: stableLeading,
      leadingAtPreferred: stableLeading,
      leadingAtMax: stableLeading,
    },
  }
}

function stageIndexes(slots: readonly WidthSlot[], stage: number): number[] {
  return slots.flatMap((slot, index) => (slot.stage === stage ? [index] : []))
}

function adjustWidths(
  model: LineWidthModel,
  targetWidth: number,
  justify: boolean,
  epsilon: number,
): {
  model: LineWidthModel
  boxes: number[]
  gaps: number[]
  emergency: boolean
} {
  const boxes = justify
    ? model.boxes.map((slot) => slot.preferred)
    : [...model.raggedBoxes]
  const gaps = model.gaps.map((slot) => slot.preferred)
  const initialWidth = sum(boxes) + sum(gaps)
  const desiredWidth = justify ? targetWidth : initialWidth
  let residual = desiredWidth - initialWidth
  const expand = residual >= 0
  let remaining = Math.abs(residual)

  // 标点双侧净空是第一弹性来源；达到各自硬边界后才轮到汉字—
  // 数字/拉丁边界，最后才统一微调所有汉—汉字缝。
  for (const stage of [1, 2, 3] as const) {
    const boxIndexes = stageIndexes(model.boxes, stage)
    const gapIndexes = stageIndexes(model.gaps, stage)
    const uniform = stage === 3
    remaining -= distributeProportionally(
      boxes,
      model.boxes,
      boxIndexes,
      remaining,
      expand,
    )
    remaining -= uniform
      ? distributeUniformly(
          gaps,
          model.gaps,
          gapIndexes,
          remaining,
          expand,
        )
      : distributeProportionally(
          gaps,
          model.gaps,
          gapIndexes,
          remaining,
          expand,
        )
    if (remaining <= epsilon) break
  }

  // 第 1 阶段是按容量分摊 box，单个标点左右两侧可能同时邻接不同
  // profile。分摊后再以实际墨迹边界回查，撤掉会越过视觉上限的部分。
  // 撤回的量不能再回灌标点，而是继续交给第 2 阶段混排
  // 边界，最后再统一分给汉—汉缝。
  const released = enforceVisiblePunctuationCorridors(
    model,
    boxes,
    gaps,
    expand,
    epsilon,
  )
  remaining += released
  if (expand && released > epsilon) {
    for (const stage of [2, 3] as const) {
      const gapIndexes = stageIndexes(model.gaps, stage)
      remaining -= stage === 3
        ? distributeUniformly(
            gaps,
            model.gaps,
            gapIndexes,
            remaining,
            true,
          )
        : distributeProportionally(
            gaps,
            model.gaps,
            gapIndexes,
            remaining,
            true,
          )
      if (remaining <= epsilon) break
    }
  }

  // 冒号是视觉中心明确的符号。在最终 box 宽度确定后对其字形原点做
  // 等量反向平移，使普通文字夹着的冒号两侧净空真正对称。
  const originSolution = solvePunctuationBoxOrigins(
    model,
    boxes,
    gaps,
    epsilon,
  )
  let positionedModel = originSolution.model
  positionedModel = balanceInternalColonSides(
    positionedModel,
    boxes,
    gaps,
  )

  residual = expand ? remaining : -remaining
  return {
    model: positionedModel,
    boxes,
    gaps,
    emergency: !originSolution.feasible || Math.abs(residual) > epsilon,
  }
}

function lineCost(
  model: LineWidthModel,
  targetWidth: number,
  ragged: boolean,
): number {
  if (ragged) {
    const slack = Math.max(0, targetWidth - model.natural) / targetWidth
    return slack < 0.75 ? slack * slack * 0.002 : 0.05 + slack
  }
  const adjustment = Math.abs(targetWidth - model.preferred) / targetWidth
  return adjustment * adjustment
}

function lineCanSatisfyVisibleCorridors(
  model: LineWidthModel,
  targetWidth: number,
  justify: boolean,
  epsilon: number,
): boolean {
  const adjusted = adjustWidths(model, targetWidth, justify, epsilon)
  return !adjusted.emergency && visiblePunctuationCorridorsPass(
    adjusted.model,
    adjusted.boxes,
    adjusted.gaps,
    epsilon,
  )
}

function breakGroupWidths(
  atoms: readonly LayoutAtomInput[],
  targetWidth: number,
  options: ResolvedLayoutOptions,
): Map<string, number> {
  const groups = new Map<string, LayoutAtomInput[]>()
  for (const atom of atoms) {
    if (!atom.breakGroup || atom.hardNoBreak) continue
    const current = groups.get(atom.breakGroup) ?? []
    current.push(atom)
    groups.set(atom.breakGroup, current)
  }
  return new Map(
    Array.from(groups, ([key, members]) => [
      key,
      widthModel(members, options, false).min <= targetWidth
        ? widthModel(members, options, false).min
        : Number.POSITIVE_INFINITY,
    ]),
  )
}

function legalBreak(
  left: LayoutAtomInput,
  right: LayoutAtomInput,
  groupWidths: ReadonlyMap<string, number>,
): boolean {
  if (isNonBreakingSpace(left) || isNonBreakingSpace(right)) return false
  // 连续标点是一个视觉 cluster：内部只共享一份净空，也不能跨行拆开。
  if (isPunctuationKind(left.kind) && isPunctuationKind(right.kind)) {
    return false
  }
  if (left.kind === 'opening-punctuation') return false
  if (
    right.kind === 'closing-punctuation' ||
    right.kind === 'middle-punctuation'
  ) {
    return false
  }
  if (
    left.breakGroup &&
    left.breakGroup === right.breakGroup &&
    (left.hardNoBreak ||
      right.hardNoBreak ||
      groupWidths.get(left.breakGroup) !== Number.POSITIVE_INFINITY)
  ) {
    return false
  }
  return true
}

function glyphOffset(
  slot: WidthSlot,
  boxWidth: number,
): number {
  const optical = slot.optical
  if (!optical) return 0
  let leading: number
  if (boxWidth <= slot.preferred && slot.preferred > slot.min) {
    const progress = clamp(
      (boxWidth - slot.min) / (slot.preferred - slot.min),
      0,
      1,
    )
    leading = optical.leadingAtMin +
      (optical.leadingAtPreferred - optical.leadingAtMin) * progress
  } else if (boxWidth > slot.preferred && slot.max > slot.preferred) {
    const progress = clamp(
      (boxWidth - slot.preferred) / (slot.max - slot.preferred),
      0,
      1,
    )
    leading = optical.leadingAtPreferred +
      (optical.leadingAtMax - optical.leadingAtPreferred) * progress
  } else {
    leading = optical.leadingAtPreferred
  }
  // visibleLeft = x + glyphOffset - inkLeft = x + leading。
  return leading + optical.inkLeft
}

interface LineAdjustmentModel {
  model: LineWidthModel
  solvingTarget: number
  hangingClosingIndex: number | null
}

function lineAdjustmentModel(
  atoms: readonly LayoutAtomInput[],
  targetWidth: number,
  options: ResolvedLayoutOptions,
  justified: boolean,
): LineAdjustmentModel {
  const model = widthModel(atoms, options)
  const lastVisibleIndex = model.boxes.findLastIndex(
    (slot, index) => atoms[index].text !== '' && slot.max > 0,
  )
  if (
    !justified ||
    lastVisibleIndex < 0 ||
    atoms[lastVisibleIndex].kind !== 'closing-punctuation'
  ) {
    return {
      model,
      solvingTarget: targetWidth,
      hangingClosingIndex: null,
    }
  }

  const visibleRightAt = (logicalTarget: number): number => {
    const adjusted = adjustWidths(
      model,
      logicalTarget,
      true,
      options.epsilon,
    )
    let x = 0
    for (let index = 0; index < lastVisibleIndex; index += 1) {
      x += adjusted.boxes[index] + (adjusted.gaps[index] ?? 0)
    }
    const lastBox = adjusted.boxes[lastVisibleIndex]
    return x +
      glyphOffset(adjusted.model.boxes[lastVisibleIndex], lastBox) +
      atomInkMetrics(atoms[lastVisibleIndex]).inkRight
  }

  // 行尾闭标点的逻辑 box 可透明悬挂，但可见右缘必须精确落在
  // targetWidth。先让双侧标点区间完整求解，再以其实际墨迹右缘
  // 二分反求逻辑宽度；`.”` 这类 cluster 也不会在求解后又改变
  // 末字 origin。
  let low = model.min
  let high = model.max
  let lowError = visibleRightAt(low) - targetWidth
  let highError = visibleRightAt(high) - targetWidth
  let solvingTarget: number
  if (lowError > options.epsilon) {
    solvingTarget = low
  } else if (highError < -options.epsilon) {
    solvingTarget = high
  } else {
    for (let iteration = 0; iteration < 40; iteration += 1) {
      const middle = (low + high) / 2
      const error = visibleRightAt(middle) - targetWidth
      if (Math.abs(error) <= 1e-10) {
        low = middle
        high = middle
        lowError = error
        highError = error
        break
      }
      if (error < 0) {
        low = middle
        lowError = error
      } else {
        high = middle
        highError = error
      }
    }
    solvingTarget = Math.abs(lowError) <= Math.abs(highError) ? low : high
  }
  return {
    model,
    solvingTarget,
    hangingClosingIndex: lastVisibleIndex,
  }
}

function materializeLine(
  atoms: readonly LayoutAtomInput[],
  end: LayoutLineEnd,
  targetWidth: number,
  options: ResolvedLayoutOptions,
  justifyWrappedLine = options.justifyWrappedLines,
): DeterministicLayoutLine {
  const justified = end === 'wrap' && justifyWrappedLine
  const adjustment = lineAdjustmentModel(
    atoms,
    targetWidth,
    options,
    justified,
  )
  const model = adjustment.model
  const hangingClosing = adjustment.hangingClosingIndex !== null
  // 行末闭标点以可见右缘参与宽度方程；透明 trailing clearance 可
  // 悬挂到版心外，预览与导出仍共享同一字形原点。
  const adjusted = adjustWidths(
    model,
    adjustment.solvingTarget,
    justified,
    options.epsilon,
  )
  const positionedModel = adjusted.model
  const positioned: PositionedLayoutAtom[] = []
  let x = 0
  atoms.forEach((atom, index) => {
    const boxWidth = adjusted.boxes[index]
    const gapAfter = adjusted.gaps[index] ?? 0
    positioned.push({
      ...atom,
      x,
      boxWidth,
      glyphOffset: glyphOffset(positionedModel.boxes[index], boxWidth),
      gapAfter,
    })
    x += boxWidth + gapAfter
  })

  const hanGaps = positioned.flatMap((atom, index) => {
    const right = positioned[index + 1]
    return right && atom.kind === 'han' && right.kind === 'han'
      ? [atom.gapAfter - finite(atom.letterSpacing ?? 0)]
      : []
  })
  const hanGapDelta = hanGaps.length > 0 ? sum(hanGaps) / hanGaps.length : 0
  const maxHanGapDeviation = hanGaps.length > 0
    ? Math.max(...hanGaps.map((gap) => Math.abs(gap - hanGapDelta)))
    : 0
  const punctuationRatios = positioned.flatMap((atom) =>
    isPunctuationKind(atom.kind)
      ? [atom.boxWidth / positive(atom.em)]
      : [],
  )
  const logicalWidth = positioned.length === 0
    ? 0
    : positioned.at(-1)!.x +
      positioned.at(-1)!.boxWidth +
      positioned.at(-1)!.gapAfter
  const actualWidth = hangingClosing
    ? positioned[adjustment.hangingClosingIndex!].x +
      positioned[adjustment.hangingClosingIndex!].glyphOffset +
      atomInkMetrics(positioned[adjustment.hangingClosingIndex!]).inkRight
    : logicalWidth
  const missingOpticalMetrics = positioned.some(
    (atom) => atom.opticalMetricsMissing && atom.text !== '',
  )

  return {
    atoms: positioned,
    end,
    justified,
    targetWidth,
    naturalWidth: model.natural,
    actualWidth,
    residual: justified ? targetWidth - actualWidth : 0,
    hanGapDelta,
    maxHanGapDeviation,
    minPunctuationRatio:
      punctuationRatios.length > 0 ? Math.min(...punctuationRatios) : null,
    maxPunctuationRatio:
      punctuationRatios.length > 0 ? Math.max(...punctuationRatios) : null,
    emergency:
      adjusted.emergency ||
      missingOpticalMetrics ||
      (!visiblePunctuationCorridorsPass(
        positionedModel,
        adjusted.boxes,
        adjusted.gaps,
        options.epsilon,
      )) ||
      (justified && Math.abs(targetWidth - actualWidth) > options.epsilon) ||
      (!justified && actualWidth > targetWidth + options.epsilon),
  }
}

function solveSegment(
  atoms: readonly LayoutAtomInput[],
  targetWidth: number,
  terminalEnd: Exclude<LayoutLineEnd, 'wrap'>,
  options: ResolvedLayoutOptions,
): DeterministicLayoutLine[] {
  if (atoms.length === 0) {
    return [materializeLine([], terminalEnd, targetWidth, options)]
  }
  const groupWidths = breakGroupWidths(atoms, targetWidth, options)
  if (!options.justifyWrappedLines) {
    const lines: DeterministicLayoutLine[] = []
    let start = 0
    while (start < atoms.length) {
      let furthestLegalEnd: number | null = null
      for (let end = start + 1; end <= atoms.length; end += 1) {
        const slice = atoms.slice(start, end)
        const model = widthModel(slice, options)
        if (
          end === atoms.length ||
          legalBreak(atoms[end - 1], atoms[end], groupWidths)
        ) {
          if (
            model.natural <= targetWidth + options.epsilon &&
            lineCanSatisfyVisibleCorridors(
              model,
              model.natural,
              false,
              options.epsilon,
            )
          ) {
            furthestLegalEnd = end
          }
        }
      }
      let end = furthestLegalEnd ?? start + 1
      if (furthestLegalEnd === null) {
        while (
          end < atoms.length &&
          !legalBreak(atoms[end - 1], atoms[end], groupWidths)
        ) {
          end += 1
        }
      }
      const isLast = end >= atoms.length
      const line = materializeLine(
        atoms.slice(start, Math.min(end, atoms.length)),
        isLast ? terminalEnd : 'wrap',
        targetWidth,
        options,
        false,
      )
      if (furthestLegalEnd === null) line.emergency = true
      lines.push(line)
      start = Math.min(end, atoms.length)
    }
    return lines
  }
  const best: Array<SegmentSolution | null> = Array.from(
    { length: atoms.length + 1 },
    () => null,
  )
  best[atoms.length] = { cost: 0, lines: [] }

  for (let start = atoms.length - 1; start >= 0; start -= 1) {
    for (let end = start + 1; end <= atoms.length; end += 1) {
      if (
        end < atoms.length &&
        !legalBreak(atoms[end - 1], atoms[end], groupWidths)
      ) {
        continue
      }
      const slice = atoms.slice(start, end)
      const isLast = end === atoms.length
      const ragged = isLast || !options.justifyWrappedLines
      const adjustment = lineAdjustmentModel(
        slice,
        targetWidth,
        options,
        !ragged,
      )
      const model = adjustment.model
      const feasible = ragged
        ? (
            model.natural <= targetWidth + options.epsilon || slice.length === 1
          ) && lineCanSatisfyVisibleCorridors(
            model,
            model.natural,
            false,
            options.epsilon,
          )
        : model.min <= adjustment.solvingTarget + options.epsilon &&
          model.max >= adjustment.solvingTarget - options.epsilon &&
          lineCanSatisfyVisibleCorridors(
            model,
            adjustment.solvingTarget,
            true,
            options.epsilon,
          )
      const tail = best[end]
      if (!feasible || !tail) continue
      const line = materializeLine(
        slice,
        isLast ? terminalEnd : 'wrap',
        targetWidth,
        options,
      )
      if (!isLast && line.emergency) continue
      const solution = {
        cost: lineCost(model, adjustment.solvingTarget, ragged) + tail.cost,
        lines: [line, ...tail.lines],
      }
      const current = best[start]
      if (
        !current ||
        solution.cost < current.cost - 1e-9 ||
        (Math.abs(solution.cost - current.cost) <= 1e-9 &&
          solution.lines[0].atoms.length > current.lines[0].atoms.length)
      ) {
        best[start] = solution
      }
    }
  }

  if (best[0]) return best[0]!.lines

  // 极端损坏字体/超长硬不拆内容的恢复路径。普通内容不会走到这里；
  // 返回 emergency 让 UI/预检明确失败，而不是静默导出错误版式。
  const lines: DeterministicLayoutLine[] = []
  let start = 0
  while (start < atoms.length) {
    let end = start + 1
    while (end < atoms.length) {
      const candidate = atoms.slice(start, end + 1)
      const mustKeepTogether = !legalBreak(
        atoms[end - 1],
        atoms[end],
        groupWidths,
      )
      if (
        !mustKeepTogether &&
        widthModel(candidate, options).min > targetWidth
      ) {
        break
      }
      end += 1
    }
    const isLast = end >= atoms.length
    const line = materializeLine(
      atoms.slice(start, Math.min(end, atoms.length)),
      isLast ? terminalEnd : 'wrap',
      targetWidth,
      options,
    )
    line.emergency = true
    lines.push(line)
    start = Math.min(end, atoms.length)
  }
  return lines
}

/**
 * 纯行级求解器。输入只包含真实字形 advance 和语义分组；输出的每个
 * 非末行都给出确定的 token x/box/gap，浏览器不再参与 justify 决策。
 */
export function solveDeterministicTextLayout(
  inputAtoms: readonly LayoutAtomInput[],
  targetWidth: number,
  layoutOptions: DeterministicLayoutOptions = {},
): DeterministicLayoutLine[] {
  const options = resolveOptions(layoutOptions)
  const width = positive(targetWidth)
  const lines: DeterministicLayoutLine[] = []
  let segment: LayoutAtomInput[] = []

  const flush = (end: Exclude<LayoutLineEnd, 'wrap'>) => {
    lines.push(...solveSegment(segment, width, end, options))
    segment = []
  }
  for (const atom of inputAtoms) {
    segment.push(atom)
    if (atom.forcedBreakAfter) flush('explicit')
  }
  flush('paragraph')
  return lines
}

function stableNumber(value: number): number {
  return Math.round(value * 1_000) / 1_000
}

/** 小型稳定 hash，供预览 DOM 与导出 clone 核验是否使用同一快照。 */
export function deterministicLayoutSnapshotHash(
  lines: readonly DeterministicLayoutLine[],
): string {
  const payload = JSON.stringify(
    lines.map((line) => ({
      end: line.end,
      justified: line.justified,
      targetWidth: stableNumber(line.targetWidth),
      actualWidth: stableNumber(line.actualWidth),
      atoms: line.atoms.map((atom) => [
        atom.text,
        atom.kind,
        stableNumber(atom.x),
        stableNumber(atom.boxWidth),
        stableNumber(atom.glyphOffset),
        stableNumber(atom.gapAfter),
      ]),
    })),
  )
  let hash = 0x811c9dc5
  for (let index = 0; index < payload.length; index += 1) {
    hash ^= payload.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}
