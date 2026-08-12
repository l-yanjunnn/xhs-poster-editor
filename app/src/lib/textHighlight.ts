export const TEXT_HIGHLIGHT_COLOR = '#7B3B8B'
export const TEXT_HIGHLIGHT_DEFAULT_OPACITY = 0.25

/**
 * V1.4 的荧光笔是单色语义标记。外部 HTML/旧草稿即使携带
 * 其他色值，也不能将它带入预览或导出。
 */
export function normalizeHighlightColor(value: unknown): string {
  void value
  return TEXT_HIGHLIGHT_COLOR
}

export function normalizeHighlightOpacity(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number.parseFloat(String(value))
  if (!Number.isFinite(numeric)) return TEXT_HIGHLIGHT_DEFAULT_OPACITY
  return Math.min(1, Math.max(0, Math.round(numeric * 100) / 100))
}

export function highlightColorWithOpacity(
  color: unknown = TEXT_HIGHLIGHT_COLOR,
  opacity = TEXT_HIGHLIGHT_DEFAULT_OPACITY,
): string {
  const normalized = normalizeHighlightColor(color)
  const alpha = normalizeHighlightOpacity(opacity)
  const red = Number.parseInt(normalized.slice(1, 3), 16)
  const green = Number.parseInt(normalized.slice(3, 5), 16)
  const blue = Number.parseInt(normalized.slice(5, 7), 16)
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}
