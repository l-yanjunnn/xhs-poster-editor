import { describe, expect, it } from 'vitest'
import { SYSTEM_FONT_STACK } from './fontPresets'
import {
  BUILTIN_THEMES,
  getThemeCoverTextColors,
  normalizeTheme,
  type Theme,
} from './themes'

function asLegacyTheme(theme: Theme): Record<string, unknown> {
  const legacy: Record<string, unknown> = { ...theme }
  delete legacy.coverBgAssetId
  delete legacy.coverTitleColor
  delete legacy.coverSubtitleColor
  delete legacy.coverLayout
  delete legacy.coverVertical
  delete legacy.coverSubtitleSpacing
  delete legacy.coverTitleFontSize
  delete legacy.coverTitleFontFamily
  return legacy
}

describe('normalizeTheme', () => {
  it.each([
    ['builtin-elegant', '#1A1A1A'],
    ['builtin-minimal-white', '#111111'],
    ['builtin-dark-night', '#F0F0F0'],
  ])('migrates %s without changing its original colors', (id, color) => {
    const source = BUILTIN_THEMES.find((theme) => theme.id === id)
    expect(source).toBeDefined()

    const normalized = normalizeTheme(asLegacyTheme(source as Theme))

    expect(normalized).not.toBeNull()
    expect(normalized?.coverBgAssetId).toBe(source?.bgAssetId)
    expect(normalized?.coverTitleColor).toBe(color)
    expect(normalized?.coverSubtitleColor).toBe(color)
    expect(normalized?.coverLayout).toBe('stack-left')
    expect(normalized?.coverVertical).toBe('top')
    expect(normalized?.coverSubtitleSpacing).toBe('standard')
    expect(normalized?.coverTitleFontSize).toBeUndefined()
    expect(normalized?.coverTitleFontFamily).toBeUndefined()
  })

  it("preserves an explicit empty cover asset instead of falling back with '||'", () => {
    const theme = {
      ...BUILTIN_THEMES[0],
      bgAssetId: 'user-inner-background',
      coverBgAssetId: '',
    }

    expect(normalizeTheme(theme)?.coverBgAssetId).toBe('')
  })

  it('clamps fontSize into the 12-120 range the document store enforces', () => {
    // documentStore 越界即抛：不 clamp 的坏主题应用后自动保存会永久失败。
    expect(
      normalizeTheme({ ...BUILTIN_THEMES[0], fontSize: 4 })?.fontSize,
    ).toBe(12)
    expect(
      normalizeTheme({ ...BUILTIN_THEMES[0], fontSize: 500 })?.fontSize,
    ).toBe(120)
    expect(
      normalizeTheme({ ...BUILTIN_THEMES[0], fontSize: 40 })?.fontSize,
    ).toBe(40)
  })

  it('canonicalizes valid lowercase colors and rejects CSS injection values', () => {
    const lowercase = normalizeTheme({
      ...BUILTIN_THEMES[0],
      coverTitleColor: '#6d136c',
      coverSubtitleColor: '#5a465f',
    })
    expect(lowercase?.coverTitleColor).toBe('#6D136C')
    expect(lowercase?.coverSubtitleColor).toBe('#5A465F')

    const unsafe = normalizeTheme({
      ...BUILTIN_THEMES[0],
      coverTitleColor: 'var(--arbitrary-css)',
      coverSubtitleColor: '#1234',
    })
    expect(unsafe?.coverTitleColor).toBe('#1A1A1A')
    expect(unsafe?.coverSubtitleColor).toBe('#1A1A1A')
  })

  it.each([108, 126, 144] as const)(
    'preserves the explicit %s px cover size without applying layout multipliers',
    (coverTitleFontSize) => {
      const source = {
        ...BUILTIN_THEMES[0],
        coverLayout: 'kicker-above' as const,
        coverTitleFontSize,
      }

      expect(normalizeTheme(source)).toMatchObject({
        coverTitleFontSize,
        fontSize: source.fontSize,
        coverLayout: 'kicker-above',
        contentJSON: null,
      })
    },
  )

  it('restores follow mode for invalid cover sizes without rejecting a legacy theme', () => {
    for (const coverTitleFontSize of [undefined, null, 0, 120, 500, '126', '126px', NaN]) {
      const normalized = normalizeTheme({ ...BUILTIN_THEMES[0], coverTitleFontSize })
      expect(normalized).not.toBeNull()
      expect(normalized?.coverTitleFontSize).toBeUndefined()
      expect(normalized?.fontSize).toBe(BUILTIN_THEMES[0].fontSize)
    }
  })

  it('rejects a record that is not a complete legacy theme', () => {
    expect(normalizeTheme(null)).toBeNull()
    expect(normalizeTheme({ id: 'broken' })).toBeNull()
  })

  it('retains a separate cover font without changing whole-document fonts', () => {
    for (const coverTitleFontFamily of [SYSTEM_FONT_STACK, '"user-font-123", serif']) {
      const normalized = normalizeTheme({ ...BUILTIN_THEMES[0], coverTitleFontFamily })
      expect(normalized?.coverTitleFontFamily).toBe(coverTitleFontFamily)
      expect(normalized?.fontH1).toBe(BUILTIN_THEMES[0].fontH1)
      expect(normalized?.fontBody).toBe(BUILTIN_THEMES[0].fontBody)
    }
  })

  it('does not apply the new built-in cover defaults to old theme snapshots', () => {
    for (const coverTitleFontFamily of [undefined, null, '', '  ', 123, {}]) {
      const normalized = normalizeTheme({
        ...BUILTIN_THEMES[0],
        name: '雅致',
        coverVertical: 'top',
        coverTitleFontFamily,
      })
      expect(normalized).toMatchObject({ name: '雅致', coverVertical: 'top' })
      expect(normalized?.coverTitleFontFamily).toBeUndefined()
      expect(normalized?.fontH1).toBe(BUILTIN_THEMES[0].fontH1)
    }
  })
})

describe('built-in themes V2', () => {
  it('reuses elegant for the centered Baicaolu cover while retaining inner-page fonts', () => {
    const theme = BUILTIN_THEMES.find((candidate) => candidate.id === 'builtin-elegant')
    expect(theme).toMatchObject({
      name: '百草路撸猫战神',
      themeClass: '',
      coverVertical: 'middle',
      coverTitleFontFamily: SYSTEM_FONT_STACK,
      fontH1: SYSTEM_FONT_STACK,
      fontH2: SYSTEM_FONT_STACK,
      fontH3: SYSTEM_FONT_STACK,
      fontBody: SYSTEM_FONT_STACK,
      contentJSON: null,
    })
    expect(theme?.coverTitleFontSize).toBeUndefined()
    for (const other of BUILTIN_THEMES.filter((candidate) => candidate.id !== 'builtin-elegant')) {
      expect(other.coverTitleFontFamily).toBeUndefined()
    }
  })

  it('defines the public-exam pair and semantic colors without content', () => {
    const theme = BUILTIN_THEMES.find(
      (candidate) => candidate.id === 'builtin-public-exam-landscape',
    )

    expect(theme).toMatchObject({
      name: '公考·山水卷',
      themeClass: 'theme-public-exam-landscape',
      bgAssetId: 'builtin-bg-public-exam-landscape-inner-v1',
      coverBgAssetId: 'builtin-bg-public-exam-landscape-cover-v1',
      coverTitleColor: '#6D136C',
      coverSubtitleColor: '#5A465F',
      coverLayout: 'stack-left',
      coverVertical: 'top',
      coverSubtitleSpacing: 'standard',
      logoStrategy: 'none',
      contentJSON: null,
    })
  })

  it('returns defensive copies of the class-specific color defaults', () => {
    const first = getThemeCoverTextColors('theme-public-exam-landscape')
    first.title = '#000000'

    expect(getThemeCoverTextColors('theme-public-exam-landscape')).toEqual({
      title: '#6D136C',
      subtitle: '#5A465F',
    })
  })

  it('keeps stored cover controls and falls back unsafe values to A · 上 + standard', () => {
    expect(
      normalizeTheme({
        ...BUILTIN_THEMES[0],
        coverLayout: 'poster-center',
        coverVertical: 'bottom',
        coverSubtitleSpacing: 'relaxed',
      }),
    ).toMatchObject({
      coverLayout: 'poster-center',
      coverVertical: 'bottom',
      coverSubtitleSpacing: 'relaxed',
    })
    expect(
      normalizeTheme({
        ...BUILTIN_THEMES[0],
        coverLayout: 'free-drag',
        coverVertical: 'y-420',
        coverSubtitleSpacing: 'tracking-12',
      }),
    ).toMatchObject({
      coverLayout: 'stack-left',
      coverVertical: 'top',
      coverSubtitleSpacing: 'standard',
    })
  })

  it.each(['compact', 'standard', 'relaxed'] as const)(
    'round-trips the %s subtitle spacing without changing another theme field',
    (coverSubtitleSpacing) => {
      const source = {
        ...BUILTIN_THEMES[3],
        id: `user-${coverSubtitleSpacing}`,
        isBuiltin: false,
        coverLayout: 'kicker-above' as const,
        coverVertical: 'middle' as const,
        coverSubtitleSpacing,
      }

      expect(normalizeTheme(source)).toEqual({ ...source, coverLogoPosition: 'visible-area', coverTopOffset: 0, innerVerticalDefault: 'middle', innerOffsetDefault: 0 })
    },
  )
})
