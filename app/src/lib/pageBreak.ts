export interface PageBreakJsonNode {
  type?: string
  text?: string
  attrs?: Record<string, unknown>
  content?: PageBreakJsonNode[]
  [key: string]: unknown
}

const PAGE_BREAK_NODE_TYPE = 'horizontalRule'
export const PAGE_BREAK_CONTINUATION_ATTRIBUTE =
  'data-page-break-continuation'
export const PAGE_CONTINUATION_TERMINAL_ATTRIBUTE =
  'data-page-continuation-terminal'

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
  breaksBefore: boolean[]
  breaksAfter: boolean[]
}

interface BreakScan {
  breaksBefore: boolean[]
  breaksAfter: boolean[]
  sawVisibleContent: boolean
}

function pageBreakJsonContinuation(node: PageBreakJsonNode): boolean {
  return node.attrs?.continuation === true
}

function scanJsonBreakPlacement(node: PageBreakJsonNode, scan: BreakScan): void {
  if (isPageBreakJsonNode(node)) {
    const target = scan.sawVisibleContent
      ? scan.breaksAfter
      : scan.breaksBefore
    target.push(pageBreakJsonContinuation(node))
    return
  }
  if (
    (node.type === 'text' && Boolean(node.text)) ||
    node.type === 'image' ||
    node.type === 'divider' ||
    node.type === 'hardBreak'
  ) {
    scan.sawVisibleContent = true
  }
  node.content?.forEach((child) => scanJsonBreakPlacement(child, scan))
}

function cleanJsonTree(node: PageBreakJsonNode): PageBreakJsonNode | null {
  if (isPageBreakJsonNode(node)) return null
  if (!node.content) return { ...node }
  const content: PageBreakJsonNode[] = []
  for (const child of node.content) {
    const scan: BreakScan = {
      breaksBefore: [],
      breaksAfter: [],
      sawVisibleContent: false,
    }
    scanJsonBreakPlacement(child, scan)
    const cleaned = cleanJsonTree(child)
    if (!cleaned) continue
    if (
      child.type === 'listItem' &&
      scan.breaksBefore.length + scan.breaksAfter.length > 0 &&
      !hasVisibleJsonContent(cleaned)
    ) {
      continue
    }
    content.push(cleaned)
  }
  if (
    (isListJsonNode(node) || node.type === 'blockquote') &&
    content.length === 0
  ) {
    return null
  }
  return { ...node, content }
}

function isEmptyJsonBlock(node: PageBreakJsonNode): boolean {
  return (
    (node.type === 'paragraph' ||
      node.type === 'heading' ||
      node.type === 'codeBlock') &&
    !hasVisibleJsonContent(node)
  )
}

function trimBreakAdjacentEmptyJsonBlocks(
  node: PageBreakJsonNode,
  trimStart: boolean,
  trimEnd: boolean,
): PageBreakJsonNode {
  if (!node.content) return node
  const content = [...node.content]
  if (trimStart) {
    while (content[0] && isEmptyJsonBlock(content[0])) content.shift()
  }
  if (trimEnd) {
    while (content.at(-1) && isEmptyJsonBlock(content.at(-1)!)) content.pop()
  }
  return { ...node, content }
}

/** 清掉嵌套分页，同时保留它相对当前最外层块的前/后语义。 */
function cleanNestedJsonNode(node: PageBreakJsonNode): CleanedJsonNode {
  const scan: BreakScan = {
    breaksBefore: [],
    breaksAfter: [],
    sawVisibleContent: false,
  }
  scanJsonBreakPlacement(node, scan)
  const cleaned = cleanJsonTree(node)
  return {
    node: cleaned
      ? trimBreakAdjacentEmptyJsonBlocks(
          cleaned,
          scan.breaksBefore.length > 0,
          scan.breaksAfter.length > 0,
        )
      : null,
    breaksBefore: scan.breaksBefore,
    breaksAfter: scan.breaksAfter,
  }
}

function pageBreakJsonNode(continuation = false): PageBreakJsonNode {
  return {
    type: PAGE_BREAK_NODE_TYPE,
    attrs: { continuation },
  }
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

  const appendBreaks = (continuations: readonly boolean[]) => {
    flushList()
    for (const continuation of continuations) {
      output.push(pageBreakJsonNode(continuation))
    }
  }

  for (const child of node.content ?? []) {
    if (isPageBreakJsonNode(child)) {
      appendBreaks([pageBreakJsonContinuation(child)])
      continue
    }

    const cleaned = cleanNestedJsonNode(child)
    if (cleaned.breaksBefore.length > 0) appendBreaks(cleaned.breaksBefore)
    if (cleaned.node) {
      const consumeEmptyItem =
        child.type === 'listItem' &&
        cleaned.breaksBefore.length + cleaned.breaksAfter.length > 0 &&
        !hasVisibleJsonContent(cleaned.node)
      if (!consumeEmptyItem) {
        if (currentItems.length === 0) currentStartOffset = keptItemCount
        currentItems.push(cleaned.node)
        if (child.type === 'listItem') keptItemCount += 1
      }
    }
    if (cleaned.breaksAfter.length > 0) appendBreaks(cleaned.breaksAfter)
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
      content.push(pageBreakJsonNode(pageBreakJsonContinuation(child)))
      continue
    }
    if (isListJsonNode(child)) {
      content.push(...normalizeRootListJson(child))
      continue
    }

    const cleaned = cleanNestedJsonNode(child)
    for (const continuation of cleaned.breaksBefore) {
      content.push(pageBreakJsonNode(continuation))
    }
    if (cleaned.node) content.push(cleaned.node)
    for (const continuation of cleaned.breaksAfter) {
      content.push(pageBreakJsonNode(continuation))
    }
  }
  return { ...root, content } as T
}

function isPageBreakElement(node: Element): boolean {
  return node.tagName === 'HR' && !node.classList.contains('divider')
}

function pageBreakElementContinuation(node: Element): boolean {
  return node.getAttribute(PAGE_BREAK_CONTINUATION_ATTRIBUTE) === 'true'
}

function hasVisibleDomContent(node: Element): boolean {
  if (node.textContent?.trim()) return true
  return Boolean(
    node.querySelector('img, hr.divider, br, video, audio, iframe, table'),
  )
}

function removeNestedPageBreakElements(node: Element): void {
  const pageBreaks = Array.from(node.querySelectorAll('hr:not(.divider)'))
  for (const pageBreak of pageBreaks) pageBreak.remove()
}

function scanDomBreakPlacement(node: Node, scan: BreakScan): void {
  if (node.nodeType === Node.TEXT_NODE) {
    if (node.textContent?.trim()) scan.sawVisibleContent = true
    return
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return
  const element = node as Element
  if (isPageBreakElement(element)) {
    const target = scan.sawVisibleContent
      ? scan.breaksAfter
      : scan.breaksBefore
    target.push(pageBreakElementContinuation(element))
    return
  }
  if (
    ['IMG', 'BR', 'VIDEO', 'AUDIO', 'IFRAME', 'TABLE'].includes(
      element.tagName,
    ) ||
    (element.tagName === 'HR' && element.classList.contains('divider'))
  ) {
    scan.sawVisibleContent = true
  }
  Array.from(element.childNodes).forEach((child) =>
    scanDomBreakPlacement(child, scan),
  )
}

function isEmptyDomBlock(node: Element): boolean {
  return (
    ['P', 'H1', 'H2', 'H3', 'PRE'].includes(node.tagName) &&
    !hasVisibleDomContent(node)
  )
}

function pruneEmptyBreakContainers(node: Element): void {
  const candidates = Array.from(
    node.querySelectorAll('li, ul, ol, blockquote'),
  ).reverse()
  for (const candidate of candidates) {
    if (!hasVisibleDomContent(candidate)) candidate.remove()
  }
}

interface CleanedDomNode {
  node: HTMLElement | null
  breaksBefore: boolean[]
  breaksAfter: boolean[]
}

function cleanNestedDomElement(node: HTMLElement): CleanedDomNode {
  const scan: BreakScan = {
    breaksBefore: [],
    breaksAfter: [],
    sawVisibleContent: false,
  }
  scanDomBreakPlacement(node, scan)
  const clone = node.cloneNode(true) as HTMLElement
  removeNestedPageBreakElements(clone)
  if (scan.breaksBefore.length + scan.breaksAfter.length > 0) {
    pruneEmptyBreakContainers(clone)
    if (scan.breaksBefore.length > 0) {
      while (clone.firstElementChild && isEmptyDomBlock(clone.firstElementChild)) {
        clone.firstElementChild.remove()
      }
    }
    if (scan.breaksAfter.length > 0) {
      while (clone.lastElementChild && isEmptyDomBlock(clone.lastElementChild)) {
        clone.lastElementChild.remove()
      }
    }
  }
  return {
    node:
      scan.breaksBefore.length + scan.breaksAfter.length > 0 &&
      !hasVisibleDomContent(clone)
        ? null
        : clone,
    breaksBefore: scan.breaksBefore,
    breaksAfter: scan.breaksAfter,
  }
}

function createPageBreakElement(
  document: Document,
  continuation = false,
): HTMLElement {
  const pageBreak = document.createElement('hr')
  pageBreak.className = 'page-break'
  if (continuation) {
    pageBreak.setAttribute(PAGE_BREAK_CONTINUATION_ATTRIBUTE, 'true')
  }
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

  const appendBreaks = (continuations: readonly boolean[]) => {
    flushList()
    for (const continuation of continuations) {
      output.push(createPageBreakElement(list.ownerDocument, continuation))
    }
  }

  for (const child of Array.from(list.children)) {
    if (isPageBreakElement(child)) {
      appendBreaks([pageBreakElementContinuation(child)])
      continue
    }

    const cleaned = cleanNestedDomElement(child as HTMLElement)
    if (cleaned.breaksBefore.length > 0) appendBreaks(cleaned.breaksBefore)
    const consumeEmptyItem =
      child.tagName === 'LI' &&
      cleaned.breaksBefore.length + cleaned.breaksAfter.length > 0 &&
      !cleaned.node
    if (!consumeEmptyItem && cleaned.node) {
      if (currentItems.length === 0) currentStartOffset = keptItemCount
      currentItems.push(cleaned.node)
      if (cleaned.node.tagName === 'LI') keptItemCount += 1
    }
    if (cleaned.breaksAfter.length > 0) appendBreaks(cleaned.breaksAfter)
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
  const parsed = new DOMParser().parseFromString('', 'text/html')
  const root = parsed.createElement('div')
  root.innerHTML = html

  const output: Node[] = []
  for (const child of Array.from(root.childNodes)) {
    if (child.nodeType !== Node.ELEMENT_NODE) {
      output.push(child.cloneNode(true))
      continue
    }
    const element = child as HTMLElement
    if (isPageBreakElement(element)) {
      const pageBreak = element.cloneNode(true) as HTMLElement
      pageBreak.classList.add('page-break')
      if (pageBreakElementContinuation(element)) {
        pageBreak.setAttribute(PAGE_BREAK_CONTINUATION_ATTRIBUTE, 'true')
      } else {
        pageBreak.removeAttribute(PAGE_BREAK_CONTINUATION_ATTRIBUTE)
      }
      output.push(pageBreak)
      continue
    }
    if (element.tagName === 'UL' || element.tagName === 'OL') {
      output.push(...normalizeRootListElement(element))
      continue
    }

    const cleaned = cleanNestedDomElement(element)
    for (const continuation of cleaned.breaksBefore) {
      output.push(createPageBreakElement(parsed, continuation))
    }
    if (cleaned.node) output.push(cleaned.node)
    for (const continuation of cleaned.breaksAfter) {
      output.push(createPageBreakElement(parsed, continuation))
    }
  }

  root.replaceChildren(...output)
  return root.innerHTML
}
