const SIX_DIGIT_HEX = /^#[0-9a-f]{6}$/i
const NORMALIZED_SIX_DIGIT_HEX = /^#[0-9A-F]{6}$/

/**
 * Accept only a complete six-digit CSS hex color and return its storage form.
 * Shorthand, alpha channels, whitespace and arbitrary CSS values are rejected.
 */
export function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== 'string' || !SIX_DIGIT_HEX.test(value)) return null
  return value.toUpperCase()
}

/** True when a value is acceptable user input for normalizeHexColor. */
export function isValidHexColor(value: unknown): value is string {
  return typeof value === 'string' && SIX_DIGIT_HEX.test(value)
}

/** True only for the canonical value allowed in persisted V2 data. */
export function isNormalizedHexColor(value: unknown): value is string {
  return typeof value === 'string' && NORMALIZED_SIX_DIGIT_HEX.test(value)
}
