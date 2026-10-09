import { describe, expect, it } from 'vitest'
import { COVER_TITLE_FONT_SIZE_OPTIONS, normalizeCoverTitleFontSize } from './coverTitle'

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
