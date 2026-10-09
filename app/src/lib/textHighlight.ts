export const TEXT_HIGHLIGHT_COLOR = '#7B3B8B'
export const TEXT_HIGHLIGHT_DEFAULT_OPACITY = 0.25
export const TEXT_HIGHLIGHT_UNDERLINE_COLOR = '#31C9C1'
export const TEXT_HIGHLIGHT_UNDERLINE_DEFAULT_OPACITY = 0.5
export type TextHighlightStyle = 'background' | 'underline'
export const TEXT_HIGHLIGHT_COLORS = [
  { value: '#31C9C1', label: '青绿' },
  { value: '#7B3B8B', label: '紫' },
  { value: '#F2C94C', label: '黄' },
  { value: '#EF7998', label: '粉' },
  { value: '#5B8DEF', label: '蓝' },
] as const
export type TextHighlightColor = (typeof TEXT_HIGHLIGHT_COLORS)[number]['value']

export function normalizeHighlightStyle(value: unknown): TextHighlightStyle {
  return value === 'underline' ? 'underline' : 'background'
}

export function getHighlightDefaultOpacity(style?: unknown): number {
  return normalizeHighlightStyle(style) === 'underline'
    ? TEXT_HIGHLIGHT_UNDERLINE_DEFAULT_OPACITY
    : TEXT_HIGHLIGHT_DEFAULT_OPACITY
}

/**
 * 色板内的颜色与样式独立；缺省/非法颜色才回落到各样式原有默认色。
 * 不接受任意 HEX 或 CSS 颜色，旧紫色底色与青绿划线均原样保留。
 */
export function normalizeHighlightColor(value: unknown, style?: unknown): TextHighlightColor {
  const candidate = typeof value === 'string' ? value.trim().toUpperCase() : ''
  const color = TEXT_HIGHLIGHT_COLORS.find((option) => option.value === candidate)
  if (color) return color.value
  return normalizeHighlightStyle(style) === 'underline'
    ? TEXT_HIGHLIGHT_UNDERLINE_COLOR
    : TEXT_HIGHLIGHT_COLOR
}

export function normalizeHighlightOpacity(value: unknown, style?: unknown): number {
  const numeric = typeof value === 'number' ? value : Number.parseFloat(String(value))
  if (!Number.isFinite(numeric)) return getHighlightDefaultOpacity(style)
  return Math.min(1, Math.max(0, Math.round(numeric * 100) / 100))
}

export function highlightColorWithOpacity(
  color?: unknown,
  opacity?: unknown,
  style?: unknown,
): string {
  const normalized = normalizeHighlightColor(color, style)
  const alpha = normalizeHighlightOpacity(opacity, style)
  const red = Number.parseInt(normalized.slice(1, 3), 16)
  const green = Number.parseInt(normalized.slice(3, 5), 16)
  const blue = Number.parseInt(normalized.slice(5, 7), 16)
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}
