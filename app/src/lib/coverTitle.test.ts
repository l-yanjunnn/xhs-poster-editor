import { describe, expect, it } from 'vitest'
import { COVER_TITLE_FONT_SIZE_OPTIONS, normalizeCoverTitleFontFamily, normalizeCoverTitleFontSize } from './coverTitle'
import { SYSTEM_FONT_STACK } from './fontPresets'

describe('cover title size normalization', () => {
  it('accepts only the UI options as final canvas pixel values', () => {
    for (const value of COVER_TITLE_FONT_SIZE_OPTIONS) {
      expect(normalizeCoverTitleFontSize(value)).toBe(value)
    }
  })

  it('restores follow mode for missing, nonnumeric and unsupported values', () => {
    for (const value of [undefined, null, '', '126', '126px', 0, -126, 120, 126.5, 500, NaN, Infinity, {}]) {
      expect(normalizeCoverTitleFontSize(value)).toBeUndefined()
    }
  })
})

describe('cover title font family normalization', () => {
  it('preserves system, preset and uploaded font stacks exactly', () => {
    for (const family of [SYSTEM_FONT_STACK, 'serif', '"user-font-123", sans-serif', '  "Custom Font", serif  ']) {
      expect(normalizeCoverTitleFontFamily(family)).toBe(family)
    }
  })

  it('restores follow mode for missing, blank and non-string values', () => {
    for (const value of [undefined, null, '', ' \n ', 400, false, [], {}]) {
      expect(normalizeCoverTitleFontFamily(value)).toBeUndefined()
    }
  })
})
