// Content entry must preserve user Unicode text, including whitespace at marks.
export const NO_WRAP_PHRASE_MAX_LENGTH = 12

/** Compatibility entry points: a mark boundary is not evidence of accidental whitespace. */
export function normalizeChineseBoldBoundaryWhitespaceHtml(html: string): string {
  return html
}

export function normalizeChineseBoldBoundaryWhitespaceJson<T extends object>(doc: T): T {
  return doc
}

export function normalizeEditorContent<T extends object | string>(content: T): T {
  return content
}

/**
 * 「短语不拆行」只允许显式选中的单行短文本，避免整段 nowrap 溢出画布。
 */
export function canKeepPhraseTogether(text: string): boolean {
  const trimmed = text.trim()
  return (
    trimmed.length > 0 &&
    !/[\r\n]/.test(trimmed) &&
    Array.from(trimmed).length <= NO_WRAP_PHRASE_MAX_LENGTH
  )
}
