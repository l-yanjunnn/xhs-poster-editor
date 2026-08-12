import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  checkDeterministicFontReadiness,
  collectLayoutFontRequests,
  fontRequestToCssFont,
  validateLayoutFontRequests,
} from './deterministicFontReadiness'

const initialDocumentFontsDescriptor = Object.getOwnPropertyDescriptor(
  document,
  'fonts',
)

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  if (initialDocumentFontsDescriptor) {
    Object.defineProperty(document, 'fonts', initialDocumentFontsDescriptor)
  } else Reflect.deleteProperty(document, 'fonts')
})

function fontRequestElement(value: unknown): HTMLElement {
  const element = document.createElement('span')
  element.setAttribute(
    'data-layout-font-request',
    typeof value === 'string' ? value : JSON.stringify(value),
  )
  return element
}

describe('deterministic font request collection', () => {
  it('collects JSON and structured requests, keeps exact samples, and deduplicates', () => {
    const page = document.createElement('section')
    const jsonRequest = fontRequestElement({
      family: 'Noto Sans SC',
      weight: 700,
      style: 'normal',
      sample: '中文2026',
    })
    const duplicate = fontRequestElement({
      family: 'Noto Sans SC',
      weight: '700',
      style: 'normal',
      sample: '中文2026',
    })
    const structured = document.createElement('span')
    structured.setAttribute('data-layout-font-request', '')
    structured.setAttribute(
      'data-layout-font-family',
      '"Inter", sans-serif',
    )
    structured.setAttribute('data-layout-font-weight', '600')
    structured.setAttribute('data-layout-font-style', 'italic')
    structured.textContent = 'ABC 2026'
    page.append(jsonRequest, duplicate, structured)

    expect(collectLayoutFontRequests(page)).toEqual({
      requests: [
        {
          family: 'Noto Sans SC',
          weight: '700',
          style: 'normal',
          sample: '中文2026',
        },
        {
          family: 'Inter',
          weight: '600',
          style: 'italic',
          sample: 'ABC 2026',
        },
      ],
      issues: [],
    })
  })

  it('includes a matching root element and accepts a JSON request array', () => {
    const root = fontRequestElement([
      { family: 'Noto Sans SC', weight: 400, sample: '汉字' },
      { family: 'Inter', weight: 500, sample: 'Latin' },
    ])

    expect(collectLayoutFontRequests(root).requests).toEqual([
      {
        family: 'Noto Sans SC',
        weight: '400',
        style: 'normal',
        sample: '汉字',
      },
      {
        family: 'Inter',
        weight: '500',
        style: 'normal',
        sample: 'Latin',
      },
    ])
  })

  it('returns a structured issue for malformed JSON', () => {
    const element = fontRequestElement('{broken')
    element.setAttribute('data-layout-font-family', 'Noto Serif SC')
    element.setAttribute('data-layout-font-weight', '800')

    const result = collectLayoutFontRequests(element)

    expect(result.requests).toEqual([])
    expect(result.issues).toEqual([
      expect.objectContaining({
        kind: 'font',
        reason: 'invalid-request',
        family: 'Noto Serif SC',
        weight: '800',
      }),
    ])
  })
})

describe('deterministic font readiness', () => {
  it('builds an exact font shorthand and accepts only a non-empty load result', async () => {
    const load = vi.fn(async () => [{}])
    const request = {
      family: 'Noto Sans SC',
      weight: 700,
      style: 'italic',
      sample: '中文2026',
    }

    const result = await validateLayoutFontRequests([request], { load })

    expect(fontRequestToCssFont(result.requests[0])).toBe(
      'italic 700 16px "Noto Sans SC"',
    )
    expect(load).toHaveBeenCalledWith(
      'italic 700 16px "Noto Sans SC"',
      '中文2026',
    )
    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        verified: [
          {
            family: 'Noto Sans SC',
            weight: '700',
            style: 'italic',
            sample: '中文2026',
          },
        ],
        issues: [],
      }),
    )
  })

  it('uses the root document FontFaceSet.load and never trusts fonts.check', async () => {
    const load = vi.fn(async () => [])
    const check = vi.fn(() => true)
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { load, check },
    })
    const page = document.createElement('div')
    page.append(
      fontRequestElement({
        family: 'Definitely Missing Font',
        weight: 600,
        sample: '中文A0',
      }),
    )

    const result = await checkDeterministicFontReadiness(page)

    expect(load).toHaveBeenCalledTimes(1)
    expect(check).not.toHaveBeenCalled()
    expect(result.ok).toBe(false)
    expect(result.issues).toEqual([
      expect.objectContaining({
        reason: 'empty-result',
        family: 'Definitely Missing Font',
        weight: '600',
      }),
    ])
  })

  it('reports rejected loads with the concrete family and weight', async () => {
    const result = await validateLayoutFontRequests(
      [
        {
          family: 'Broken Serif',
          weight: 800,
          sample: '中文',
        },
      ],
      {
        load: async () => {
          throw new Error('network failed')
        },
      },
    )

    expect(result.issues).toEqual([
      expect.objectContaining({
        reason: 'load-error',
        family: 'Broken Serif',
        weight: '800',
        message: expect.stringContaining('network failed'),
      }),
    ])
  })

  it('reports a concrete timeout without waiting for the late loader', async () => {
    vi.useFakeTimers()
    const resultPromise = validateLayoutFontRequests(
      [{ family: 'Slow Sans', weight: 500, sample: '2026' }],
      {
        load: () => new Promise(() => {}),
        timeoutMs: 25,
      },
    )

    await vi.advanceTimersByTimeAsync(25)
    const result = await resultPromise

    expect(result.issues).toEqual([
      expect.objectContaining({
        reason: 'timeout',
        family: 'Slow Sans',
        weight: '500',
        message: expect.stringContaining('25 毫秒'),
      }),
    ])
  })

  it('allows only explicit generic/system family allowlists to bypass loading', async () => {
    const load = vi.fn(async () => [])
    const result = await validateLayoutFontRequests(
      [
        { family: 'sans-serif', weight: 400 },
        { family: 'PingFang SC', weight: 600 },
      ],
      { load, allowlistedFamilies: ['PingFang SC'] },
    )

    expect(load).not.toHaveBeenCalled()
    expect(result.ok).toBe(true)
    expect(result.allowlisted.map(({ family }) => family)).toEqual([
      'sans-serif',
      'PingFang SC',
    ])
  })

  it('reports API unavailability instead of silently accepting a font', async () => {
    const result = await validateLayoutFontRequests(
      [{ family: 'Noto Serif SC', weight: 900 }],
      { load: null },
    )

    expect(result.issues).toEqual([
      expect.objectContaining({
        reason: 'api-unavailable',
        family: 'Noto Serif SC',
        weight: '900',
      }),
    ])
  })
})
