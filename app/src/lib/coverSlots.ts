// 封面槽位是主题/草稿样式，不是 Tiptap 节点。
// 缺省必须是 stack-left + top + standard，旧草稿外观才能保持现状。

export const COVER_LAYOUTS = [
  'stack-left',
  'poster-center',
  'kicker-above',
] as const

export const COVER_VERTICALS = ['top', 'middle', 'bottom'] as const

export const COVER_SUBTITLE_SPACINGS = [
  'compact',
  'standard',
  'relaxed',
] as const

export type CoverLayout = (typeof COVER_LAYOUTS)[number]
export type CoverVertical = (typeof COVER_VERTICALS)[number]
export type CoverSubtitleSpacing =
  (typeof COVER_SUBTITLE_SPACINGS)[number]

export const DEFAULT_COVER_LAYOUT: CoverLayout = 'stack-left'
export const DEFAULT_COVER_VERTICAL: CoverVertical = 'top'
export const DEFAULT_COVER_SUBTITLE_SPACING: CoverSubtitleSpacing = 'standard'

export const COVER_LAYOUT_OPTIONS: {
  value: CoverLayout
  label: string
  hint: string
}[] = [
  {
    value: 'stack-left',
    label: '左对齐叠排',
    hint: '主标题多行左对齐，副标题随其下',
  },
  {
    value: 'poster-center',
    label: '居中海报',
    hint: '主标题居中放大，短分隔条 + 居中副标题',
  },
  {
    value: 'kicker-above',
    label: '小字在上大字在下',
    hint: '副标题作眉题置顶，主标题特大随后',
  },
]

export const COVER_VERTICAL_OPTIONS: {
  value: CoverVertical
  label: string
}[] = [
  { value: 'top', label: '上' },
  { value: 'middle', label: '中' },
  { value: 'bottom', label: '下' },
]

export const COVER_SUBTITLE_SPACING_OPTIONS: {
  value: CoverSubtitleSpacing
  label: string
}[] = [
  { value: 'compact', label: '紧凑' },
  { value: 'standard', label: '标准' },
  { value: 'relaxed', label: '舒展' },
]

/** 与 `docs/design/cover-slots-demo-2026-08-13/01-三套版式总览` 逐字对齐的示例封面。 */
export interface CoverLayoutExample {
  layout: CoverLayout
  vertical: CoverVertical
  title: string
  subtitle: string
  previewSrc: string
}

export const COVER_LAYOUT_EXAMPLES: Record<CoverLayout, CoverLayoutExample> = {
  'stack-left': {
    layout: 'stack-left',
    vertical: 'top',
    title: '申论大作文的三个底层结构',
    subtitle: '从审题到卷面，一篇讲透；附 12 个真题句式模板',
    previewSrc: '/builtin-assets/cover-layout-stack-left-v1.png',
  },
  'poster-center': {
    layout: 'poster-center',
    vertical: 'middle',
    title: '申论 80 分底层逻辑',
    subtitle: '三个月，从 55 到 80',
    previewSrc: '/builtin-assets/cover-layout-poster-center-v1.png',
  },
  'kicker-above': {
    layout: 'kicker-above',
    vertical: 'top',
    title: '别再背模板了',
    subtitle: '公考上岸手记 · 第 3 篇',
    previewSrc: '/builtin-assets/cover-layout-kicker-above-v1.png',
  },
}

export function normalizeCoverExampleText(value: string): string {
  return value.replace(/\s+/g, '')
}

export function matchCoverLayoutExample(
  title: string,
  subtitle: string,
): CoverLayout | null {
  const titleKey = normalizeCoverExampleText(title)
  const subtitleKey = normalizeCoverExampleText(subtitle)
  for (const example of Object.values(COVER_LAYOUT_EXAMPLES)) {
    if (
      normalizeCoverExampleText(example.title) === titleKey &&
      normalizeCoverExampleText(example.subtitle) === subtitleKey
    ) {
      return example.layout
    }
  }
  return null
}

/**
 * 只有当前封面仍是三套示例之一时，才替换首图 H1 + 紧邻 p。
 * 用户改过标题就只换版式，不改写正文。
 */
export function replaceCoverLayoutExampleHtml(
  html: string,
  nextLayout: CoverLayout,
): string | null {
  if (typeof DOMParser === 'undefined') return null
  const document = new DOMParser().parseFromString(
    `<div id="root">${html}</div>`,
    'text/html',
  )
  const root = document.getElementById('root')
  const heading = root?.querySelector(':scope > h1')
  const subtitle = heading?.nextElementSibling
  if (!root || !heading || subtitle?.tagName !== 'P') return null
  if (
    matchCoverLayoutExample(heading.textContent ?? '', subtitle.textContent ?? '') ===
    null
  ) {
    return null
  }
  const example = COVER_LAYOUT_EXAMPLES[nextLayout]
  heading.textContent = example.title
  subtitle.textContent = example.subtitle
  return root.innerHTML
}

function firstPageNodes(root: HTMLElement): Element[] {
  const nodes: Element[] = []
  for (const child of Array.from(root.children)) {
    if (child.tagName === 'HR' && child.classList.contains('page-break')) break
    nodes.push(child)
  }
  return nodes
}

function firstPageTextKey(root: HTMLElement): string {
  return normalizeCoverExampleText(
    firstPageNodes(root)
      .map((node) => node.textContent ?? '')
      .join(''),
  )
}

/**
 * 默认教程状态下切换公考·山水卷时，把首页整页替换成版式 A 示例封面
 * （2026-08-14 用户拍板）。只有首页文字与默认教程首页逐字一致（忽略空白）
 * 才替换——用户改过任何文字都原样保留，主题永不覆盖用户正文。
 * 替换只动第一个分页符之前的内容，教程第 2 页起不受影响。
 */
export function replaceDefaultTutorialCoverHtml(
  html: string,
  tutorialHtml: string,
): string | null {
  if (typeof DOMParser === 'undefined') return null
  const parse = (source: string): HTMLElement | null =>
    new DOMParser()
      .parseFromString(`<div id="root">${source}</div>`, 'text/html')
      .getElementById('root')
  const root = parse(html)
  const tutorialRoot = parse(tutorialHtml)
  if (!root || !tutorialRoot) return null
  const key = firstPageTextKey(root)
  if (!key || key !== firstPageTextKey(tutorialRoot)) return null
  const doc = root.ownerDocument
  const example = COVER_LAYOUT_EXAMPLES[DEFAULT_COVER_LAYOUT]
  const heading = doc.createElement('h1')
  heading.textContent = example.title
  const subtitle = doc.createElement('p')
  subtitle.textContent = example.subtitle
  const nodes = firstPageNodes(root)
  const anchor = nodes[0] ?? null
  root.insertBefore(heading, anchor)
  root.insertBefore(subtitle, anchor)
  for (const node of nodes) node.remove()
  return root.innerHTML
}

export function isCoverLayout(value: unknown): value is CoverLayout {
  return (
    typeof value === 'string' &&
    (COVER_LAYOUTS as readonly string[]).includes(value)
  )
}

export function isCoverVertical(value: unknown): value is CoverVertical {
  return (
    typeof value === 'string' &&
    (COVER_VERTICALS as readonly string[]).includes(value)
  )
}

export function isCoverSubtitleSpacing(
  value: unknown,
): value is CoverSubtitleSpacing {
  return (
    typeof value === 'string' &&
    (COVER_SUBTITLE_SPACINGS as readonly string[]).includes(value)
  )
}

/** 缺省或非法值都回到安全默认，避免坏主题/旧草稿砖化自动保存。 */
export function normalizeCoverLayout(value: unknown): CoverLayout {
  return isCoverLayout(value) ? value : DEFAULT_COVER_LAYOUT
}

export function normalizeCoverVertical(value: unknown): CoverVertical {
  return isCoverVertical(value) ? value : DEFAULT_COVER_VERTICAL
}

export function normalizeCoverSubtitleSpacing(
  value: unknown,
): CoverSubtitleSpacing {
  return isCoverSubtitleSpacing(value)
    ? value
    : DEFAULT_COVER_SUBTITLE_SPACING
}

export function coverSlotDataset(
  isFirstPage: boolean,
  layout: CoverLayout,
  vertical: CoverVertical,
  subtitleSpacing: CoverSubtitleSpacing,
): {
  'data-cover-layout'?: CoverLayout
  'data-cover-vertical'?: CoverVertical
  'data-cover-subtitle-spacing'?: CoverSubtitleSpacing
} {
  if (!isFirstPage) return {}
  return {
    'data-cover-layout': layout,
    'data-cover-vertical': vertical,
    'data-cover-subtitle-spacing': subtitleSpacing,
  }
}
