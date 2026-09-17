import type { EditorState, Transaction } from '@tiptap/pm/state'

export type InnerPagePosition = 'top' | 'middle'
export type PageVertical = 'inherit' | InnerPagePosition
export function normalizePageVertical(value: unknown): PageVertical {
  return value === 'top' || value === 'middle' ? value : 'inherit'
}
export function normalizeInnerPagePosition(value: unknown): InnerPagePosition {
  return value === 'top' ? 'top' : 'middle'
}
export function resolvePageVertical(value: unknown, templateDefault: unknown): InnerPagePosition {
  const override = normalizePageVertical(value)
  return override === 'inherit' ? normalizeInnerPagePosition(templateDefault) : override
}
export const INNER_PAGE_OFFSET_LIMIT = 360
export function normalizeInnerPageOffset(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(Math.max(-INNER_PAGE_OFFSET_LIMIT, Math.min(INNER_PAGE_OFFSET_LIMIT, value))) : 0
}
export function resolveInnerPageOffset(value: unknown, templateDefault: unknown): number {
  return normalizeInnerPageOffset(value == null ? templateDefault : value)
}
export function parsePageOffset(value: string | null): number | null {
  return value == null || value.trim() === '' ? null : normalizeInnerPageOffset(Number(value))
}

export function normalizeCoverTopOffset(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(-120, Math.min(120, value)) : 0
}

/** Middle retains the template's original flow position. Top aligns that flow
 * to the logo anchor and reserves the remainder of the logo's first row. */
export function alignInnerPage(page: HTMLElement): void {
  page.style.setProperty('--inner-top-shift', '0px')
  page.style.setProperty('--inner-first-clearance', '0px')
  if (page.classList.contains('page--first') || page.dataset.innerVertical !== 'top') return
  const content = page.querySelector<HTMLElement>('.content')
  if (!content?.firstElementChild) return
  const bounds = page.getBoundingClientRect(), scale = bounds.width / 1080
  if (!scale) return
  const first = [...content.children].map(child => child.getBoundingClientRect())
    .find(rect => rect.width > 0 && rect.height > 0)
  if (!first) return
  // Hiding the logo must not change the template's alignment anchor.
  const logo = page.querySelector<HTMLElement>('.logo')?.getBoundingClientRect()
  const anchor = logo && logo.height > 0
    ? (logo.top - bounds.top) / scale
    : parseFloat(getComputedStyle(page).getPropertyValue('--logo-offset-y'))
  if (!Number.isFinite(anchor)) return
  page.style.setProperty('--inner-top-shift', `${anchor - (first.top - bounds.top) / scale + normalizeInnerPageOffset(Number(page.dataset.innerOffset))}px`)
  // Reserve any remainder of the logo row as spacing, without stretching a
  // short heading's own box or its optical decorations.
  if (logo?.height && page.dataset.logoLayoutReserved !== 'false') {
    page.style.setProperty('--inner-first-clearance', `${Math.max(0, (logo.height - first.height) / scale)}px`)
  }
}

/** The preceding break owns the following page. Unconfigured legacy pages need no migration. */
export function readPageLayouts(html: string): Array<{ id: string | null; vertical: PageVertical; offset: number | null }> {
  const root = new DOMParser().parseFromString(html, 'text/html').body
  return [{ id: 'cover', vertical: 'inherit', offset: null }, ...Array.from(root.children)
    .filter(node => node.matches('hr.page-break'))
    .map(node => ({ id: node.getAttribute('data-page-id'), vertical: normalizePageVertical(node.getAttribute('data-page-vertical')), offset: parsePageOffset(node.getAttribute('data-page-offset')) }))]
}

/** Copies keep their setting but get a fresh identity; mapping preserves the original even when pasted before it. */
export function deduplicatePageIdentities(transactions: readonly Transaction[], oldState: EditorState, state: EditorState): Transaction | null {
  if (!transactions.some(transaction => transaction.docChanged)) return null
  const originalPositions = new Map<string, number>()
  oldState.doc.forEach((node, position) => {
    if (node.type.name !== 'horizontalRule' || !node.attrs.pageId) return
    let mapped = position
    for (const transaction of transactions) mapped = transaction.mapping.map(mapped)
    originalPositions.set(node.attrs.pageId, mapped)
  })
  const groups = new Map<string, number[]>()
  state.doc.forEach((node, position) => {
    if (node.type.name === 'horizontalRule' && node.attrs.pageId) {
      const positions = groups.get(node.attrs.pageId) ?? []
      positions.push(position)
      groups.set(node.attrs.pageId, positions)
    }
  })
  const tr = state.tr
  for (const [id, positions] of groups) {
    const original = originalPositions.get(id)
    const keep = original !== undefined && positions.includes(original) ? original : positions[0]
    for (const position of positions) {
      if (position === keep) continue
      const node = state.doc.nodeAt(position)!
      tr.setNodeMarkup(position, undefined, { ...node.attrs, pageId: crypto.randomUUID() })
    }
  }
  return tr.docChanged ? tr : null
}
