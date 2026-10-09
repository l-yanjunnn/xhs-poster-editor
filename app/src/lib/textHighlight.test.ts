import { describe, expect, it } from 'vitest'
import {
  highlightColorWithOpacity,
  normalizeHighlightColor,
  normalizeHighlightOpacity,
  normalizeHighlightStyle,
  getHighlightDefaultOpacity,
  TEXT_HIGHLIGHT_COLOR,
  TEXT_HIGHLIGHT_DEFAULT_OPACITY,
  TEXT_HIGHLIGHT_UNDERLINE_COLOR,
  TEXT_HIGHLIGHT_COLORS,
} from './textHighlight'

describe('textHighlight', () => {
  it('keeps legacy background semantics and provides a fixed teal underline style', () => {
    expect(normalizeHighlightStyle(undefined)).toBe('background')
    expect(normalizeHighlightStyle('invalid')).toBe('background')
    expect(normalizeHighlightStyle('underline')).toBe('underline')
    expect(getHighlightDefaultOpacity()).toBe(0.25)
    expect(getHighlightDefaultOpacity('underline')).toBe(0.5)
    expect(normalizeHighlightColor('#00FF00', 'underline')).toBe(TEXT_HIGHLIGHT_UNDERLINE_COLOR)
    expect(normalizeHighlightOpacity(undefined, 'underline')).toBe(0.5)
    expect(highlightColorWithOpacity('red', undefined, 'underline')).toBe('rgba(49, 201, 193, 0.5)')
    expect(highlightColorWithOpacity('red', 0.25, 'underline')).toBe('rgba(49, 201, 193, 0.25)')
    expect(highlightColorWithOpacity('red', 0, 'underline')).toBe('rgba(49, 201, 193, 0)')
  })

  it('keeps the full 0%-100% opacity range', () => {
    expect(normalizeHighlightOpacity(-1)).toBe(0)
    expect(normalizeHighlightOpacity(0.5)).toBe(0.5)
    expect(normalizeHighlightOpacity(2)).toBe(1)
  })

  it('defaults to 25% opacity (v1.8.1 product decision)', () => {
    expect(TEXT_HIGHLIGHT_DEFAULT_OPACITY).toBe(0.25)
    expect(normalizeHighlightOpacity('not-a-number')).toBe(0.25)
  })

  it('renders semantic color and opacity as a stable rgba value', () => {
    expect(highlightColorWithOpacity('#7B3B8B', 0)).toBe('rgba(123, 59, 139, 0)')
    expect(highlightColorWithOpacity('#7B3B8B', 0.5)).toBe('rgba(123, 59, 139, 0.5)')
    expect(highlightColorWithOpacity('#7B3B8B', 1)).toBe('rgba(123, 59, 139, 1)')
  })

  it('falls back only for unsupported colors, using each style’s original default', () => {
    expect(normalizeHighlightColor('#00FF00')).toBe(TEXT_HIGHLIGHT_COLOR)
    expect(normalizeHighlightColor('red')).toBe(TEXT_HIGHLIGHT_COLOR)
    expect(normalizeHighlightColor(null)).toBe(TEXT_HIGHLIGHT_COLOR)
    expect(highlightColorWithOpacity('#00FF00', 0.5)).toBe(
      'rgba(123, 59, 139, 0.5)',
    )
    expect(normalizeHighlightColor('rgb(49, 201, 193)', 'underline')).toBe(TEXT_HIGHLIGHT_UNDERLINE_COLOR)
    expect(highlightColorWithOpacity(undefined, undefined, 'underline')).toBe('rgba(49, 201, 193, 0.5)')
  })

  it.each(TEXT_HIGHLIGHT_COLORS)('preserves palette color $label independently of shape', ({ value }) => {
    for (const style of ['background', 'underline'] as const) {
      expect(normalizeHighlightColor(value, style)).toBe(value)
      expect(normalizeHighlightColor(` ${value.toLowerCase()} `, style)).toBe(value)
    }
  })
})
