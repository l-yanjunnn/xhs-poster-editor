import { describe, expect, it } from 'vitest'
import {
  highlightColorWithOpacity,
  normalizeHighlightColor,
  normalizeHighlightOpacity,
  TEXT_HIGHLIGHT_COLOR,
} from './textHighlight'

describe('textHighlight', () => {
  it('keeps the full 0%-100% opacity range', () => {
    expect(normalizeHighlightOpacity(-1)).toBe(0)
    expect(normalizeHighlightOpacity(0.5)).toBe(0.5)
    expect(normalizeHighlightOpacity(2)).toBe(1)
  })

  it('renders semantic color and opacity as a stable rgba value', () => {
    expect(highlightColorWithOpacity('#7B3B8B', 0)).toBe('rgba(123, 59, 139, 0)')
    expect(highlightColorWithOpacity('#7B3B8B', 0.5)).toBe('rgba(123, 59, 139, 0.5)')
    expect(highlightColorWithOpacity('#7B3B8B', 1)).toBe('rgba(123, 59, 139, 1)')
  })

  it('canonicalizes every external color to the fixed V1.4 base color', () => {
    expect(normalizeHighlightColor('#00FF00')).toBe(TEXT_HIGHLIGHT_COLOR)
    expect(normalizeHighlightColor('red')).toBe(TEXT_HIGHLIGHT_COLOR)
    expect(normalizeHighlightColor(null)).toBe(TEXT_HIGHLIGHT_COLOR)
    expect(highlightColorWithOpacity('#00FF00', 0.5)).toBe(
      'rgba(123, 59, 139, 0.5)',
    )
  })
})
