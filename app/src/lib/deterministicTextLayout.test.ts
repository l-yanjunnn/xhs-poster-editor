import { describe, expect, it } from 'vitest'
import {
  deterministicLayoutSnapshotHash,
  solveDeterministicTextLayout,
  type DeterministicLayoutLine,
  type LayoutAtomInput,
  type LayoutAtomKind,
  type PositionedLayoutAtom,
} from './deterministicTextLayout'

const ADVANCE = 10
const EM = 10
const EPSILON = 0.01

// Chromium + Noto Sans SC 400 at 40px, normalized to the 10px synthetic em
// used in this suite. Canvas actualBoundingBoxLeft is signed: visible ink is
// [x + glyphOffset - inkLeft, x + glyphOffset + inkRight]. Keeping these real
// asymmetric outlines in the fixtures prevents a logically centred box from
// masquerading as visually balanced punctuation.
const NOTO_INK = {
  han: { inkLeft: -0.4, inkRight: 9.6 },
  colon: { inkLeft: -1.74, inkRight: 3.26 },
  enumerationComma: { inkLeft: -0.52, inkRight: 3.41 },
  comma: { inkLeft: -1.35, inkRight: 3.3 },
  fullStop: { inkLeft: -0.42, inkRight: 3.47 },
  semicolon: { inkLeft: -1.46, inkRight: 3.42 },
  question: { inkLeft: -0.33, inkRight: 4.61 },
  exclamation: { inkLeft: -1.86, inkRight: 3.14 },
  openQuote: { inkLeft: -6.24, inkRight: 9.63 },
  closeQuote: { inkLeft: -0.37, inkRight: 3.76 },
  openBookTitle: { inkLeft: -5.29, inkRight: 9.63 },
  closeBookTitle: { inkLeft: -0.36, inkRight: 4.7 },
  openParen: { inkLeft: -6.95, inkRight: 9.54 },
  closeParen: { inkLeft: -0.46, inkRight: 3.05 },
  middleDot: { inkLeft: -4.63, inkRight: 5.37 },
} as const

const TEXT_PUNCTUATION_GAP_MIN = EM * 0.14
const TEXT_PUNCTUATION_GAP_MAX = EM * 0.28
const BALANCED_GAP_MAX_DELTA = EM * 0.06
const ATTACHED_QUOTE_GAP_MIN = EM * 0.1
const ATTACHED_QUOTE_GAP_MAX = EM * 0.18
const OUTSIDE_QUOTE_GAP_MIN = EM * 0.14
const OUTSIDE_QUOTE_GAP_MAX = EM * 0.24
const PUNCTUATION_CLUSTER_GAP_MIN = EM * 0.08
const PUNCTUATION_CLUSTER_GAP_MAX = EM * 0.26
const QUOTE_INNER_GAP_MIN = EM * 0.14
const QUOTE_INNER_GAP_PREFERRED = EM * 0.18
const QUOTE_OUTER_GAP_PREFERRED_MIN = EM * 0.21
const QUOTE_OUTER_GAP_PREFERRED_MAX = EM * 0.22
const MIDDLE_CLUSTER_GAP_MAX = EM * 0.2

function atom(
  id: string,
  text: string,
  kind: LayoutAtomKind,
  patch: Partial<LayoutAtomInput> = {},
): LayoutAtomInput {
  return {
    id,
    text,
    kind,
    advance: ADVANCE,
    em: EM,
    ...patch,
  }
}

function hanAtoms(text: string, prefix = 'han'): LayoutAtomInput[] {
  return Array.from(text, (character, index) =>
    atom(`${prefix}-${index}`, character, 'han'),
  )
}

function opticalHanAtoms(
  text: string,
  prefix = 'optical-han',
): LayoutAtomInput[] {
  return Array.from(text, (character, index) =>
    atom(`${prefix}-${index}`, character, 'han', NOTO_INK.han),
  )
}

function wrappedLines(
  lines: readonly DeterministicLayoutLine[],
): DeterministicLayoutLine[] {
  return lines.filter((line) => line.end === 'wrap')
}

function adjustedGap(
  line: DeterministicLayoutLine,
  leftIndex: number,
): number {
  const left = line.atoms[leftIndex]
  return left.gapAfter - (left.letterSpacing ?? 0)
}

function visibleInkLeft(atom: PositionedLayoutAtom): number {
  return atom.x + atom.glyphOffset - (atom.inkLeft ?? 0)
}

function visibleInkRight(atom: PositionedLayoutAtom): number {
  return atom.x + atom.glyphOffset + (atom.inkRight ?? atom.advance)
}

function inkGap(
  line: DeterministicLayoutLine,
  leftIndex: number,
): number {
  return visibleInkLeft(line.atoms[leftIndex + 1]) -
    visibleInkRight(line.atoms[leftIndex])
}

function opticalSides(atom: PositionedLayoutAtom): {
  leading: number
  trailing: number
} {
  return {
    leading: atom.glyphOffset - (atom.inkLeft ?? 0),
    trailing:
      atom.boxWidth - atom.glyphOffset - (atom.inkRight ?? atom.advance),
  }
}

function expectInkInsideLogicalBox(atom: PositionedLayoutAtom): void {
  const sides = opticalSides(atom)
  expect(sides.leading).toBeGreaterThanOrEqual(-EPSILON)
  expect(sides.trailing).toBeGreaterThanOrEqual(-EPSILON)
}

function expectBalancedTextPunctuationGaps(
  line: DeterministicLayoutLine,
  punctuationIndex: number,
  maxDelta = BALANCED_GAP_MAX_DELTA,
): void {
  const leadingGap = inkGap(line, punctuationIndex - 1)
  const trailingGap = inkGap(line, punctuationIndex)

  expect(leadingGap).toBeGreaterThanOrEqual(TEXT_PUNCTUATION_GAP_MIN)
  expect(leadingGap).toBeLessThanOrEqual(TEXT_PUNCTUATION_GAP_MAX)
  expect(trailingGap).toBeGreaterThanOrEqual(TEXT_PUNCTUATION_GAP_MIN)
  expect(trailingGap).toBeLessThanOrEqual(TEXT_PUNCTUATION_GAP_MAX)
  expect(Math.abs(leadingGap - trailingGap)).toBeLessThanOrEqual(
    maxDelta,
  )
}

describe('deterministic text layout line solving', () => {
  it('fits every feasible non-terminal line to target within 0.01px', () => {
    const lines = solveDeterministicTextLayout(
      hanAtoms('天地玄黄宇宙洪荒日月盈'),
      42.4,
    )
    const wrapped = wrappedLines(lines)

    expect(wrapped.length).toBeGreaterThan(0)
    for (const line of wrapped) {
      expect(line.emergency).toBe(false)
      expect(Math.abs(line.residual)).toBeLessThanOrEqual(EPSILON)
      expect(Math.abs(line.targetWidth - line.actualWidth)).toBeLessThanOrEqual(
        EPSILON,
      )
    }
  })

  it('applies one globally uniform, capped adjustment to Han-Han gaps', () => {
    const lines = solveDeterministicTextLayout(
      hanAtoms('天地玄黄宇宙洪荒日月盈'),
      42.4,
    )
    const wrapped = wrappedLines(lines)
    const gaps = wrapped.flatMap((line) =>
      line.atoms.slice(0, -1).flatMap((left, index) => {
        const right = line.atoms[index + 1]
        return left.kind === 'han' && right.kind === 'han'
          ? [adjustedGap(line, index)]
          : []
      }),
    )

    expect(gaps.length).toBeGreaterThan(0)
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(1e-9)
    expect(Math.max(...gaps.map(Math.abs))).toBeLessThanOrEqual(EM * 0.08)
    for (const line of wrapped) {
      expect(line.maxHanGapDeviation).toBeLessThanOrEqual(1e-9)
    }
  })

  it('uniformly compresses Han-Han gaps no further than 0.02em', () => {
    const lines = solveDeterministicTextLayout(
      hanAtoms('天地玄黄宇宙洪荒日'),
      39.4,
    )
    const wrapped = wrappedLines(lines)
    const gaps = wrapped.flatMap((line) =>
      line.atoms.slice(0, -1).map((_left, index) =>
        adjustedGap(line, index),
      ),
    )

    expect(wrapped).toHaveLength(2)
    expect(wrapped.every((line) => !line.emergency)).toBe(true)
    expect(gaps.length).toBeGreaterThan(0)
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(1e-9)
    expect(Math.min(...gaps)).toBeCloseTo(-EM * 0.02, 9)
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(-EM * 0.02 - 1e-9)
    for (const line of wrapped) {
      expect(line.hanGapDelta).toBeCloseTo(-EM * 0.02, 9)
      expect(line.maxHanGapDeviation).toBeLessThanOrEqual(1e-9)
    }
  })

  it('keeps measured punctuation ink inside bilateral optical boxes and rejects a hostile target', () => {
    const source = [
      atom('open', '“', 'opening-punctuation', NOTO_INK.openQuote),
      atom('han', '中', 'han', NOTO_INK.han),
      atom('close', '”', 'closing-punctuation', NOTO_INK.closeQuote),
      atom('tail', '尾', 'han', NOTO_INK.han),
    ]
    const feasible = solveDeterministicTextLayout(source, 20)
    const feasibleLine = wrappedLines(feasible)[0]
    const feasiblePunctuation = feasibleLine.atoms.filter((item) =>
      item.kind.endsWith('punctuation'),
    )

    expect(feasibleLine.atoms.map((item) => item.text).join('')).toBe('“中”')
    expect(feasibleLine.emergency).toBe(false)
    expect(feasibleLine.actualWidth).toBeCloseTo(20, 9)
    expect(feasiblePunctuation).toHaveLength(2)
    for (const punctuation of feasiblePunctuation) {
      expect(punctuation.advance).toBe(ADVANCE)
      expectInkInsideLogicalBox(punctuation)
    }
    expect(inkGap(feasibleLine, 0)).toBeGreaterThanOrEqual(
      ATTACHED_QUOTE_GAP_MIN,
    )
    expect(inkGap(feasibleLine, 0)).toBeLessThanOrEqual(
      ATTACHED_QUOTE_GAP_MAX + EPSILON,
    )
    expect(inkGap(feasibleLine, 1)).toBeGreaterThanOrEqual(
      ATTACHED_QUOTE_GAP_MIN,
    )
    expect(inkGap(feasibleLine, 1)).toBeLessThanOrEqual(
      ATTACHED_QUOTE_GAP_MAX + EPSILON,
    )

    const hostile = solveDeterministicTextLayout(source, 17)
    const hostilePunctuation = hostile
      .flatMap((line) => line.atoms)
      .filter((item) => item.kind.endsWith('punctuation'))

    expect(hostile.some((line) => line.emergency)).toBe(true)
    for (const punctuation of hostilePunctuation) {
      expectInkInsideLogicalBox(punctuation)
    }
    expect(hostile.flatMap((line) => line.atoms).map((item) => item.text).join(''))
      .toBe('“中”尾')
    expect(source.map((item) => item.text).join('')).toBe('“中”尾')
  })

  it('keeps Noto double-quote preferred gaps bilateral without crowding quoted text', () => {
    const line = solveDeterministicTextLayout(
      [
        atom('quote-preferred-left', '甲', 'han', NOTO_INK.han),
        atom(
          'quote-preferred-open',
          '“',
          'opening-punctuation',
          NOTO_INK.openQuote,
        ),
        atom('quote-preferred-middle', '乙', 'han', NOTO_INK.han),
        atom(
          'quote-preferred-close',
          '”',
          'closing-punctuation',
          NOTO_INK.closeQuote,
        ),
        atom('quote-preferred-right', '丙', 'han', NOTO_INK.han),
      ],
      100,
      { justifyWrappedLines: false },
    )[0]
    const gaps = line.atoms.slice(0, -1).map((_atom, index) =>
      inkGap(line, index),
    )

    expect(line.atoms.map((item) => item.text).join('')).toBe('甲“乙”丙')
    expect(gaps[0]).toBeGreaterThanOrEqual(
      QUOTE_OUTER_GAP_PREFERRED_MIN - EPSILON,
    )
    expect(gaps[0]).toBeLessThanOrEqual(
      QUOTE_OUTER_GAP_PREFERRED_MAX + EPSILON,
    )
    expect(gaps[1]).toBeCloseTo(QUOTE_INNER_GAP_PREFERRED, 9)
    expect(gaps[2]).toBeCloseTo(QUOTE_INNER_GAP_PREFERRED, 9)
    expect(gaps[3]).toBeGreaterThanOrEqual(
      QUOTE_OUTER_GAP_PREFERRED_MIN - EPSILON,
    )
    expect(gaps[3]).toBeLessThanOrEqual(
      QUOTE_OUTER_GAP_PREFERRED_MAX + EPSILON,
    )
    expectInkInsideLogicalBox(line.atoms[1])
    expectInkInsideLogicalBox(line.atoms[3])
  })

  it('never compresses either Noto double-quote inner gap below 0.14em', () => {
    const lines = solveDeterministicTextLayout(
      [
        atom('quote-min-left', '甲', 'han', NOTO_INK.han),
        atom('quote-min-open', '“', 'opening-punctuation', NOTO_INK.openQuote),
        atom('quote-min-middle', '乙', 'han', NOTO_INK.han),
        atom('quote-min-close', '”', 'closing-punctuation', NOTO_INK.closeQuote),
        atom('quote-min-right', '丙', 'han', NOTO_INK.han),
        ...opticalHanAtoms('丁戊', 'quote-min-tail'),
      ],
      42.4,
    )
    const first = wrappedLines(lines)[0]

    expect(first.atoms.map((item) => item.text).join('')).toBe('甲“乙”丙')
    expect(first.emergency).toBe(false)
    expect(first.actualWidth).toBeCloseTo(first.targetWidth, 9)
    expect(inkGap(first, 1)).toBeGreaterThanOrEqual(
      QUOTE_INNER_GAP_MIN - EPSILON,
    )
    expect(inkGap(first, 2)).toBeGreaterThanOrEqual(
      QUOTE_INNER_GAP_MIN - EPSILON,
    )
  })

  it('keeps both text sides of a compressed enumeration comma in range', () => {
    const lines = solveDeterministicTextLayout(
      [
        atom('compressed-comma-left', '甲', 'han', NOTO_INK.han),
        atom(
          'compressed-comma',
          '、',
          'closing-punctuation',
          NOTO_INK.enumerationComma,
        ),
        atom('compressed-comma-digit', '2', 'digit', {
          advance: 5.55,
          inkLeft: -0.4,
          inkRight: 5.1,
        }),
        ...opticalHanAtoms('乙丙丁', 'compressed-comma-tail'),
      ],
      20.9,
    )
    const first = wrappedLines(lines)[0]
    const commaIndex = first.atoms.findIndex(
      (item) => item.id === 'compressed-comma',
    )

    expect(first.atoms.map((item) => item.text).join('')).toBe('甲、2')
    expect(first.emergency).toBe(false)
    expect(first.actualWidth).toBeCloseTo(first.targetWidth, 9)
    expect(inkGap(first, commaIndex - 1)).toBeGreaterThanOrEqual(
      EM * 0.15 - EPSILON,
    )
    expect(inkGap(first, commaIndex)).toBeGreaterThanOrEqual(
      EM * 0.16 - EPSILON,
    )
  })

  it.each([
    ['。', NOTO_INK.fullStop, TEXT_PUNCTUATION_GAP_MIN, TEXT_PUNCTUATION_GAP_MAX],
    ['”', NOTO_INK.closeQuote, QUOTE_INNER_GAP_MIN, EM * 0.24],
  ] as const)(
    'hangs a line-end %s by visible ink while preserving an appropriate incoming gap',
    (text, outline, incomingMin, incomingMax) => {
      const source = [
        ...opticalHanAtoms('甲乙丙', `line-end-${text}`),
        atom('punctuation', text, 'closing-punctuation', {
          ...outline,
        }),
        atom('collapsed-space', ' ', 'space', { advance: 4 }),
        atom('tail', '丁', 'han', NOTO_INK.han),
      ]
      const line = wrappedLines(solveDeterministicTextLayout(source, 35))[0]
      const punctuationIndex = line.atoms.findIndex(
        (item) => item.id === 'punctuation',
      )
      const punctuation = line.atoms[punctuationIndex]
      const trailingSpace = line.atoms.at(-1)!
      const incomingGap = inkGap(line, punctuationIndex - 1)

      expect(punctuation.text).toBe(text)
      expect(trailingSpace.kind).toBe('space')
      expect(trailingSpace.boxWidth).toBe(0)
      expect(incomingGap).toBeGreaterThanOrEqual(incomingMin)
      expect(incomingGap).toBeLessThanOrEqual(incomingMax + EPSILON)
      expect(line.actualWidth).toBeCloseTo(line.targetWidth, 9)
      expect(visibleInkRight(punctuation)).toBeCloseTo(line.targetWidth, 9)
      expect(punctuation.x + punctuation.boxWidth).toBeGreaterThan(
        line.targetWidth,
      )
    },
  )

  it('jointly solves a hanging punctuation cluster and its visible right edge', () => {
    const source = [
      ...opticalHanAtoms('甲乙丙', 'line-end-cluster'),
      atom('line-end-full-stop', '。', 'closing-punctuation', NOTO_INK.fullStop),
      atom('line-end-close-quote', '”', 'closing-punctuation', NOTO_INK.closeQuote),
      atom('line-end-cluster-tail', '丁', 'han', NOTO_INK.han),
    ]
    const line = wrappedLines(solveDeterministicTextLayout(source, 40))[0]
    const fullStopIndex = line.atoms.findIndex(
      (item) => item.id === 'line-end-full-stop',
    )
    const quoteIndex = line.atoms.findIndex(
      (item) => item.id === 'line-end-close-quote',
    )

    expect(line.emergency).toBe(false)
    expect(line.atoms.map((item) => item.text).join('')).toBe('甲乙丙。”')
    expect(inkGap(line, fullStopIndex)).toBeGreaterThanOrEqual(
      EM * 0.06 - EPSILON,
    )
    expect(inkGap(line, fullStopIndex)).toBeLessThanOrEqual(
      EM * 0.14 + EPSILON,
    )
    expect(inkGap(line, fullStopIndex - 1)).toBeGreaterThanOrEqual(
      EM * 0.15 - EPSILON,
    )
    expect(inkGap(line, fullStopIndex - 1)).toBeLessThanOrEqual(
      EM * 0.26 + EPSILON,
    )
    expect(visibleInkRight(line.atoms[quoteIndex])).toBeCloseTo(
      line.targetWidth,
      9,
    )
  })

  it('uses the allowed incoming corridor on an extremely tight hanging line', () => {
    const source = [
      ...opticalHanAtoms('甲乙丙', 'tight-line-end'),
      atom('tight-line-end-full-stop', '。', 'closing-punctuation', NOTO_INK.fullStop),
      atom('tight-line-end-tail', '丁', 'han', NOTO_INK.han),
    ]
    const line = wrappedLines(solveDeterministicTextLayout(source, 33.9))[0]
    const punctuationIndex = line.atoms.findIndex(
      (item) => item.id === 'tight-line-end-full-stop',
    )

    expect(line.emergency).toBe(false)
    expect(line.actualWidth).toBeCloseTo(line.targetWidth, 9)
    expect(inkGap(line, punctuationIndex - 1)).toBeGreaterThanOrEqual(
      EM * 0.15 - EPSILON,
    )
    expect(inkGap(line, punctuationIndex - 1)).toBeLessThanOrEqual(
      EM * 0.26 + EPSILON,
    )
  })

  it.each([
    ['：', NOTO_INK.colon, EM * 0.06],
    ['、', NOTO_INK.enumerationComma, EM * 0.06],
    ['，', NOTO_INK.comma, EM * 0.06],
    ['。', NOTO_INK.fullStop, EM * 0.08],
    ['；', NOTO_INK.semicolon, EM * 0.06],
  ] as const)(
    'balances both visible Han/text gaps around %s instead of preserving one native side',
    (text, outline, maxDelta) => {
      const source = [
        atom('lead', '甲', 'han', NOTO_INK.han),
        atom('punctuation', text, 'closing-punctuation', outline),
        atom('tail', '乙', 'han', NOTO_INK.han),
      ]
      const line = solveDeterministicTextLayout(source, 100, {
        justifyWrappedLines: false,
      })[0]
      const punctuation = line.atoms[1]

      expect(line.atoms.map((item) => item.text).join('')).toBe(
        `甲${text}乙`,
      )
      expectInkInsideLogicalBox(punctuation)
      expectBalancedTextPunctuationGaps(line, 1, maxDelta)
      if (text === '、') {
        // With the measured Noto outline, glyphOffset=0 yields a cramped
        // 0.092em incoming gap. A real bilateral solution must move the ink.
        expect(punctuation.glyphOffset).toBeGreaterThan(0.5)
      }
    },
  )

  it('keeps several ragged-line separators bilateral and never clips the paragraph closer', () => {
    const source = [
      atom('han-0', '甲', 'han', NOTO_INK.han),
      atom('colon', '：', 'closing-punctuation', NOTO_INK.colon),
      atom('han-1', '乙', 'han', NOTO_INK.han),
      atom('comma', '、', 'closing-punctuation', NOTO_INK.enumerationComma),
      atom('han-2', '丙', 'han', NOTO_INK.han),
      atom('stop', '。', 'closing-punctuation', NOTO_INK.fullStop),
    ]
    const line = solveDeterministicTextLayout(source, 100)[0]
    const colon = line.atoms.find((item) => item.id === 'colon')!
    const comma = line.atoms.find((item) => item.id === 'comma')!
    const stop = line.atoms.find((item) => item.id === 'stop')!

    expect(line.end).toBe('paragraph')
    expect(line.justified).toBe(false)
    expectBalancedTextPunctuationGaps(line, line.atoms.indexOf(colon))
    expectBalancedTextPunctuationGaps(line, line.atoms.indexOf(comma))
    expectInkInsideLogicalBox(stop)
    expect(line.emergency).toBe(false)
  })

  it('does not assume optical ragged width grows monotonically', () => {
    const lines = solveDeterministicTextLayout(
      [
        atom('han-0', '甲', 'han', NOTO_INK.han),
        atom('colon', '：', 'closing-punctuation', NOTO_INK.colon),
        atom('latin', 'i', 'latin', { advance: 2 }),
        atom('han-1', '乙', 'han', NOTO_INK.han),
      ],
      18,
      { justifyWrappedLines: false },
    )

    expect(lines.some((line) => line.emergency)).toBe(false)
    expect(lines[0].atoms.map((item) => item.text).join('')).toBe('甲：i')
    expect(lines[0].actualWidth).toBeLessThanOrEqual(18)
    expectInkInsideLogicalBox(lines[0].atoms[1])
  })

  it('keeps an expanded justified colon bilateral when it absorbs positive residual', () => {
    const source = [
      atom('han-0', '甲', 'han', NOTO_INK.han),
      atom('colon', '：', 'closing-punctuation', NOTO_INK.colon),
      ...opticalHanAtoms('乙丙丁', 'balanced-capacity'),
    ]
    const first = wrappedLines(solveDeterministicTextLayout(source, 26))[0]
    const colon = first.atoms.find((item) => item.id === 'colon')!

    expect(first.emergency).toBe(false)
    expect(first.actualWidth).toBeCloseTo(26, 9)
    expect(first.atoms.map((item) => item.text).join('')).toBe('甲：乙')
    expectInkInsideLogicalBox(colon)
    const colonIndex = first.atoms.indexOf(colon)
    expect(inkGap(first, colonIndex - 1)).toBeGreaterThanOrEqual(EM * 0.18)
    expect(inkGap(first, colonIndex - 1)).toBeLessThanOrEqual(EM * 0.32)
    expect(inkGap(first, colonIndex)).toBeGreaterThanOrEqual(EM * 0.18)
    expect(inkGap(first, colonIndex)).toBeLessThanOrEqual(EM * 0.32)
    expect(Math.abs(
      inkGap(first, colonIndex - 1) - inkGap(first, colonIndex),
    )).toBeLessThanOrEqual(EPSILON)
  })

  it('expands ordinary punctuation before touching uniform Han gaps', () => {
    const source = [
      atom('open', '《', 'opening-punctuation', {
        inkLeft: 0,
        inkRight: 4,
      }),
      ...hanAtoms('甲乙丙丁', 'ordinary-punctuation'),
    ]
    const first = wrappedLines(solveDeterministicTextLayout(source, 38))[0]
    const opening = first.atoms[0]

    expect(first.emergency).toBe(false)
    expect(first.actualWidth).toBeCloseTo(38, 9)
    expect(opening.text).toBe('《')
    expectInkInsideLogicalBox(opening)
    expect(first.atoms.slice(1, -1).every((item) => item.gapAfter === 0)).toBe(
      true,
    )
  })

  it('never hides middle-punctuation overflow behind a smaller logical box', () => {
    const source = [
      atom('lead', '甲', 'han'),
      atom('dash', '—', 'middle-punctuation', {
        inkLeft: 0,
        inkRight: 10,
      }),
      atom('tail', '乙', 'han'),
    ]
    const lines = solveDeterministicTextLayout(source, 15)
    const dash = lines.flatMap((line) => line.atoms).find(
      (item) => item.id === 'dash',
    )!
    const dashLine = lines.find((line) =>
      line.atoms.some((item) => item.id === 'dash'),
    )!
    const visibleInkRight = dash.x + dash.glyphOffset + dash.inkRight!

    expect(lines.some((line) => line.emergency)).toBe(true)
    expect(dash.boxWidth).toBeGreaterThanOrEqual(10)
    // 极端宽度同时违反禁则（破折号不可置于行首）与实际墨迹宽度，
    // 数学上无解。此时宁可把真实越界写进 actualWidth 并让预检阻断，
    // 也不能用 5px box 伪报 residual=0 后让 10px 墨迹静默覆盖正文。
    expect(visibleInkRight).toBeLessThanOrEqual(dashLine.actualWidth + EPSILON)
    expect(dashLine.actualWidth).toBeGreaterThan(dashLine.targetWidth)
  })

  it.each([
    ['《', 'opening-punctuation'],
    ['—', 'middle-punctuation'],
  ] as const)(
    'keeps a positive-left-bearing %s ink span out of adjacent glyphs',
    (text, kind) => {
      const lines = solveDeterministicTextLayout(
        [
          atom('lead', '甲', 'han'),
          atom('punctuation', text, kind, {
            inkLeft: 2,
            inkRight: 4,
          }),
          atom('tail-0', '乙', 'han'),
          atom('tail-1', '丙', 'han'),
        ],
        26,
      )
      const punctuation = lines.flatMap((line) => line.atoms).find(
        (item) => item.id === 'punctuation',
      )!
      const line = lines.find((item) => item.atoms.includes(punctuation))!
      const index = line.atoms.indexOf(punctuation)
      const previous = line.atoms[index - 1]
      const following = line.atoms[index + 1]
      const visibleLeft = punctuation.x + punctuation.glyphOffset - 2
      const visibleRight = punctuation.x + punctuation.glyphOffset + 4

      expect(punctuation.boxWidth).toBeGreaterThanOrEqual(6)
      if (previous) {
        expect(visibleLeft).toBeGreaterThanOrEqual(
          previous.x + previous.boxWidth - EPSILON,
        )
      }
      if (following) {
        expect(visibleRight).toBeLessThanOrEqual(following.x + EPSILON)
      }
    },
  )

  it('uses the signed Canvas ink span for a real negative-left opening mark', () => {
    const lines = solveDeterministicTextLayout(
      [
        atom('open', '《', 'opening-punctuation', {
          inkLeft: -5.29,
          inkRight: 9.63,
        }),
        ...opticalHanAtoms('甲乙丙', 'negative-left-opening'),
      ],
      26,
      { justifyWrappedLines: false },
    )
    const opening = wrappedLines(lines)[0].atoms[0]

    expect(opening.text).toBe('《')
    expect(opening.x).toBe(0)
    expectInkInsideLogicalBox(opening)
    expect(visibleInkLeft(opening)).toBeGreaterThanOrEqual(0)
    expect(visibleInkRight(opening)).toBeLessThanOrEqual(
      opening.x + opening.boxWidth + EPSILON,
    )
    expect(inkGap(wrappedLines(lines)[0], 0)).toBeGreaterThanOrEqual(
      ATTACHED_QUOTE_GAP_MIN,
    )
    expect(inkGap(wrappedLines(lines)[0], 0)).toBeLessThanOrEqual(
      ATTACHED_QUOTE_GAP_MAX + EPSILON,
    )
  })

  it('keeps a wrapped line-start opening quote inside the margin and attached to its Han text', () => {
    const lines = solveDeterministicTextLayout(
      [
        ...opticalHanAtoms('甲乙丙丁', 'opening-line-one'),
        atom('open', '“', 'opening-punctuation', NOTO_INK.openQuote),
        ...opticalHanAtoms('戊己庚', 'opening-line-two'),
      ],
      40,
      { justifyWrappedLines: false },
    )
    const second = lines[1]
    const opening = second.atoms[0]
    const outsideClearance = visibleInkLeft(opening) - opening.x

    expect(lines[0].atoms.map((item) => item.text).join('')).toBe('甲乙丙丁')
    expect(opening.text).toBe('“')
    expect(opening.x).toBe(0)
    expectInkInsideLogicalBox(opening)
    expect(outsideClearance).toBeGreaterThanOrEqual(EM * 0.05)
    expect(outsideClearance).toBeLessThanOrEqual(EM * 0.12)
    expect(inkGap(second, 0)).toBeGreaterThanOrEqual(
      ATTACHED_QUOTE_GAP_MIN,
    )
    expect(inkGap(second, 0)).toBeLessThanOrEqual(
      ATTACHED_QUOTE_GAP_MAX + EPSILON,
    )
    expect(lines.every((line) => !line.emergency)).toBe(true)
  })

  it('attaches a closing quote to preceding Han while preserving outside clearance', () => {
    const line = solveDeterministicTextLayout(
      [
        atom('lead', '甲', 'han', NOTO_INK.han),
        atom('close', '”', 'closing-punctuation', NOTO_INK.closeQuote),
        atom('tail-0', '乙', 'han', NOTO_INK.han),
        atom('tail-1', '丙', 'han', NOTO_INK.han),
      ],
      100,
      { justifyWrappedLines: false },
    )[0]
    const closing = line.atoms[1]

    expectInkInsideLogicalBox(closing)
    expect(inkGap(line, 0)).toBeGreaterThanOrEqual(ATTACHED_QUOTE_GAP_MIN)
    expect(inkGap(line, 0)).toBeLessThanOrEqual(
      ATTACHED_QUOTE_GAP_MAX + EPSILON,
    )
    expect(inkGap(line, 1)).toBeGreaterThanOrEqual(OUTSIDE_QUOTE_GAP_MIN)
    expect(inkGap(line, 1)).toBeLessThanOrEqual(
      OUTSIDE_QUOTE_GAP_MAX + EPSILON,
    )
  })

  it.each([
    [
      '”，',
      ['”', 'closing-punctuation', NOTO_INK.closeQuote],
      ['，', 'closing-punctuation', NOTO_INK.comma],
    ],
    [
      '。”',
      ['。', 'closing-punctuation', NOTO_INK.fullStop],
      ['”', 'closing-punctuation', NOTO_INK.closeQuote],
    ],
    [
      '：“',
      ['：', 'closing-punctuation', NOTO_INK.colon],
      ['“', 'opening-punctuation', NOTO_INK.openQuote],
    ],
    [
      '”“',
      ['”', 'closing-punctuation', NOTO_INK.closeQuote],
      ['“', 'opening-punctuation', NOTO_INK.openQuote],
    ],
    [
      '”）',
      ['”', 'closing-punctuation', NOTO_INK.closeQuote],
      ['）', 'closing-punctuation', NOTO_INK.closeParen],
    ],
    [
      '？！',
      ['？', 'closing-punctuation', NOTO_INK.question],
      ['！', 'closing-punctuation', NOTO_INK.exclamation],
    ],
  ] as const)(
    'shares optical clearance inside punctuation cluster %s instead of stacking both side-bearings',
    (_label, leftSpec, rightSpec) => {
      const [leftText, leftKind, leftInk] = leftSpec
      const [rightText, rightKind, rightInk] = rightSpec
      const line = solveDeterministicTextLayout(
        [
          atom('lead', '甲', 'han', NOTO_INK.han),
          atom('cluster-left', leftText, leftKind, leftInk),
          atom('cluster-right', rightText, rightKind, rightInk),
          atom('tail', '乙', 'han', NOTO_INK.han),
        ],
        100,
        { justifyWrappedLines: false },
      )[0]
      const left = line.atoms[1]
      const right = line.atoms[2]
      const clusterGap = inkGap(line, 1)
      const standaloneLeft = solveDeterministicTextLayout(
        [
          atom('standalone-left-lead', '甲', 'han', NOTO_INK.han),
          atom('standalone-left', leftText, leftKind, leftInk),
          atom('standalone-left-tail', '乙', 'han', NOTO_INK.han),
        ],
        100,
        { justifyWrappedLines: false },
      )[0].atoms[1]
      const standaloneRight = solveDeterministicTextLayout(
        [
          atom('standalone-right-lead', '甲', 'han', NOTO_INK.han),
          atom('standalone-right', rightText, rightKind, rightInk),
          atom('standalone-right-tail', '乙', 'han', NOTO_INK.han),
        ],
        100,
        { justifyWrappedLines: false },
      )[0].atoms[1]
      const unsharedClearance =
        opticalSides(standaloneLeft).trailing +
        opticalSides(standaloneRight).leading

      expect(line.emergency).toBe(false)
      expectInkInsideLogicalBox(left)
      expectInkInsideLogicalBox(right)
      expect(clusterGap).toBeGreaterThanOrEqual(PUNCTUATION_CLUSTER_GAP_MIN)
      expect(clusterGap).toBeLessThanOrEqual(PUNCTUATION_CLUSTER_GAP_MAX)
      expect(clusterGap).toBeLessThanOrEqual(unsharedClearance - 0.2)
    },
  )

  it.each([
    ['two', '··'],
    ['three', '···'],
    ['four', '····'],
  ] as const)(
    'keeps every boundary in a ragged %s-mark Noto punctuation cluster within max',
    (_label, punctuation) => {
      const line = solveDeterministicTextLayout(
        [
          atom('ragged-cluster-lead', '甲', 'han', NOTO_INK.han),
          ...Array.from(punctuation, (text, index) =>
            atom(
              `ragged-cluster-${index}`,
              text,
              'middle-punctuation',
              NOTO_INK.middleDot,
            ),
          ),
          atom('ragged-cluster-tail', '乙', 'han', NOTO_INK.han),
        ],
        100,
        { justifyWrappedLines: false },
      )[0]

      expect(line.emergency).toBe(false)
      for (let index = 1; index < line.atoms.length - 2; index += 1) {
        expect(inkGap(line, index)).toBeGreaterThanOrEqual(
          PUNCTUATION_CLUSTER_GAP_MIN - EPSILON,
        )
        expect(inkGap(line, index)).toBeLessThanOrEqual(
          MIDDLE_CLUSTER_GAP_MAX + EPSILON,
        )
        expectInkInsideLogicalBox(line.atoms[index])
        expectInkInsideLogicalBox(line.atoms[index + 1])
      }
    },
  )

  it('keeps mixed two/three/four-mark ragged clusters within every character profile', () => {
    const specifications = [
      ['：“', [NOTO_INK.colon, NOTO_INK.openQuote]],
      ['。”，', [NOTO_INK.fullStop, NOTO_INK.closeQuote, NOTO_INK.comma]],
      ['”“”“', [
        NOTO_INK.closeQuote,
        NOTO_INK.openQuote,
        NOTO_INK.closeQuote,
        NOTO_INK.openQuote,
      ]],
    ] as const
    for (const [punctuation, outlines] of specifications) {
      const line = solveDeterministicTextLayout(
        [
          atom(`mixed-${punctuation}-lead`, '甲', 'han', NOTO_INK.han),
          ...Array.from(punctuation, (text, index) =>
            atom(
              `mixed-${punctuation}-${index}`,
              text,
              text === '“' ? 'opening-punctuation' : 'closing-punctuation',
              outlines[index],
            ),
          ),
          atom(`mixed-${punctuation}-tail`, '乙', 'han', NOTO_INK.han),
        ],
        100,
        { justifyWrappedLines: false },
      )[0]

      expect(line.emergency).toBe(false)
      for (let index = 1; index < line.atoms.length - 2; index += 1) {
        const left = line.atoms[index]
        const right = line.atoms[index + 1]
        const max = left.kind === 'closing-punctuation' &&
            right.kind === 'opening-punctuation'
          ? EM * 0.16
          : EM * 0.14
        expect(inkGap(line, index)).toBeGreaterThanOrEqual(EM * 0.06 - EPSILON)
        expect(inkGap(line, index)).toBeLessThanOrEqual(max + EPSILON)
      }
    }
  })

  it('keeps a colon-opening-quote cluster compact on a justified wrap', () => {
    const first = wrappedLines(
      solveDeterministicTextLayout(
        [
          ...opticalHanAtoms('甲乙丙丁', 'justified-pair-lead'),
          atom('colon', '：', 'closing-punctuation', NOTO_INK.colon),
          atom('open', '“', 'opening-punctuation', NOTO_INK.openQuote),
          ...opticalHanAtoms('戊己庚辛壬', 'justified-pair-tail'),
        ],
        70,
      ),
    )[0]
    const colon = first.atoms.find((item) => item.id === 'colon')!
    const opening = first.atoms.find((item) => item.id === 'open')!

    expect(first.emergency).toBe(false)
    expect(first.actualWidth).toBeCloseTo(first.targetWidth, 9)
    expect(first.atoms.map((item) => item.text).join('')).toContain('：“')
    expectInkInsideLogicalBox(colon)
    expectInkInsideLogicalBox(opening)
    const clusterGap = inkGap(first, first.atoms.indexOf(colon))
    expect(clusterGap).toBeGreaterThanOrEqual(PUNCTUATION_CLUSTER_GAP_MIN)
    expect(clusterGap).toBeLessThanOrEqual(PUNCTUATION_CLUSTER_GAP_MAX)
  })

  it('uses Han-number/Latin boundaries before touching Han-Han gaps', () => {
    const source = [
      atom('han-0', '甲', 'han'),
      atom('digit-0', '1', 'digit', { breakGroup: 'number' }),
      atom('han-1', '乙', 'han'),
      atom('han-2', '丙', 'han'),
      atom('tail', '丁', 'han'),
    ]
    const boundaryOnly = wrappedLines(
      solveDeterministicTextLayout(source, 44),
    )[0]
    const afterBoundariesFill = wrappedLines(
      solveDeterministicTextLayout(source, 45.4),
    )[0]

    expect(boundaryOnly.atoms.map((item) => item.text).join('')).toBe(
      '甲1乙丙',
    )
    expect(adjustedGap(boundaryOnly, 0)).toBeCloseTo(2, 9)
    expect(adjustedGap(boundaryOnly, 1)).toBeCloseTo(2, 9)
    expect(adjustedGap(boundaryOnly, 2)).toBeCloseTo(0, 9)

    expect(adjustedGap(afterBoundariesFill, 0)).toBeCloseTo(2.5, 9)
    expect(adjustedGap(afterBoundariesFill, 1)).toBeCloseTo(2.5, 9)
    expect(adjustedGap(afterBoundariesFill, 2)).toBeCloseTo(0.4, 9)
  })

  it('reassigns corridor rollback through mixed boundaries before uniform Han gaps', () => {
    const group = 'corridor-residual-order'
    const candidate = [
      atom('corridor-han-0', '甲', 'han', NOTO_INK.han),
      atom('corridor-colon', '：', 'closing-punctuation', NOTO_INK.colon),
      atom(
        'corridor-middle-dot',
        '·',
        'middle-punctuation',
        NOTO_INK.middleDot,
      ),
      atom('corridor-han-1', '乙', 'han', NOTO_INK.han),
      atom('corridor-number', '1', 'digit', {
        advance: 5.55,
        inkLeft: -0.1,
        inkRight: 5.3,
      }),
      atom('corridor-han-2', '丙', 'han', NOTO_INK.han),
      atom('corridor-han-3', '丁', 'han', NOTO_INK.han),
    ].map((item) => ({
      ...item,
      breakGroup: group,
      hardNoBreak: true,
    }))
    const lines = solveDeterministicTextLayout(
      [
        ...candidate,
        ...opticalHanAtoms('戊己', 'corridor-tail'),
      ],
      60.9,
    )
    const first = wrappedLines(lines)[0]

    expect(first.atoms.map((item) => item.text).join('')).toBe('甲：·乙1丙丁')
    expect(first.emergency).toBe(false)
    expect(first.actualWidth).toBeCloseTo(first.targetWidth, 9)
    expect(Math.abs(first.residual)).toBeLessThanOrEqual(EPSILON)
    // Stage 2 must be exhausted before a released residual reaches stage 3.
    expect(adjustedGap(first, 3)).toBeCloseTo(EM * 0.25, 9)
    expect(adjustedGap(first, 4)).toBeCloseTo(EM * 0.25, 9)
    expect(adjustedGap(first, 5)).toBeGreaterThan(EM * 0.02)
    expect(inkGap(first, 1)).toBeLessThanOrEqual(
      MIDDLE_CLUSTER_GAP_MAX + EPSILON,
    )
  })

  it('marks residual emergency instead of stretching an arbitrary character boundary', () => {
    const lines = solveDeterministicTextLayout(
      [
        atom('other-a', 'A', 'other'),
        atom('other-b', 'B', 'other'),
        atom('other-tail', 'C', 'other'),
      ],
      20.4,
      { otherGapMaxEm: 0.1 },
    )
    const first = lines[0]

    expect(first.atoms.map((item) => item.text).join('')).toBe('AB')
    expect(first.atoms[0].gapAfter).toBe(0)
    expect(first.actualWidth).toBe(20)
    expect(first.residual).toBeCloseTo(0.4, 9)
    expect(first.emergency).toBe(true)
  })

  it('never splits fitting numeric or Latin break groups', () => {
    const source = [
      atom('han-0', '甲', 'han'),
      ...Array.from('1234', (text, index) =>
        atom(`number-${index}`, text, 'digit', {
          breakGroup: 'number',
          letterSpacing: 0.6,
        }),
      ),
      atom('han-1', '乙', 'han'),
      ...Array.from('ABCD', (text, index) =>
        atom(`latin-${index}`, text, 'latin', {
          breakGroup: 'latin',
          letterSpacing: 0.6,
        }),
      ),
      atom('han-2', '丙', 'han'),
    ]
    const lines = solveDeterministicTextLayout(source, 52)

    for (const group of ['number', 'latin']) {
      const containingLines = lines.flatMap((line, lineIndex) =>
        line.atoms.some((item) => item.breakGroup === group)
          ? [lineIndex]
          : [],
      )
      expect(containingLines).toHaveLength(1)
      const groupAtoms = lines[containingLines[0]].atoms.filter(
        (item) => item.breakGroup === group,
      )
      for (const [index, item] of groupAtoms.entries()) {
        expect(item.boxWidth).toBe(item.advance)
        if (index < groupAtoms.length - 1) {
          expect(item.gapAfter).toBe(item.letterSpacing)
        }
      }
    }
    expect(
      lines
        .flatMap((line) => line.atoms)
        .filter((item) => item.breakGroup === 'number')
        .map((item) => item.text)
        .join(''),
    ).toBe('1234')
    expect(
      lines
        .flatMap((line) => line.atoms)
        .filter((item) => item.breakGroup === 'latin')
        .map((item) => item.text)
        .join(''),
    ).toBe('ABCD')
  })

  it.each(['100%', 'A/B', '2026-08'])(
    'keeps a fitting soft token with connector/suffix intact: %s',
    (text) => {
      const group = `soft-${text}`
      const token = Array.from(text, (character, index) =>
        atom(
          `${group}-${index}`,
          character,
          /^\d$/u.test(character)
            ? 'digit'
            : /^\p{Script=Latin}$/u.test(character)
              ? 'latin'
              : 'other',
          { breakGroup: group },
        ),
      )
      const targetWidth = token.length * ADVANCE
      const lines = solveDeterministicTextLayout(
        [atom(`${group}-lead`, '甲', 'han'), ...token],
        targetWidth,
        { justifyWrappedLines: false },
      )
      const tokenLineIndexes = lines.flatMap((line, lineIndex) =>
        line.atoms.some((item) => item.breakGroup === group)
          ? [lineIndex]
          : [],
      )

      expect(tokenLineIndexes).toHaveLength(1)
      expect(
        lines[tokenLineIndexes[0]].atoms
          .filter((item) => item.breakGroup === group)
          .map((item) => item.text)
          .join(''),
      ).toBe(text)
    },
  )

  it('allows an over-wide soft token to split without losing text', () => {
    const group = 'soft-over-wide'
    const source = Array.from('2026-08', (character, index) =>
      atom(
        `${group}-${index}`,
        character,
        /^\d$/u.test(character) ? 'digit' : 'other',
        { breakGroup: group },
      ),
    )
    const lines = solveDeterministicTextLayout(source, 30, {
      justifyWrappedLines: false,
    })

    expect(lines.length).toBeGreaterThan(1)
    expect(lines.every((line) => !line.emergency)).toBe(true)
    expect(lines.flatMap((line) => line.atoms).map((item) => item.text).join(''))
      .toBe('2026-08')
  })

  it('keeps feasible opening/closing/middle punctuation on legal line sides', () => {
    const punctuationKinds: Partial<Record<string, LayoutAtomKind>> = {
      '《': 'opening-punctuation',
      '》': 'closing-punctuation',
      '，': 'closing-punctuation',
      '。': 'closing-punctuation',
      '·': 'middle-punctuation',
    }
    const punctuationInk: Partial<
      Record<string, { inkLeft: number; inkRight: number }>
    > = {
      '《': NOTO_INK.openBookTitle,
      '》': NOTO_INK.closeBookTitle,
      '，': NOTO_INK.comma,
      '。': NOTO_INK.fullStop,
      '·': NOTO_INK.middleDot,
    }
    const source = Array.from('甲乙《丙丁》戊己，庚辛·壬癸。子丑', (text, index) =>
      atom(
        `kinsoku-${index}`,
        text,
        punctuationKinds[text] ?? 'han',
        punctuationInk[text] ?? NOTO_INK.han,
      ),
    )
    const lines = solveDeterministicTextLayout(source, 40, {
      justifyWrappedLines: false,
    })

    expect(lines.length).toBeGreaterThan(1)
    expect(lines.every((line) => !line.emergency)).toBe(true)
    expect(lines.some((line) =>
      line.atoms.some((item) => item.kind === 'opening-punctuation')))
      .toBe(true)
    expect(lines.slice(0, -1).every((line) =>
      line.atoms.at(-1)?.kind !== 'opening-punctuation'))
      .toBe(true)
    expect(lines.slice(1).every((line) => {
      const firstKind = line.atoms[0]?.kind
      return firstKind !== 'closing-punctuation' &&
        firstKind !== 'middle-punctuation'
    })).toBe(true)
  })

  it('keeps a fitting hardNoBreak phrase on one line', () => {
    const phrase = Array.from('不拆词', (text, index) =>
      atom(`phrase-${index}`, text, 'han', {
        breakGroup: 'phrase',
        hardNoBreak: true,
      }),
    )
    const lines = solveDeterministicTextLayout(
      [atom('lead', '甲', 'han'), ...phrase, atom('tail', '乙', 'han')],
      40,
    )
    const phraseLineIndexes = lines.flatMap((line, lineIndex) =>
      line.atoms.some((item) => item.breakGroup === 'phrase')
        ? [lineIndex]
        : [],
    )

    expect(phraseLineIndexes).toHaveLength(1)
    expect(
      lines[phraseLineIndexes[0]].atoms
        .filter((item) => item.breakGroup === 'phrase')
        .map((item) => item.text)
        .join(''),
    ).toBe('不拆词')
  })

  it('accepts a paragraph tail whose closing punctuation ink fits, even with a hardNoBreak tail phrase', () => {
    // 2026-08-12 真实草稿回归：「…言不明的道理。」在「道理」hard
    // no-break 时被误判 unsatisfied-line。末行的句号逻辑 box 略超版
    // 心，但可见墨迹仍在版心内，必须按可见右缘放行且不拆短语。
    const buildSentence = (hardNoBreak: boolean): LayoutAtomInput[] => {
      const head = opticalHanAtoms('这里面存在着许多看似道不清言不明的', 'tail-han')
      const phrase = Array.from('道理', (text, index) =>
        atom(`tail-phrase-${index}`, text, 'han', {
          ...NOTO_INK.han,
          ...(hardNoBreak
            ? { breakGroup: 'tail-phrase', hardNoBreak: true }
            : {}),
        }),
      )
      return [
        ...head,
        ...phrase,
        atom('tail-stop', '。', 'closing-punctuation', NOTO_INK.fullStop),
      ]
    }

    const probe = solveDeterministicTextLayout(buildSentence(true), 100000)
    expect(probe).toHaveLength(1)
    const logicalWidth = probe[0].naturalWidth
    const visibleWidth = visibleInkRight(probe[0].atoms.at(-1)!)
    expect(visibleWidth).toBeLessThan(logicalWidth)

    // 版心宽度落在「可见墨迹放得下、完整逻辑 box 放不下」的区间。
    const targetWidth = (logicalWidth + visibleWidth) / 2
    const lines = solveDeterministicTextLayout(
      buildSentence(true),
      targetWidth,
    )

    expect(lines).toHaveLength(1)
    const tail = lines[0]
    expect(tail.end).toBe('paragraph')
    expect(tail.justified).toBe(false)
    expect(tail.emergency).toBe(false)
    expect(
      tail.atoms
        .filter((item) => item.breakGroup === 'tail-phrase')
        .map((item) => item.text)
        .join(''),
    ).toBe('道理')
    expect(visibleInkRight(tail.atoms.at(-1)!)).toBeLessThanOrEqual(
      targetWidth + EPSILON,
    )
    expect(tail.actualWidth).toBeLessThanOrEqual(targetWidth + EPSILON)
    expect(tail.actualWidth).toBeLessThan(tail.naturalWidth)

    // 不加 hard no-break 时同一版心也必须整段放行，不再拆「道理」。
    const withoutMark = solveDeterministicTextLayout(
      buildSentence(false),
      targetWidth,
    )
    expect(withoutMark).toHaveLength(1)
    expect(withoutMark[0].emergency).toBe(false)
  })

  it('does not justify the line before an explicit break or the paragraph tail', () => {
    const lines = solveDeterministicTextLayout(
      [
        atom('explicit-0', '甲', 'han'),
        atom('explicit-1', '乙', 'han', { forcedBreakAfter: true }),
        atom('tail-0', '丙', 'han'),
        atom('tail-1', '丁', 'han'),
      ],
      50,
    )

    expect(lines.map((line) => line.end)).toEqual(['explicit', 'paragraph'])
    for (const line of lines) {
      expect(line.justified).toBe(false)
      expect(line.actualWidth).toBe(line.naturalWidth)
      expect(line.actualWidth).toBe(20)
      expect(line.atoms[0].gapAfter).toBe(0)
    }
  })

  it('keeps collapsed edge spaces in Unicode while removing them from soft-wrap width', () => {
    const collapsedSpace = (id: string) =>
      atom(id, ' ', 'space', { advance: 4, letterSpacing: 0.3 })
    const source = [
      collapsedSpace('space-leading'),
      atom('space-han-0', '甲', 'han'),
      atom('space-han-1', '乙', 'han'),
      collapsedSpace('space-wrap-0'),
      atom('space-han-2', '丙', 'han'),
      atom('space-han-3', '丁', 'han'),
      collapsedSpace('space-wrap-1'),
      atom('space-han-4', '戊', 'han'),
      atom('space-han-5', '己', 'han'),
    ]
    const lines = solveDeterministicTextLayout(source, 20.4)
    const wrapped = wrappedLines(lines)

    expect(wrapped).toHaveLength(2)
    expect(wrapped.every((line) => !line.emergency)).toBe(true)
    for (const line of wrapped) {
      expect(line.actualWidth).toBeCloseTo(20.4, 9)
      const lastVisible = line.atoms.findLast((item) => item.boxWidth > 0)!
      expect(lastVisible.x + lastVisible.boxWidth + lastVisible.gapAfter)
        .toBeCloseTo(20.4, 9)
      for (const edge of [line.atoms[0], line.atoms.at(-1)!]) {
        if (edge.kind !== 'space') continue
        expect(edge.advance).toBe(4)
        expect(edge.boxWidth).toBe(0)
        expect(edge.gapAfter).toBe(0)
      }
    }
    expect(lines.flatMap((line) => line.atoms).map((item) => item.text).join(''))
      .toBe(source.map((item) => item.text).join(''))
  })

  it('keeps NBSP advance and prohibits breaks on both sides', () => {
    const nbsp = atom('nbsp', '\u00a0', 'space', { advance: 5 })
    const glued = [
      atom('nbsp-left', '甲', 'han'),
      nbsp,
      atom('nbsp-right', '乙', 'han'),
    ]
    const fitting = solveDeterministicTextLayout(
      [atom('nbsp-lead', '前', 'han'), ...glued],
      25,
      { justifyWrappedLines: false },
    )
    const gluedLineIndexes = new Set(
      fitting.flatMap((line, lineIndex) =>
        line.atoms.some(
          (item) =>
            item.id.startsWith('nbsp-') && item.id !== 'nbsp-lead',
        )
          ? [lineIndex]
          : [],
      ),
    )
    const fittingNbsp = fitting
      .flatMap((line) => line.atoms)
      .find((item) => item.id === 'nbsp')!

    expect(gluedLineIndexes.size).toBe(1)
    expect(fittingNbsp.advance).toBe(5)
    expect(fittingNbsp.boxWidth).toBe(5)

    const overWide = solveDeterministicTextLayout(glued, 20, {
      justifyWrappedLines: false,
    })
    expect(overWide).toHaveLength(1)
    expect(overWide[0].atoms.map((item) => item.text).join('')).toBe(
      '甲\u00a0乙',
    )
    expect(overWide[0].actualWidth).toBe(25)
    expect(overWide[0].emergency).toBe(true)

    const leadingNbsp = solveDeterministicTextLayout(
      [
        atom('nbsp-edge', '\u00a0', 'space', { advance: 5 }),
        atom('edge-han', '甲', 'han'),
      ],
      15,
      { justifyWrappedLines: false },
    )[0]
    expect(leadingNbsp.atoms[0].boxWidth).toBe(5)
    expect(leadingNbsp.actualWidth).toBe(15)
  })

  it('keeps wrapped title lines ragged when justification is disabled', () => {
    const source = Array.from('一道国考真题，拆开4种隐蔽失分', (text, index) =>
      atom(
        `title-${index}`,
        text,
        text === '，' ? 'closing-punctuation' : /^\d$/u.test(text) ? 'digit' : 'han',
        text === '，'
          ? NOTO_INK.comma
          : /^\d$/u.test(text)
            ? { breakGroup: 'title-number' }
            : NOTO_INK.han,
      ),
    )
    const lines = solveDeterministicTextLayout(source, 60, {
      justifyWrappedLines: false,
    })

    expect(lines.map((line) => line.atoms.map((item) => item.text).join('')))
      .toEqual(['一道国考真', '题，拆开4种', '隐蔽失分'])
    expect(lines.every((line) => !line.justified && !line.emergency)).toBe(true)
    expect(lines.every((line) => line.actualWidth <= line.targetWidth)).toBe(
      true,
    )
    expect(wrappedLines(lines).some((line) => line.actualWidth < 60)).toBe(true)
  })

  it.each([true, false])(
    'keeps an over-wide hardNoBreak group intact and marks emergency (justify=%s)',
    (justifyWrappedLines) => {
    const source = [
      atom('hard-0', '超', 'han', {
        advance: 30,
        breakGroup: 'hard',
        hardNoBreak: true,
      }),
      atom('hard-1', '长', 'han', {
        advance: 30,
        breakGroup: 'hard',
        hardNoBreak: true,
      }),
    ]
      const lines = solveDeterministicTextLayout(source, 50, {
        justifyWrappedLines,
      })

      expect(lines).toHaveLength(1)
      expect(lines[0].atoms.map((item) => item.text).join('')).toBe('超长')
      expect(lines[0].actualWidth).toBeGreaterThan(50)
      expect(lines[0].emergency).toBe(true)
    },
  )

  it('marks an impossible rigid glyph as emergency instead of faking a fit', () => {
    const lines = solveDeterministicTextLayout(
      [atom('oversize', 'W', 'latin', { advance: 80 })],
      50,
    )

    expect(lines).toHaveLength(1)
    expect(lines[0].actualWidth).toBe(80)
    expect(lines[0].emergency).toBe(true)
  })

  it('marks missing punctuation ink metrics as an explicit layout emergency', () => {
    const lines = solveDeterministicTextLayout(
      [
        atom('missing-ink-left', '甲', 'han', NOTO_INK.han),
        atom('missing-ink-colon', '：', 'closing-punctuation', {
          opticalMetricsMissing: true,
        }),
        atom('missing-ink-right', '乙', 'han', NOTO_INK.han),
      ],
      100,
      { justifyWrappedLines: false },
    )

    expect(lines.some((line) => line.emergency)).toBe(true)
    expect(lines.flatMap((line) => line.atoms).map((item) => item.text).join(''))
      .toBe('甲：乙')
  })

  it('is idempotent when the exact same measured atom objects are laid out twice', () => {
    const source = [
      atom('idempotent-han-0', '甲', 'han', NOTO_INK.han),
      atom(
        'idempotent-colon',
        '：',
        'closing-punctuation',
        NOTO_INK.colon,
      ),
      atom('idempotent-han-1', '乙', 'han', NOTO_INK.han),
      atom(
        'idempotent-open-quote',
        '“',
        'opening-punctuation',
        NOTO_INK.openQuote,
      ),
      atom('idempotent-han-2', '丙', 'han', NOTO_INK.han),
      atom(
        'idempotent-close-quote',
        '”',
        'closing-punctuation',
        NOTO_INK.closeQuote,
      ),
      ...opticalHanAtoms('丁戊己庚辛', 'idempotent-tail'),
    ]
    const sourceBefore = source.map((item) => ({ ...item }))

    const first = solveDeterministicTextLayout(source, 42.6)
    const second = solveDeterministicTextLayout(source, 42.6)

    expect(second).toEqual(first)
    expect(deterministicLayoutSnapshotHash(second)).toBe(
      deterministicLayoutSnapshotHash(first),
    )
    expect(source).toEqual(sourceBefore)
  })

  it('produces the same stable snapshot hash for identical inputs', () => {
    const source = [
      ...hanAtoms('中文', 'snapshot'),
      atom('snapshot-number', '2', 'digit', { breakGroup: 'number' }),
      atom('snapshot-punctuation', '。', 'closing-punctuation'),
      ...hanAtoms('排版测试', 'snapshot-tail'),
    ]
    const first = solveDeterministicTextLayout(source, 42)
    const second = solveDeterministicTextLayout(
      source.map((item) => ({ ...item })),
      42,
    )
    const firstHash = deterministicLayoutSnapshotHash(first)
    const secondHash = deterministicLayoutSnapshotHash(second)

    expect(firstHash).toMatch(/^[0-9a-f]{8}$/u)
    expect(secondHash).toBe(firstHash)
    expect(deterministicLayoutSnapshotHash(first)).toBe(firstHash)
  })
})
