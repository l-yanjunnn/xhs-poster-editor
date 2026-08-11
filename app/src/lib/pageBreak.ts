export interface PageBreakJsonNode {
  type?: string
  text?: string
  attrs?: Record<string, unknown>
  content?: PageBreakJsonNode[]
  [key: string]: unknown
}

const PAGE_BREAK_NODE_TYPE = 'horizontalRule'

function isPageBreakJsonNode(node: PageBreakJsonNode): boolean {
  return node.type === PAGE_BREAK_NODE_TYPE
}

function isListJsonNode(node: PageBreakJsonNode): boolean {
  return node.type === 'bulletList' || node.type === 'orderedList'
}

function hasVisibleJsonContent(node: PageBreakJsonNode): boolean {
  if (node.type === 'text') return Boolean(node.text)
  if (
    node.type === 'image' ||
    node.type === 'divider' ||
    node.type === 'hardBreak'
  ) {
    return true
  }
  return node.content?.some(hasVisibleJsonContent) ?? false
}

interface CleanedJsonNode {
  node: PageBreakJsonNode | null
  pageBreaks: number
}

/**
 * 清掉容器内部的分页节点并计数。分页会由调用方放到当前最外层块之后，
 * 这样 blockquote 与嵌套列表都不会留下 schema 合法但画布无法消费的分页。
 */
function cleanNestedJsonNode(node: PageBreakJsonNode): CleanedJsonNode {
  if (isPageBreakJsonNode(node)) {
    return { node: null, pageBreaks: 1 }
  }
  if (!node.content) {
    return { node: { ...node }, pageBreaks: 0 }
  }

  const content: PageBreakJsonNode[] = []
  let pageBreaks = 0
  for (const child of node.content) {
    const cleaned = cleanNestedJsonNode(child)
    pageBreaks += cleaned.pageBreaks
    if (!cleaned.node) continue

    // 只消费“因分页清理而变空”的列表项；用户原本的空列表项保持不变。
    if (
      child.type === 'listItem' &&
      cleaned.pageBreaks > 0 &&
      !hasVisibleJsonContent(cleaned.node)
    ) {
      continue
    }
    content.push(cleaned.node)
  }

  if (isListJsonNode(node) && content.length === 0) {
    return { node: null, pageBreaks }
  }
  return { node: { ...node, content }, pageBreaks }
}

function pageBreakJsonNode(): PageBreakJsonNode {
  return { type: PAGE_BREAK_NODE_TYPE }
}

function normalizeRootListJson(node: PageBreakJsonNode): PageBreakJsonNode[] {
  const output: PageBreakJsonNode[] = []
  let currentItems: PageBreakJsonNode[] = []
  let keptItemCount = 0
  let currentStartOffset = 0
  const originalStart =
    node.type === 'orderedList' && typeof node.attrs?.start === 'number'
      ? node.attrs.start
      : 1

  const flushList = () => {
    if (currentItems.length === 0) return
    const attrs = { ...(node.attrs ?? {}) }
    if (node.type === 'orderedList') {
      attrs.start = originalStart + currentStartOffset
    }
    output.push({ ...node, attrs, content: currentItems })
    currentItems = []
  }

  const appendBreaks = (count: number) => {
    flushList()
    for (let index = 0; index < count; index += 1) {
      output.push(pageBreakJsonNode())
    }
  }

  for (const child of node.content ?? []) {
    if (isPageBreakJsonNode(child)) {
      appendBreaks(1)
      continue
    }

    const cleaned = cleanNestedJsonNode(child)
    if (cleaned.node) {
      const consumeEmptyItem =
        child.type === 'listItem' &&
        cleaned.pageBreaks > 0 &&
        !hasVisibleJsonContent(cleaned.node)
      if (!consumeEmptyItem) {
        if (currentItems.length === 0) currentStartOffset = keptItemCount
        currentItems.push(cleaned.node)
        if (child.type === 'listItem') keptItemCount += 1
      }
    }
    if (cleaned.pageBreaks > 0) appendBreaks(cleaned.pageBreaks)
  }
  flushList()
  return output
}

/**
 * 把历史草稿 JSON 中的嵌套 horizontalRule 升格为 doc 直接子节点。
 * 输入不会被修改；有序列表拆段后会续接原序号。
 */
export function normalizePageBreakJson<T extends object>(document: T): T {
  const root = document as PageBreakJsonNode
  if (root.type !== 'doc' || !root.content) {
    return cleanNestedJsonNode(root).node as T
  }

  const content: PageBreakJsonNode[] = []
  for (const child of root.content) {
    if (isPageBreakJsonNode(child)) {
      content.push({ ...child })
      continue
    }
    if (isListJsonNode(child)) {
      content.push(...normalizeRootListJson(child))
      continue
    }

    const cleaned = cleanNestedJsonNode(child)
    if (cleaned.node) content.push(cleaned.node)
    for (let index = 0; index < cleaned.pageBreaks; index += 1) {
      content.push(pageBreakJsonNode())
    }
  }
  return { ...root, content } as T
}

function isPageBreakElement(node: Element): node is HTMLElement {
  return node.tagName === 'HR' && !node.classList.contains('divider')
}

function hasVisibleDomContent(node: Element): boolean {
  if (node.textContent?.trim()) return true
  return Boolean(
    node.querySelector('img, hr.divider, br, video, audio, iframe, table'),
  )
}

function removeNestedPageBreakElements(node: Element): number {
  const pageBreaks = Array.from(node.querySelectorAll('hr:not(.divider)'))
  for (const pageBreak of pageBreaks) pageBreak.remove()
  return pageBreaks.length
}

function createPageBreakElement(document: Document): HTMLElement {
  const pageBreak = document.createElement('hr')
  pageBreak.className = 'page-break'
  return pageBreak
}

function normalizeRootListElement(list: HTMLElement): Node[] {
  const output: Node[] = []
  let currentItems: HTMLElement[] = []
  let keptItemCount = 0
  let currentStartOffset = 0
  const originalStart =
    list.tagName === 'OL' ? Number.parseInt(list.getAttribute('start') ?? '1', 10) : 1
  const safeOriginalStart = Number.isFinite(originalStart) ? originalStart : 1

  const flushList = () => {
    if (currentItems.length === 0) return
    const chunk = list.cloneNode(false) as HTMLElement
    if (chunk.tagName === 'OL') {
      chunk.setAttribute('start', String(safeOriginalStart + currentStartOffset))
    }
    for (const item of currentItems) chunk.append(item)
    output.push(chunk)
    currentItems = []
  }

  const appendBreaks = (count: number) => {
    flushList()
    for (let index = 0; index < count; index += 1) {
      output.push(createPageBreakElement(list.ownerDocument))
    }
  }

  for (const child of Array.from(list.children)) {
    if (isPageBreakElement(child)) {
      appendBreaks(1)
      continue
    }

    const clone = child.cloneNode(true) as HTMLElement
    const pageBreaks = removeNestedPageBreakElements(clone)
    const consumeEmptyItem =
      clone.tagName === 'LI' && pageBreaks > 0 && !hasVisibleDomContent(clone)
    if (!consumeEmptyItem) {
      if (currentItems.length === 0) currentStartOffset = keptItemCount
      currentItems.push(clone)
      if (clone.tagName === 'LI') keptItemCount += 1
    }
    if (pageBreaks > 0) appendBreaks(pageBreaks)
  }
  flushList()
  return output
}

/**
 * HTML 在进入 Tiptap schema 前先重排嵌套分页。若直接依赖 DOMParser 的
 * schema fitting，有序列表的后半段会退化成 ul，嵌套层级也可能被拍平。
 */
export function normalizePageBreakHtml(html: string): string {
  if (typeof DOMParser === 'undefined') return html
  const parsed = new DOMParser().parseFromString(
    `<div id="page-break-normalize-root">${html}</div>`,
    'text/html',
  )
  const root = parsed.getElementById('page-break-normalize-root')
  if (!root) return html

  const output: Node[] = []
  for (const child of Array.from(root.childNodes)) {
    if (!(child instanceof Element)) {
      output.push(child.cloneNode(true))
      continue
    }
    if (isPageBreakElement(child)) {
      const pageBreak = child.cloneNode(true) as HTMLElement
      pageBreak.classList.add('page-break')
      output.push(pageBreak)
      continue
    }
    if (child.tagName === 'UL' || child.tagName === 'OL') {
      output.push(...normalizeRootListElement(child as HTMLElement))
      continue
    }

    const clone = child.cloneNode(true) as HTMLElement
    const pageBreaks = removeNestedPageBreakElements(clone)
    if (pageBreaks === 0 || hasVisibleDomContent(clone)) output.push(clone)
    for (let index = 0; index < pageBreaks; index += 1) {
      output.push(createPageBreakElement(parsed))
    }
  }

  root.replaceChildren(...output)
  return root.innerHTML
}
