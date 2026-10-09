/** Final canvas CSS px for the first top-level H1 on the cover only. */
export const COVER_TITLE_FONT_SIZE_OPTIONS = [108, 126, 144] as const

export type CoverTitleFontSize = (typeof COVER_TITLE_FONT_SIZE_OPTIONS)[number]

/** Missing or invalid values follow the theme's original title sizing rules. */
export function normalizeCoverTitleFontSize(
  value: unknown,
): CoverTitleFontSize | undefined {
  return typeof value === 'number' &&
    (COVER_TITLE_FONT_SIZE_OPTIONS as readonly number[]).includes(value)
    ? (value as CoverTitleFontSize)
    : undefined
}
