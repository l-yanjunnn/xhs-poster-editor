import type { EditorState, Transaction } from '@tiptap/pm/state'

export type PageVertical = 'inherit' | 'top' | 'middle' | 'bottom'
export function normalizePageVertical(value: unknown): PageVertical {
  return value === 'top' || value === 'middle' || value === 'bottom' ? value : 'inherit'
}
export function normalizeCoverTopOffset(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(-120, Math.min(120, value)) : 0
}

/** Align the existing normal-flow stack; keep its collapsed margins and line geometry. */
export function alignInnerPage(page: HTMLElement): void {
  page.style.setProperty('--inner-top-shift', '0px')
  if (page.classList.contains('page--first')) return
  const mode = page.dataset.innerVertical
  if (mode !== 'middle' && mode !== 'bottom') return
  const content = page.querySelector<HTMLElement>('.content')
  if (!content?.lastElementChild) return
  const bounds = page.getBoundingClientRect(), scale = bounds.width / 1080
  if (!scale) return
  const style = getComputedStyle(content)
  const bottom = Math.max(...[...content.children].map(child => child.getBoundingClientRect().bottom))
  const availableBottom = bounds.bottom - parseFloat(style.paddingBottom) * scale
  const slack = Math.max(0, (availableBottom - bottom) / scale)
  page.style.setProperty('--inner-top-shift', `${slack * (mode === 'middle' ? 0.5 : 1)}px`)
}

/** The preceding break owns the following page. Unconfigured legacy pages need no migration. */
export function readPageLayouts(html: string): Array<{ id: string | null; vertical: PageVertical }> {
  const root = new DOMParser().parseFromString(html, 'text/html').body
  return [{ id: 'cover', vertical: 'inherit' }, ...Array.from(root.children)
    .filter(node => node.matches('hr.page-break'))
    .map(node => ({ id: node.getAttribute('data-page-id'), vertical: normalizePageVertical(node.getAttribute('data-page-vertical')) }))]
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
