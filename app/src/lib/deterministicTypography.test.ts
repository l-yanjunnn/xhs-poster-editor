import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  calibrateDeterministicGlyphBaselinesForHtml2Canvas,
  materializeDeterministicTypography,
  sealDeterministicTypographySnapshot,
  type DeterministicTypographyResult,
} from './deterministicTypography'
import { clearTypographyMetricsCache } from './typographyMetrics'

let clientWidthSpy: ReturnType<typeof vi.spyOn>

function pageWithContent(): HTMLDivElement {
  const page = document.createElement('div')
  page.className = 'page'
  page.innerHTML = '<div class="content"></div>'
  document.body.appendChild(page)
  return page
}

function layout(
  page: HTMLElement,
  sourceHtml: string,
): DeterministicTypographyResult {
  return materializeDeterministicTypography(page, {
    sourceHtml,
    state: 'ready',
  })
}

beforeEach(() => {
  clientWidthSpy = vi
    .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
    .mockImplementation(function measuredClientWidth(this: HTMLElement) {
      const inlineWidth = Number.parseFloat(this.style.width)
      return Number.isFinite(inlineWidth) && inlineWidth > 0
        ? inlineWidth
        : 240
    })
})

afterEach(() => {
  clientWidthSpy.mockRestore()
  document.body.replaceChildren()
})

describe('deterministic typography DOM snapshot', () => {
  it('fails explicitly when Canvas omits visible ink metrics', () => {
    const context = {
      font: '',
      textBaseline: 'alphabetic',
      fontKerning: 'normal',
      measureText: vi.fn(() => ({
        width: 20,
        actualBoundingBoxAscent: 16,
        actualBoundingBoxDescent: 4,
        fontBoundingBoxAscent: 17,
        fontBoundingBoxDescent: 5,
      }) as TextMetrics),
    } as unknown as CanvasRenderingContext2D
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(
        ((contextId: string) =>
          contextId === '2d' ? context : null) as unknown as
          HTMLCanvasElement['getContext'],
      )

    try {
      const page = pageWithContent()
      const result = layout(
        page,
        '<p style="width: 160px; font-size: 20px; line-height: 30px">甲“乙”</p>',
      )

      expect(result.issues.some((issue) =>
        issue.code === 'ink-metrics-unmeasurable')).toBe(true)
      expect(page.dataset.layoutState).toBe('error')
    } finally {
      getContext.mockRestore()
    }
  })

  it('preserves Unicode and inline semantics while materializing every visual line', () => {
    const page = pageWithContent()
    const source = [
      '<p style="width: 160px; font-size: 20px; line-height: 30px; text-align: justify">',
      '<strong>粗体2026</strong>',
      '<u>跨行下划线必须完整出现</u>',
      '<span data-text-highlight style="background-color: rgba(123, 59, 139, 0.5)">荧光笔</span>',
      '<br>显式换行',
      '</p>',
    ].join('')
    const original = new DOMParser().parseFromString(source, 'text/html').body
      .textContent

    const result = layout(page, source)
    const block = page.querySelector('p')!
    const lines = Array.from(block.querySelectorAll(':scope > .dtl-line'))

    expect(result.issues).toEqual([])
    expect(page.dataset.layoutState).toBe('ready')
    expect(block.textContent).toBe(original)
    expect(
      Array.from(block.querySelectorAll('strong'))
        .map((element) => element.textContent)
        .join(''),
    ).toBe('粗体2026')
    expect(block.querySelector('u')?.textContent).toBeTruthy()
    expect(
      Array.from(block.querySelectorAll('[data-text-highlight]'))
        .map((element) => element.textContent)
        .join(''),
    ).toBe('荧光笔')
    expect(lines.length).toBeGreaterThan(2)
    const underlineLineIndexes = new Set(
      Array.from(block.querySelectorAll<HTMLElement>('.dtl-atom'))
        .filter((atom) => atom.querySelector('u'))
        .map((atom) => atom.dataset.layoutLine),
    )
    expect(block.querySelectorAll('.dtl-decoration--underline').length).toBe(
      underlineLineIndexes.size,
    )
    for (const underline of block.querySelectorAll<HTMLElement>(
      '.dtl-decoration--underline',
    )) {
      const baseline = Number(underline.dataset.layoutBaseline)
      const y = Number(underline.dataset.layoutUnderlineY)
      const descent = Number(underline.dataset.layoutUnderlineDescent)
      const fontSize = Number(underline.dataset.layoutUnderlineFontSize)
      const thickness = Number(underline.dataset.layoutUnderlineThickness)
      const expectedOffset = Math.max(
        thickness,
        Math.min(fontSize * 0.12, descent + fontSize * 0.025),
      )

      expect(y).toBeGreaterThan(baseline)
      expect(y).toBeCloseTo(baseline + expectedOffset, 3)
      expect(underline.style.top).toBe(`${y}px`)
    }
    expect(block.querySelectorAll('.dtl-decoration--highlight')).toHaveLength(
      1,
    )
    expect(block.querySelectorAll('[data-layout-explicit-break]')).toHaveLength(
      1,
    )
    for (const line of lines) {
      expect(line.getAttribute('aria-hidden')).toBe('true')
      expect(line.hasAttribute('aria-label')).toBe(false)
      expect(line.querySelector('.dtl-glyph')).toBeNull()
    }
    expect(block.querySelector('.dtl-atom[aria-hidden]')).toBeNull()
  })

  it('preserves consecutive ASCII whitespace and NBSP as exact Unicode text', () => {
    const page = pageWithContent()
    const expected = '甲  \t乙\u00a0\u00a0丙  '
    const result = layout(
      page,
      `<p style="width: 600px; font-size: 20px; line-height: 30px">${expected}</p>`,
    )
    const block = page.querySelector('p')!
    const atoms = Array.from(
      block.querySelectorAll<HTMLElement>(':scope > .dtl-atom'),
    )
    const asciiSpaces = atoms.filter((atom) =>
      Array.from(atom.textContent ?? '').every((character) => {
        const point = character.codePointAt(0) ?? 0
        return character === ' ' || (point >= 0x09 && point <= 0x0d)
      }),
    )
    const nonBreakingSpaces = atoms.filter(
      (atom) => atom.textContent === '\u00a0',
    )

    expect(result.issues).toEqual([])
    expect(block.textContent).toBe(expected)
    expect(asciiSpaces.map((atom) => atom.textContent).join('')).toBe(
      '  \t  ',
    )
    expect(asciiSpaces.slice(0, 3).map((atom) =>
      Number(atom.dataset.layoutAdvance)))
      .toEqual([expect.any(Number), 0, 0])
    expect(Number(asciiSpaces[0].dataset.layoutAdvance)).toBeGreaterThan(0)
    expect(nonBreakingSpaces).toHaveLength(2)
    expect(
      nonBreakingSpaces.every(
        (atom) => Number(atom.dataset.layoutAdvance) > 0,
      ),
    ).toBe(true)
  })

  it('centers short lines when the block computed text-align is center', () => {
    const page = pageWithContent()
    const result = layout(
      page,
      '<h1 style="width: 240px; font-size: 20px; line-height: 30px; text-align: center">甲乙</h1>',
    )
    const atoms = Array.from(
      page.querySelectorAll<HTMLElement>('h1 > .dtl-atom'),
    )
    const xs = atoms.map((atom) => Number(atom.dataset.layoutX))

    expect(result.issues).toEqual([])
    expect(atoms.length).toBeGreaterThan(0)
    expect(Math.min(...xs)).toBeGreaterThan(20)
    expect(Math.max(...xs)).toBeLessThan(200)
  })

  it('re-centers after a block already has the left-locked layout class', () => {
    const page = pageWithContent()
    const source =
      '<h1 style="width: 240px; font-size: 20px; line-height: 30px; --dtl-text-align: center">甲乙</h1>'
    layout(page, source)
    const again = layout(page, source)
    const xs = Array.from(
      page.querySelectorAll<HTMLElement>('h1 > .dtl-atom'),
      (atom) => Number(atom.dataset.layoutX),
    )

    expect(again.issues).toEqual([])
    expect(Math.min(...xs)).toBeGreaterThan(20)
  })

  it('extends soft numeric/Latin groups across ASCII connectors and suffixes', () => {
    const page = pageWithContent()
    const result = layout(
      page,
      '<p style="width: 600px; font-size: 20px; line-height: 30px">100% A/B 2026-08，中文％</p>',
    )
    const atoms = Array.from(
      page.querySelectorAll<HTMLElement>('p > .dtl-atom'),
    )
    const text = atoms.map((atom) => atom.textContent ?? '')
    const groups = atoms.map((atom) => atom.dataset.layoutBreakGroup)
    const assertOneGroup = (token: string) => {
      const start = text.join('').indexOf(token)
      const members = groups.slice(start, start + Array.from(token).length)
      expect(members[0]).toBeTruthy()
      expect(new Set(members).size).toBe(1)
    }

    expect(result.issues).toEqual([])
    assertOneGroup('100%')
    assertOneGroup('A/B')
    assertOneGroup('2026-08')
    for (const punctuation of atoms.filter((atom) =>
      ['，', '％'].includes(atom.textContent ?? ''),
    )) {
      expect(punctuation.dataset.layoutKind).toBe('closing-punctuation')
      expect(punctuation.dataset.layoutBreakGroup).toBeUndefined()
    }
  })

  it('records exact right edges, uniform baselines, and immutable digit advances', () => {
    const page = pageWithContent()
    const result = layout(
      page,
      '<p style="width: 240px; font-size: 20px; line-height: 32px; text-align: justify">甲乙2026年，丙丁戊己庚辛壬癸甲乙2026年。</p>',
    )
    const justified = Array.from(
      page.querySelectorAll<HTMLElement>(
        '.dtl-line[data-layout-justified="true"]',
      ),
    )

    expect(result.issues).toEqual([])
    expect(justified.length).toBeGreaterThan(0)
    for (const line of justified) {
      expect(Number(line.dataset.layoutRight)).toBeCloseTo(
        Number(line.dataset.layoutTarget),
        3,
      )
      expect(Math.abs(Number(line.dataset.layoutResidual))).toBeLessThanOrEqual(
        0.01,
      )
      const baselines = new Set(
        Array.from(
          page.querySelectorAll<HTMLElement>(
            `.dtl-atom[data-layout-line="${line.dataset.layoutLine}"]`,
          ),
        ).map((atom) => atom.dataset.layoutBaseline),
      )
      expect(baselines.size).toBe(1)
    }
    const digitAtoms = Array.from(
      page.querySelectorAll<HTMLElement>('.dtl-atom[data-layout-kind="digit"]'),
    )
    expect(digitAtoms).toHaveLength(8)
    for (const atom of digitAtoms) {
      expect(Number(atom.dataset.layoutAdvance)).toBeGreaterThan(0)
      expect(atom.textContent).toMatch(/^\d$/u)
    }
  })

  it('places inline punctuation by bilateral visible-ink clearance', () => {
    clearTypographyMetricsCache(document)
    const context = {
      font: '',
      textBaseline: 'alphabetic',
      fontKerning: 'normal',
      measureText: vi.fn((text: string) => ({
        width: 20,
        actualBoundingBoxLeft: ['：', '、'].includes(text) ? -3 : 0,
        actualBoundingBoxRight: ['：', '、'].includes(text) ? 7 : 20,
        actualBoundingBoxAscent: 16,
        actualBoundingBoxDescent: 4,
        fontBoundingBoxAscent: 17,
        fontBoundingBoxDescent: 5,
      }) as TextMetrics),
    } as unknown as CanvasRenderingContext2D
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(
        ((contextId: string) =>
          contextId === '2d' ? context : null) as unknown as
          HTMLCanvasElement['getContext'],
      )

    try {
      const page = pageWithContent()
      const result = layout(
        page,
        '<p style="width: 200px; font-size: 20px; line-height: 30px">甲：乙丙、丁</p>',
      )
      const punctuation = Array.from(
        page.querySelectorAll<HTMLElement>(
          '.dtl-atom[data-layout-kind="closing-punctuation"]',
        ),
      )

      expect(result.issues).toEqual([])
      expect(punctuation.map((atom) => atom.textContent)).toEqual(['：', '、'])
      for (const atom of punctuation) {
        expect(atom.dataset.layoutInkLeft).toBe('-3.000')
        expect(atom.dataset.layoutInkRight).toBe('7.000')
        const box = Number(atom.dataset.layoutBox)
        const offset = Number(atom.dataset.layoutGlyphOffset)
        const leading = offset - Number(atom.dataset.layoutInkLeft)
        const trailing = box - offset - Number(atom.dataset.layoutInkRight)
        expect(leading).toBeGreaterThanOrEqual(0)
        expect(trailing).toBeGreaterThanOrEqual(0)
        // Dataset inkStart/inkEnd deliberately retain the native Canvas
        // metrics; the solved visible position adds glyphOffset at render time.
        expect(Number(atom.dataset.layoutInkStart)).toBe(3)
        expect(Number(atom.dataset.layoutInkEnd)).toBe(7)
        expect(
          atom.querySelector<HTMLElement>('.dtl-glyph')?.style.left,
        ).toBe(`${offset}px`)
      }
    } finally {
      getContext.mockRestore()
      clearTypographyMetricsCache(document)
    }
  })

  it('ends line decorations at a hanging closer ink edge', () => {
    clearTypographyMetricsCache(document)
    const context = {
      font: '',
      textBaseline: 'alphabetic',
      fontKerning: 'normal',
      measureText: vi.fn((text: string) => ({
        width: 20,
        actualBoundingBoxLeft: text === '；' ? -3 : 0,
        actualBoundingBoxRight: text === '；' ? 7 : 20,
        actualBoundingBoxAscent: 16,
        actualBoundingBoxDescent: 4,
        fontBoundingBoxAscent: 17,
        fontBoundingBoxDescent: 5,
      }) as TextMetrics),
    } as unknown as CanvasRenderingContext2D
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(
        ((contextId: string) =>
          contextId === '2d' ? context : null) as unknown as
          HTMLCanvasElement['getContext'],
      )

    try {
      const page = pageWithContent()
      const result = layout(
        page,
        '<p style="width: 68px; font-size: 20px; line-height: 30px; text-align: justify"><u>甲乙丙； </u>丁戊</p>',
      )
      const block = page.querySelector('p')!
      const lines = Array.from(
        block.querySelectorAll<HTMLElement>(
          '.dtl-line[data-layout-justified="true"]',
        ),
      )
      const hangingLine = lines.find((line) => {
        const atoms = Array.from(
          block.querySelectorAll<HTMLElement>(
            `.dtl-atom[data-layout-line="${line.dataset.layoutLine}"]`,
          ),
        )
        return atoms.findLast(
          (atom) => Number(atom.dataset.layoutBox) > 0,
        )?.textContent === '；'
      })!
      const punctuation = Array.from(
        block.querySelectorAll<HTMLElement>(
          `.dtl-atom[data-layout-line="${hangingLine.dataset.layoutLine}"]`,
        ),
      ).findLast((atom) => Number(atom.dataset.layoutBox) > 0)!
      const underline = hangingLine.querySelector<HTMLElement>(
        '.dtl-decoration--underline',
      )!
      const decorationRight =
        Number.parseFloat(underline.style.left) +
        Number.parseFloat(underline.style.width)

      expect(result.issues).toEqual([])
      expect(punctuation.dataset.layoutKind).toBe('closing-punctuation')
      expect(
        Number.isFinite(Number(punctuation.dataset.layoutGlyphOffset)),
      ).toBe(true)
      expect(decorationRight).toBeCloseTo(
        Number(hangingLine.dataset.layoutTarget),
        3,
      )
      expect(decorationRight).toBeLessThanOrEqual(
        Number(hangingLine.dataset.layoutTarget),
      )
    } finally {
      getContext.mockRestore()
      clearTypographyMetricsCache(document)
    }
  })

  it('seals a measured html2canvas baseline shift for every atom', () => {
    const page = pageWithContent()
    const result = layout(
      page,
      '<h2 style="width: 240px; font-size: 24px; line-height: 36px">2026 年国考标题</h2><p style="width: 240px; font-size: 20px; line-height: 32px">正文4种混排</p>',
    )
    const atoms = Array.from(
      page.querySelectorAll<HTMLElement>('.dtl-atom'),
    )
    const rangeRectSpy = vi
      .spyOn(window.Range.prototype, 'getBoundingClientRect')
      .mockReturnValue({
        bottom: 28,
        height: 20,
        left: 0,
        right: 20,
        top: 8,
        width: 20,
        x: 0,
        y: 8,
        toJSON: () => ({}),
      })

    try {
      expect(result.issues).toEqual([])
      expect(calibrateDeterministicGlyphBaselinesForHtml2Canvas(page)).toBe(
        atoms.length,
      )
      const firstHash = page.dataset.layoutExportBaselineHash
      const firstTops = atoms.map((atom) => atom.style.top)
      expect(firstHash).toMatch(/^[0-9a-f]{8}$/u)
      for (const atom of atoms) {
        const shift = Number(atom.dataset.layoutExportBaselineShift)
        expect(Number.isFinite(shift)).toBe(true)
        expect(atom.style.top).toBe(
          `${Number(atom.dataset.layoutTop) + shift}px`,
        )
      }
      expect(calibrateDeterministicGlyphBaselinesForHtml2Canvas(page)).toBe(
        atoms.length,
      )
      expect(page.dataset.layoutExportBaselineHash).toBe(firstHash)
      expect(atoms.map((atom) => atom.style.top)).toEqual(firstTops)
    } finally {
      rangeRectSpy.mockRestore()
    }
  })

  it('moves an ordered-list marker with its first deterministic text atom for export', () => {
    const page = pageWithContent()
    const result = layout(
      page,
      '<ol><li><span class="optical-list-marker" data-optical-list-marker data-optical-list-value="10">10.</span><p style="width: 240px; font-size: 20px; line-height: 32px">列表正文</p></li></ol>',
    )
    const marker = page.querySelector<HTMLElement>(
      '[data-optical-list-marker]',
    )!
    const referenceAtom = page.querySelector<HTMLElement>('.dtl-atom')!
    const rangeRectSpy = vi
      .spyOn(window.Range.prototype, 'getBoundingClientRect')
      .mockReturnValue({
        bottom: 28,
        height: 20,
        left: 0,
        right: 20,
        top: 8,
        width: 20,
        x: 0,
        y: 8,
        toJSON: () => ({}),
      })

    try {
      expect(result.issues).toEqual([])
      expect(calibrateDeterministicGlyphBaselinesForHtml2Canvas(page)).toBe(
        page.querySelectorAll('.dtl-atom').length,
      )
      expect(
        marker.style.getPropertyValue(
          '--optical-list-marker-export-shift-y',
        ),
      ).toBe(`${referenceAtom.dataset.layoutExportBaselineShift}px`)
      expect(marker.dataset.layoutExportBaselineShift).toBe(
        referenceAtom.dataset.layoutExportBaselineShift,
      )
      expect(page.dataset.layoutExportBaselineHash).toMatch(/^[0-9a-f]{8}$/u)
    } finally {
      rangeRectSpy.mockRestore()
    }
  })

  it('fails baseline calibration atomically when any shift exceeds its cap', () => {
    const page = pageWithContent()
    const result = layout(
      page,
      '<p style="width: 240px; font-size: 20px; line-height: 32px">甲4乙</p>',
    )
    const atoms = Array.from(
      page.querySelectorAll<HTMLElement>('.dtl-atom'),
    )
    const snapshotTops = atoms.map((atom) => atom.dataset.layoutTop)
    const rangeRectSpy = vi
      .spyOn(window.Range.prototype, 'getBoundingClientRect')
      .mockReturnValue({
        bottom: 220,
        height: 20,
        left: 0,
        right: 20,
        top: 200,
        width: 20,
        x: 0,
        y: 200,
        toJSON: () => ({}),
      })

    try {
      expect(result.issues).toEqual([])
      expect(calibrateDeterministicGlyphBaselinesForHtml2Canvas(page)).toBe(0)
      expect(page.dataset.layoutExportBaselineHash).toBeUndefined()
      expect(atoms.map((atom) => atom.style.top)).toEqual(
        snapshotTops.map((top) => `${Number(top)}px`),
      )
      expect(
        atoms.every((atom) => atom.dataset.layoutExportBaselineShift === ''),
      ).toBe(true)
      expect(
        atoms.some((atom) => atom.dataset.layoutExportBaselineError),
      ).toBe(true)
    } finally {
      rangeRectSpy.mockRestore()
    }
  })

  it('keeps a fitting nowrap phrase together and an impossible one explicit', () => {
    const fittingPage = pageWithContent()
    const fitting = layout(
      fittingPage,
      '<p style="width: 240px; font-size: 20px; line-height: 30px; text-align: justify">甲乙丙丁戊己庚辛<span class="nowrap-phrase" data-no-wrap-phrase>短语不拆</span>结尾文字</p>',
    )
    const phraseAtoms = Array.from(
      fittingPage.querySelectorAll<HTMLElement>('.dtl-atom'),
    ).filter((atom) => atom.querySelector('.nowrap-phrase'))

    expect(fitting.issues).toEqual([])
    expect(phraseAtoms).toHaveLength(4)
    expect(new Set(phraseAtoms.map((atom) => atom.dataset.layoutLine)).size).toBe(
      1,
    )

    const impossiblePage = pageWithContent()
    const impossible = layout(
      impossiblePage,
      '<p style="width: 60px; font-size: 20px; line-height: 30px; text-align: justify"><span class="nowrap-phrase" data-no-wrap-phrase>这是超过整行宽度的不拆短语</span></p>',
    )

    expect(impossible.issues).toEqual([
      expect.objectContaining({ code: 'unsatisfied-line' }),
    ])
    // v1.7.3：unsatisfied-line 属可覆盖警告，页面如实渲染、不再进入
    // error；是否放行由导出预检的 warning 分级和用户确认决定。
    expect(impossiblePage.dataset.layoutState).toBe('ready')
    expect(
      JSON.parse(impossiblePage.dataset.layoutIssues ?? '[]'),
    ).toEqual([
      expect.objectContaining({
        code: 'unsatisfied-line',
        blockText: expect.stringContaining('这是超过整行宽度的不拆短语'),
      }),
    ])
    expect(impossiblePage.querySelectorAll('.dtl-line')).toHaveLength(1)
  })

  it('keeps separate underline and highlight segments discontinuous', () => {
    const page = pageWithContent()
    const result = layout(
      page,
      [
        '<p style="width: 240px; font-size: 20px; line-height: 30px">',
        '<u>甲</u>乙<u>丙</u>',
        '<span data-text-highlight style="background-color: rgb(255, 230, 0)">丁</span>',
        '戊',
        '<span data-text-highlight style="background-color: rgb(255, 230, 0)">己</span>',
        '</p>',
      ].join(''),
    )

    expect(result.issues).toEqual([])
    expect(page.querySelectorAll('.dtl-decoration--underline')).toHaveLength(2)
    expect(page.querySelectorAll('.dtl-decoration--highlight')).toHaveLength(2)
    for (const underline of page.querySelectorAll<HTMLElement>(
      '.dtl-decoration--underline',
    )) {
      expect(Number(underline.dataset.layoutUnderlineY)).toBeGreaterThan(
        Number(underline.dataset.layoutBaseline),
      )
    }
    expect(page.querySelector('.content')?.textContent).toBe('甲乙丙丁戊己')
  })

  it('preserves a legacy nested list without paragraph wrappers', () => {
    const page = pageWithContent()
    const result = layout(
      page,
      '<ol><li>外层文字<ul><li>内层文字</li></ul></li><li>末项</li></ol>',
    )

    expect(result.issues).toEqual([])
    expect(page.querySelectorAll('ol > li')).toHaveLength(2)
    expect(page.querySelectorAll('ol > li:first-child > ul > li')).toHaveLength(
      1,
    )
    expect(page.querySelector('ol > li:first-child')?.textContent).toBe(
      '1.外层文字内层文字',
    )
    expect(page.querySelectorAll('[data-layout-fallback-block]')).toHaveLength(
      2,
    )
  })

  it('keeps the full unicode-range sample and list marker glyphs', () => {
    const page = pageWithContent()
    const unique = Array.from({ length: 160 }, (_, index) =>
      String.fromCodePoint(0x4e00 + index),
    ).join('')
    const result = layout(
      page,
      `<ol><li><p style="font: 400 20px/30px &quot;Noto Sans SC&quot;, sans-serif">${unique}</p></li></ol>`,
    )
    const requests = result.fontRequests.filter((request) =>
      request.family.includes('Noto Sans SC'),
    )

    expect(requests).not.toHaveLength(0)
    const notoSample = requests.map((request) => request.sample).join('')
    const allSamples = result.fontRequests
      .map((request) => request.sample)
      .join('')
    expect(notoSample).toContain(unique.at(-1))
    expect(allSamples).toContain('0123456789.-•')
  })

  it('freezes 8/9/10 marker width before solving and requests the marker\'s real font', () => {
    clearTypographyMetricsCache(document)
    const context = {
      font: '',
      textBaseline: 'alphabetic',
      fontKerning: 'normal',
      measureText: vi.fn((text: string) => ({
        width: text === '8.' ? 18 : text === '9.' ? 24 : text === '10.' ? 42.125 : 20,
        actualBoundingBoxLeft: 0,
        actualBoundingBoxRight: 20,
        actualBoundingBoxAscent: 16,
        actualBoundingBoxDescent: 4,
        fontBoundingBoxAscent: 17,
        fontBoundingBoxDescent: 5,
      }) as TextMetrics),
    } as unknown as CanvasRenderingContext2D
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(
        ((contextId: string) =>
          contextId === '2d' ? context : null) as unknown as
          HTMLCanvasElement['getContext'],
      )
    clientWidthSpy.mockImplementation(function measuredListWidth(
      this: HTMLElement,
    ) {
      if (this.tagName === 'P') {
        const list = this.closest<HTMLOListElement>('ol')
        return list?.dataset.opticalListMarkerMaxLabel === '10.' ? 198 : 240
      }
      const inlineWidth = Number.parseFloat(this.style.width)
      return Number.isFinite(inlineWidth) && inlineWidth > 0
        ? inlineWidth
        : 240
    })

    try {
      const page = pageWithContent()
      const result = layout(
        page,
        [
          '<ol start="8" style="font-family: &quot;Marker Sans&quot;; font-size: 20px; font-weight: 400; font-style: italic">',
          '<li><p><strong>全粗体八</strong></p></li>',
          '<li><p><strong>全粗体九</strong></p></li>',
          '<li><p></p></li>',
          '</ol>',
        ].join(''),
      )
      const list = page.querySelector<HTMLOListElement>('ol')!
      const labels = Array.from(
        list.querySelectorAll<HTMLElement>('[data-optical-list-marker]'),
        (marker) => marker.textContent,
      )
      const markerRequest = result.fontRequests.find(
        (request) =>
          request.family.includes('Marker Sans') &&
          request.sample.includes('0123456789.-•'),
      )

      expect(result.issues).toEqual([])
      expect(labels).toEqual(['8.', '9.', '10.'])
      expect(list.dataset.opticalListMarkerMaxLabel).toBe('10.')
      expect(
        list.style.getPropertyValue('--optical-list-marker-column-width'),
      ).toBe('42.125px')
      expect(
        Array.from(list.querySelectorAll<HTMLElement>('p')).map(
          (paragraph) => paragraph.dataset.layoutWidth,
        ),
      ).toEqual(['198.000', '198.000', undefined])
      expect(markerRequest).toMatchObject({
        weight: '400',
        style: 'italic',
      })
      expect(page.dataset.layoutFontRequest).toContain('Marker Sans')
    } finally {
      getContext.mockRestore()
      clearTypographyMetricsCache(document)
    }
  })

  it('recreates the same snapshot hash and aggregates exact font requests', () => {
    const page = pageWithContent()
    const source = [
      '<h2 style="width: 220px; font: 700 28px/40px &quot;Noto Sans SC&quot;, sans-serif">2026 年国考</h2>',
      '<p style="width: 220px; font: 400 20px/32px &quot;Noto Sans SC&quot;, sans-serif">中文混排 ABC</p>',
    ].join('')

    const first = layout(page, source)
    const firstRequest = JSON.parse(
      page.dataset.layoutFontRequest ?? '[]',
    ) as Array<{ family: string; sample: string; weight: string }>
    const second = layout(page, source)

    expect(second.snapshotId).toBe(first.snapshotId)
    expect(page.dataset.layoutSnapshot).toBe(first.snapshotId)
    expect(firstRequest.length).toBeGreaterThan(0)
    expect(
      firstRequest.some((request) =>
        ['2', '0', '6'].every((digit) => request.sample.includes(digit)),
      ),
    ).toBe(true)
    expect(firstRequest.some((request) => request.weight === '700')).toBe(true)
    expect(firstRequest.some((request) => request.weight === '400')).toBe(true)
    expect(page.hasAttribute('data-layout-font-request')).toBe(true)
    expect(
      page.querySelectorAll('[data-layout-font-request]'),
    ).toHaveLength(0)
  })

  it('seals calibrated optical geometry into the final page snapshot', () => {
    const page = pageWithContent()
    const result = layout(
      page,
      '<h2 style="width: 220px; font-size: 28px; line-height: 40px">标题</h2>',
    )
    const heading = page.querySelector<HTMLElement>('h2')!
    heading.style.setProperty('--h2-optical-center-y', '18px')
    heading.style.setProperty('--h2-optical-bar-height', '30px')
    heading.dataset.opticalH2 = 'ready'

    const first = sealDeterministicTypographySnapshot(page)
    heading.style.setProperty('--h2-optical-center-y', '19px')
    const changed = sealDeterministicTypographySnapshot(page)

    expect(page.dataset.layoutBaseSnapshot).toBe(result.snapshotId)
    expect(page.dataset.layoutSnapshotPhase).toBe('sealed')
    expect(first).not.toBe(result.snapshotId)
    expect(changed).not.toBe(first)
  })
})
