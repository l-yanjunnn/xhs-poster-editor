import { describe, expect, it } from 'vitest'
import { BODY_FONTS, DISPLAY_FONTS, SYSTEM_FONT_OPTION, SYSTEM_FONT_STACK, groupFonts } from './fontPresets'
import { BUILTIN_THEMES, DEFAULT_THEME } from './themes'

describe('system font preset', () => {
  it('is available to heading and body selectors with the same local-only fallback stack', () => {
    expect(DISPLAY_FONTS.find((font) => font.label === '系统字体')).toEqual(SYSTEM_FONT_OPTION)
    expect(BODY_FONTS.find((font) => font.label === '系统字体')).toEqual(SYSTEM_FONT_OPTION)
    expect(SYSTEM_FONT_STACK.split(',').map((family) => family.trim())).toEqual([
      '"PingFang SC"', '"Microsoft YaHei"', 'system-ui', 'sans-serif',
    ])
    expect(SYSTEM_FONT_STACK).not.toMatch(/Noto|Source Han|url\(/)
    expect(SYSTEM_FONT_OPTION.crossPlatform).toBe(false)
    expect(SYSTEM_FONT_OPTION.note).toContain('换机后外观和换行可能不同')
  })

  it('puts the system font first in both selectors and their grouped menus', () => {
    for (const fonts of [DISPLAY_FONTS, BODY_FONTS]) {
      expect(fonts[0]).toEqual(SYSTEM_FONT_OPTION)
      expect(fonts.filter((font) => font.value === SYSTEM_FONT_STACK)).toHaveLength(1)
      expect(groupFonts(fonts)[0]).toEqual({
        group: '系统字体',
        items: [SYSTEM_FONT_OPTION],
      })
    }
  })

  it('keeps old preset values selectable and changes only Baicaolu to system fonts', () => {
    const serif = '"Noto Serif SC", "Source Han Serif SC", "Songti SC", serif'
    const sans = '"Noto Sans SC", "Source Han Sans SC", "PingFang SC", sans-serif'
    expect(DISPLAY_FONTS[1].value).toBe(serif)
    expect(BODY_FONTS[1].value).toBe(sans)
    expect(DEFAULT_THEME).toMatchObject({
      id: 'builtin-elegant',
      fontH1: SYSTEM_FONT_STACK,
      fontH2: SYSTEM_FONT_STACK,
      fontH3: SYSTEM_FONT_STACK,
      fontBody: SYSTEM_FONT_STACK,
    })
    expect(DISPLAY_FONTS.some((font) => font.value === '"PingFang SC", sans-serif')).toBe(true)
    expect(BODY_FONTS.some((font) => font.value === '"PingFang SC", sans-serif')).toBe(true)
    for (const theme of BUILTIN_THEMES) {
      expect([theme.fontH1, theme.fontH2, theme.fontH3, theme.fontBody]).toEqual(
        theme.id === 'builtin-elegant'
          ? Array(4).fill(SYSTEM_FONT_STACK)
          : theme.id === 'builtin-minimal-white'
          ? [sans, sans, sans, sans]
          : [serif, serif, sans, sans],
      )
      for (const value of [theme.fontH1, theme.fontH2, theme.fontH3]) {
        expect(DISPLAY_FONTS.some((font) => font.value === value)).toBe(true)
        if (theme.id !== 'builtin-elegant') expect(value).not.toBe(SYSTEM_FONT_STACK)
      }
      expect(BODY_FONTS.some((font) => font.value === theme.fontBody)).toBe(true)
      if (theme.id !== 'builtin-elegant') expect(theme.fontBody).not.toBe(SYSTEM_FONT_STACK)
    }
  })
})
