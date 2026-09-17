import type { EditorState, Transaction } from '@tiptap/pm/state'
import type { LogoStrategy, ThemeKey } from './themes'

export type CoverLogoPosition = 'visible-area' | 'inner'
export type PageLogoVisibility = 'inherit' | 'show' | 'hide'
export interface LogoSettings {
  strategy: LogoStrategy
  coverPosition: CoverLogoPosition
  coverVisibility: PageLogoVisibility
}
export function normalizeCoverLogoPosition(value: unknown): CoverLogoPosition {
  return value === 'inner' ? 'inner' : 'visible-area'
}
export function normalizePageLogoVisibility(value: unknown): PageLogoVisibility {
  return value === 'show' || value === 'hide' ? value : 'inherit'
}
export function normalizeLogoSettings(value: unknown): LogoSettings {
  const config = (value ?? {}) as Partial<LogoSettings>
  return {
    strategy: ['every', 'first', 'first-last', 'none'].includes(config.strategy ?? '') ? config.strategy! : 'every',
    coverPosition: normalizeCoverLogoPosition(config.coverPosition),
    coverVisibility: normalizePageLogoVisibility(config.coverVisibility),
  }
}
export function isLogoVisible(strategy: LogoStrategy, override: unknown, index: number, total: number, themeClass: ThemeKey = ''): boolean {
  if (themeClass === 'theme-public-exam-landscape') return false
  const visibility = normalizePageLogoVisibility(override)
  if (visibility !== 'inherit') return visibility === 'show'
  return strategy === 'every' || (strategy === 'first' && index === 0) ||
    (strategy === 'first-last' && (index === 0 || index === total - 1))
}
/** Draft style owns visual defaults; doc/break attributes participate in normal history.
 * The root owns the first page; each preceding break owns the following page. */
export function hydrateLogoSettings(document: object, style: { logoStrategy: LogoStrategy; coverLogoPosition?: CoverLogoPosition; themeClass?: ThemeKey; logoAssetId?: string }): object {
  const doc = document as { attrs?: Record<string, unknown>; content?: Array<{ type?: string; attrs?: Record<string, unknown> }> }
  const total = 1 + (doc.content?.filter(node => node.type === 'horizontalRule').length ?? 0)
  let index = 0
  // Preserve old hidden/top layouts as well as visible ones. Visibility edits
  // never change this reservation; showing a logo may instead trigger overlap checks.
  const content = doc.content?.map(node => {
    if (node.type !== 'horizontalRule') return node
    index++
    return { ...node, attrs: { ...node.attrs,
    logoLayoutReserved: node.attrs?.logoLayoutReserved ?? (Boolean(style.logoAssetId) && isLogoVisible(style.logoStrategy, node.attrs?.logoVisibility, index, total, style.themeClass)),
  } } })
  return { ...document, ...(content ? { content } : {}), attrs: { ...doc.attrs, logoSettings: {
    ...normalizeLogoSettings(doc.attrs?.logoSettings),
    strategy: style.logoStrategy,
    coverPosition: normalizeCoverLogoPosition(style.coverLogoPosition),
  } } }
}
export function pageLogoTransaction(state: EditorState, pageIndex: number, value: PageLogoVisibility): Transaction {
  const tr = state.tr
  if (pageIndex === 0) return tr.setDocAttribute('logoSettings', { ...normalizeLogoSettings(state.doc.attrs.logoSettings), coverVisibility: value })
  let index = 0
  state.doc.forEach((node, position) => {
    if (node.type.name === 'horizontalRule' && ++index === pageIndex) {
      tr.setNodeMarkup(position, undefined, { ...node.attrs, pageId: node.attrs.pageId || crypto.randomUUID(), logoVisibility: value === 'inherit' ? null : value })
    }
  })
  return tr
}
export function resetPageLogosTransaction(state: EditorState): Transaction {
  const settings = normalizeLogoSettings(state.doc.attrs.logoSettings)
  const tr = state.tr
  if (settings.coverVisibility !== 'inherit') tr.setDocAttribute('logoSettings', { ...settings, coverVisibility: 'inherit' })
  state.doc.forEach((node, position) => {
    if (node.type.name === 'horizontalRule' && normalizePageLogoVisibility(node.attrs.logoVisibility) !== 'inherit') {
      tr.setNodeMarkup(position, undefined, { ...node.attrs, logoVisibility: null })
    }
  })
  return tr
}
export function readPageLogoOverrides(html: string, cover: PageLogoVisibility): PageLogoVisibility[] {
  const root = new DOMParser().parseFromString(html, 'text/html').body
  return [cover, ...Array.from(root.children).filter(node => node.matches('hr.page-break'))
    .map(node => normalizePageLogoVisibility(node.getAttribute('data-logo-visibility')))]
}

export function readLogoLayoutReservations(html: string): boolean[] {
  const root = new DOMParser().parseFromString(html, 'text/html').body
  return [false, ...Array.from(root.children).filter(node => node.matches('hr.page-break'))
    .map(node => node.getAttribute('data-logo-layout-reserved') !== 'false')]
}

/** Legacy content-bearing templates may replace boundaries. Keep only settings
 * owned by surviving draft identities; never attach overrides by page index or
 * copy a different manuscript's overrides from template content. */
export function preserveDraftPageLogos(incoming: object, current: object | null): object {
  type JsonNode = { type?: string; attrs?: Record<string, unknown>; content?: JsonNode[] }
  const draft = current as JsonNode | null
  const existing = new Map((draft?.content ?? [])
    .filter(node => node.type === 'horizontalRule' && typeof node.attrs?.pageId === 'string')
    .map(node => [node.attrs!.pageId, node.attrs!]))
  const next = incoming as JsonNode
  return { ...next, content: next.content?.map(node => {
    if (node.type !== 'horizontalRule') return node
    const own = existing.get(node.attrs?.pageId)
    return { ...node, attrs: { ...node.attrs,
      logoVisibility: own?.logoVisibility ?? null,
      logoLayoutReserved: own?.logoLayoutReserved ?? true,
    } }
  }) }
}
