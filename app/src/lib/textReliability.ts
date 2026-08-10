// 文字可靠性的纯函数：输入清理和「短语不拆行」的长度约束。
//
// 为什么只清理粗体边界：中文中间的 ASCII 空格也可能是用户故意的，
// 全局删除会误伤英文、URL 和人工留白。当空白正好落在 <strong>/<b>
// 边界，且两边都是中文或中文标点时，才可以确定是排版异常。

// 12 个全角字符可容纳「广合县市场监督管理局」等完整机构名，
// 同时阻止用户误把整句或整段设为 nowrap。
export const NO_WRAP_PHRASE_MAX_LENGTH = 12

const BLOCK_SELECTOR = 'p,h1,h2,h3,h4,h5,h6,li,blockquote'
const SKIP_TAGS = new Set(['CODE', 'PRE'])
const LAYOUT_WHITESPACE = /[ \t\r\n\u00a0]/
const CJK_LAYOUT_CONTEXT_CHARACTER =
  /[\p{Script=Han}\p{Number}\u3000-\u303f\uff01-\uff65]/u
const LATIN_CONTEXT_CHARACTER = /[A-Za-z]/
const NUMERIC_MARK_TEXT = /^[\p{Number}.,，。%％+\-−]+$/u

interface JsonMark {
  type?: string
  [key: string]: unknown
}

interface JsonContentNode {
  type?: string
  text?: string
  marks?: JsonMark[]
  content?: JsonContentNode[]
  [key: string]: unknown
}

function isChineseContextCharacter(char: string): boolean {
  return CJK_LAYOUT_CONTEXT_CHARACTER.test(char)
}

/**
 * “容量 100 GB”里的空格属于单位表达。即使 100 被加粗，也不能因为
 * 它左边是中文就只删掉前一个空格。若整段加粗数字的任一外侧紧邻
 * 拉丁字母，就把该数字两侧的边界空格都原样保留。
 */
function numericMarkedRunTouchesLatin<T extends { value: string }, M>(
  characters: T[],
  previousIndex: number,
  nextIndex: number,
  getMark: (character: T) => M | null,
): boolean {
  const previous = characters[previousIndex]
  const next = characters[nextIndex]
  const mark = (previous ? getMark(previous) : null) ??
    (next ? getMark(next) : null)
  if (mark === null || mark === undefined) return false

  const adjacentIndex =
    previous && getMark(previous) === mark ? previousIndex : nextIndex
  let runStart = adjacentIndex
  let runEnd = adjacentIndex + 1
  while (runStart > 0 && getMark(characters[runStart - 1]) === mark) {
    runStart -= 1
  }
  while (
    runEnd < characters.length &&
    getMark(characters[runEnd]) === mark
  ) {
    runEnd += 1
  }

  const markedText = characters
    .slice(runStart, runEnd)
    .map((character) => character.value)
    .join('')
    .replace(/[ \t\r\n\u00a0]/g, '')
  if (!NUMERIC_MARK_TEXT.test(markedText)) return false

  let before = runStart - 1
  while (before >= 0 && LAYOUT_WHITESPACE.test(characters[before].value)) {
    before -= 1
  }
  let after = runEnd
  while (
    after < characters.length &&
    LAYOUT_WHITESPACE.test(characters[after].value)
  ) {
    after += 1
  }
  return (
    (before >= 0 && LATIN_CONTEXT_CHARACTER.test(characters[before].value)) ||
    (after < characters.length &&
      LATIN_CONTEXT_CHARACTER.test(characters[after].value))
  )
}

function boldOwner(node: Text, container: Element): Element | null {
  let current: Element | null = node.parentElement
  while (current && current !== container) {
    if (current.matches('strong, b')) return current
    if (current instanceof HTMLElement) {
      const weight = current.style.fontWeight.trim().toLowerCase()
      if (
        weight === 'bold' ||
        weight === 'bolder' ||
        (/^\d+$/.test(weight) && Number(weight) >= 600)
      ) {
        return current
      }
    }
    current = current.parentElement
  }
  return null
}

function collectTextSegments(container: Element): Text[][] {
  const segments: Text[][] = []
  let current: Text[] = []

  function flush() {
    if (current.length > 0) segments.push(current)
    current = []
  }

  function walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      current.push(node as Text)
      return
    }
    if (!(node instanceof Element)) return
    if (SKIP_TAGS.has(node.tagName)) {
      // code/pre 是原样内容，它们同时也必须阻断两侧文字的比较。
      flush()
      return
    }
    node.childNodes.forEach(walk)
  }

  container.childNodes.forEach(walk)
  flush()
  return segments
}

function normalizeHtmlTextSegment(nodes: Text[], container: Element) {
  const characters: Array<{
    node: Text
    offset: number
    value: string
    strong: Element | null
  }> = []

  for (const node of nodes) {
    const strong = boldOwner(node, container)
    Array.from(node.data).forEach((value, offset) => {
      characters.push({ node, offset, value, strong })
    })
  }

  const removals = new Map<Text, Set<number>>()
  for (let index = 0; index < characters.length; index += 1) {
    if (!LAYOUT_WHITESPACE.test(characters[index].value)) continue
    const start = index
    while (
      index + 1 < characters.length &&
      LAYOUT_WHITESPACE.test(characters[index + 1].value)
    ) {
      index += 1
    }
    const end = index + 1
    const previous = characters[start - 1]
    const next = characters[end]
    if (!previous || !next) continue
    if (
      !isChineseContextCharacter(previous.value) ||
      !isChineseContextCharacter(next.value)
    ) {
      continue
    }
    if (
      previous.strong === next.strong ||
      (!previous.strong && !next.strong)
    ) {
      continue
    }
    if (
      numericMarkedRunTouchesLatin(
        characters,
        start - 1,
        end,
        (character) => character.strong,
      )
    ) {
      continue
    }

    for (let removeIndex = start; removeIndex < end; removeIndex += 1) {
      const character = characters[removeIndex]
      const offsets = removals.get(character.node) ?? new Set<number>()
      offsets.add(character.offset)
      removals.set(character.node, offsets)
    }
  }

  for (const [node, offsets] of removals) {
    node.data = Array.from(node.data)
      .filter((_, offset) => !offsets.has(offset))
      .join('')
  }
}

/**
 * 清理富文本 HTML 中中文粗体边界的 ASCII 空白。
 * 用于初始内容和富文本粘贴；不处理 code/pre，也不删英文空格。
 */
export function normalizeChineseBoldBoundaryWhitespaceHtml(
  html: string,
): string {
  if (!html || !/[<>&]/.test(html)) return html

  const host = document.createElement('div')
  host.innerHTML = html
  const blocks = Array.from(host.querySelectorAll(BLOCK_SELECTOR)).filter(
    (element) => !element.querySelector(BLOCK_SELECTOR),
  )
  const containers: Element[] = blocks.length > 0 ? blocks : [host]

  for (const container of containers) {
    for (const segment of collectTextSegments(container)) {
      normalizeHtmlTextSegment(segment, container)
    }
  }
  return host.innerHTML
}

function hasMark(node: JsonContentNode, markType: string): boolean {
  return node.marks?.some((mark) => mark.type === markType) ?? false
}

function normalizeJsonTextSegment(nodes: JsonContentNode[]) {
  const characters: Array<{
    nodeIndex: number
    offset: number
    value: string
    bold: boolean
  }> = []

  nodes.forEach((node, nodeIndex) => {
    Array.from(node.text ?? '').forEach((value, offset) => {
      characters.push({
        nodeIndex,
        offset,
        value,
        bold: hasMark(node, 'bold'),
      })
    })
  })

  const removals = new Map<number, Set<number>>()
  for (let index = 0; index < characters.length; index += 1) {
    if (!LAYOUT_WHITESPACE.test(characters[index].value)) continue
    const start = index
    while (
      index + 1 < characters.length &&
      LAYOUT_WHITESPACE.test(characters[index + 1].value)
    ) {
      index += 1
    }
    const end = index + 1
    const previous = characters[start - 1]
    const next = characters[end]
    if (!previous || !next) continue
    if (
      !isChineseContextCharacter(previous.value) ||
      !isChineseContextCharacter(next.value) ||
      previous.bold === next.bold
    ) {
      continue
    }
    if (
      numericMarkedRunTouchesLatin(
        characters,
        start - 1,
        end,
        (character) => (character.bold ? true : null),
      )
    ) {
      continue
    }

    for (let removeIndex = start; removeIndex < end; removeIndex += 1) {
      const character = characters[removeIndex]
      const offsets = removals.get(character.nodeIndex) ?? new Set<number>()
      offsets.add(character.offset)
      removals.set(character.nodeIndex, offsets)
    }
  }

  for (const [nodeIndex, offsets] of removals) {
    const node = nodes[nodeIndex]
    node.text = Array.from(node.text ?? '')
      .filter((_, offset) => !offsets.has(offset))
      .join('')
  }
}

function normalizeJsonNode(node: JsonContentNode): JsonContentNode {
  const output: JsonContentNode = { ...node }
  if (!node.content) return output

  output.content = node.content.map(normalizeJsonNode)
  if (node.type === 'codeBlock') return output

  let current: JsonContentNode[] = []
  const flush = () => {
    if (current.length > 0) normalizeJsonTextSegment(current)
    current = []
  }

  for (const child of output.content) {
    if (child.type === 'text' && !hasMark(child, 'code')) {
      current.push(child)
    } else {
      flush()
    }
  }
  flush()
  return output
}

/** 与 HTML 版同等的 Tiptap JSON 清理，用于 setContent(文档 JSON)。 */
export function normalizeChineseBoldBoundaryWhitespaceJson<T extends object>(
  doc: T,
): T {
  return normalizeJsonNode(doc as JsonContentNode) as T
}

/** Editor 唯一入口：字符串和 JSON 都走保守清理。 */
export function normalizeEditorContent<T extends object | string>(content: T): T {
  return (typeof content === 'string'
    ? normalizeChineseBoldBoundaryWhitespaceHtml(content)
    : normalizeChineseBoldBoundaryWhitespaceJson(content)) as T
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
