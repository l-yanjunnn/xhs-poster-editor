/**
 * Markdown 导入的纯解析边界。
 *
 * 这里只输出生产 Tiptap schema 已支持的有限语义 HTML，
 * 不透传原始 HTML 或远程图片，因此 contentHtml 可直接交给
 * EditorHandle.setContent，再由既有的 normalizeIncomingContent 建立最终不变量。
 */

import { ORDINARY_POST_IMAGE_LIMIT } from './productConfig'

export { ORDINARY_POST_IMAGE_LIMIT } from './productConfig'

export type SeparatorMode = 'pages' | 'divider'

export type ImportDocumentErrorCode =
  | 'UNSUPPORTED_FILE'
  | 'EMPTY_DOCUMENT'
  | 'BINARY_DOCUMENT'
  | 'AMBIGUOUS_STRUCTURE'
  | 'INCOMPLETE_STRUCTURE'
  | 'INVALID_STRUCTURE_ORDER'
  | 'EMPTY_PAGE'
  | 'MISSING_COVER_TEXT'
  | 'INVALID_SEPARATOR_DECISION'

export class ImportDocumentError extends Error {
  readonly code: ImportDocumentErrorCode

  constructor(code: ImportDocumentErrorCode, message: string) {
    super(message)
    this.name = 'ImportDocumentError'
    this.code = code
  }
}

export interface ImportCover {
  title: string | null
  subtitle: string | null
  bodySource: string
}

export interface ImportPage {
  index: number
  number: number
  total: number
  role: 'cover' | 'inner'
  source: string
  title: string | null
  subtitle: string | null
  outlineLabel: string
  visibleCharacters: number
  mayOverflow: boolean
  html: string
}

export interface ImportPlatformStatus {
  tone: 'ok' | 'limit' | 'over'
  label: string
}

export interface ImportAnalysis {
  sourceName: string
  source: string
  rawMainSource: string
  isExactStructure: boolean
  structureLabel: string
  separatorCount: number
  separatorMode: SeparatorMode | null
  needsSeparatorDecision: boolean
  decisionResolved: boolean
  pageCount: number
  innerPageCount: number
  pages: ImportPage[]
  cover: ImportCover
  releaseCopy: string
  releaseHtml: string
  releaseParagraphCount: number
  hashtagCount: number
  preservedTypes: string[]
  overflowPages: number[]
  platformStatus: ImportPlatformStatus
  /** 全部页面仍是一份 Tiptap 文档；分页符只出现在根层。 */
  contentHtml: string
}

export interface AnalyzeImportDocumentOptions {
  sourceName?: string
  separatorMode?: SeparatorMode
}

const COVER_MARKER = /^#\s+封面\s*$/
const RELEASE_MARKER = /^#\s+正文\s*$/
const FENCE_MARKER = /^\s{0,3}(```+|~~~+)/
// 3 个及以上连字符都是 CommonMark 合法 thematic break（---- 等），
// 只认恰好 3 个会让多余的连字符以字面文字出现在成品图上。
const PAGE_SEPARATOR = /^\s{0,3}-{3,}\s*$/

export function validateImportFilename(name = ''): true {
  const normalized = name.trim().toLowerCase()
  if (!normalized.endsWith('.md') && !normalized.endsWith('.txt')) {
    throw new ImportDocumentError(
      'UNSUPPORTED_FILE',
      '暂时只支持 .md 或 .txt 文稿，请换一个文件。',
    )
  }
  return true
}

export function analyzeImportDocument(
  input: string,
  options: AnalyzeImportDocumentOptions = {},
): ImportAnalysis {
  const source = normalizeSource(input)
  if (!source.trim()) {
    throw new ImportDocumentError(
      'EMPTY_DOCUMENT',
      '文稿是空的，请选择有内容的文件，或粘贴全文。',
    )
  }
  if (looksBinary(source)) {
    throw new ImportDocumentError(
      'BINARY_DOCUMENT',
      '这个文件不像可读文稿，请改用 UTF-8 编码的 .md 或 .txt。',
    )
  }

  const lines = source.split('\n')
  const structural = scanStructuralLines(lines)
  const firstContentLine = lines.findIndex((line) => line.trim().length > 0)

  if (structural.cover.length > 1 || structural.release.length > 1) {
    throw new ImportDocumentError(
      'AMBIGUOUS_STRUCTURE',
      '检测到重复的「# 封面」或「# 正文」，请先保留唯一一组结构标记。',
    )
  }
  if (structural.cover.length !== structural.release.length) {
    throw new ImportDocumentError(
      'INCOMPLETE_STRUCTURE',
      '专用文稿结构不完整：需要同时包含「# 封面」和「# 正文」。',
    )
  }

  const hasSpecialMarkers = structural.cover.length === 1
  if (
    hasSpecialMarkers &&
    (structural.cover[0] !== firstContentLine ||
      structural.release[0] <= structural.cover[0])
  ) {
    throw new ImportDocumentError(
      'INVALID_STRUCTURE_ORDER',
      '「# 封面」应位于文稿开头，并且「# 正文」应放在所有图片内容之后。',
    )
  }

  const isExactStructure = hasSpecialMarkers
  const mainStart = isExactStructure ? structural.cover[0] + 1 : 0
  const mainEnd = isExactStructure ? structural.release[0] : lines.length
  const mainLines = lines.slice(mainStart, mainEnd)
  const releaseLines = isExactStructure
    ? lines.slice(structural.release[0] + 1)
    : []
  const rawMainSource = trimOuterBlankLines(mainLines).join('\n')
  const releaseCopy = trimOuterBlankLines(releaseLines).join('\n')
  const separatorIndexes = scanSeparators(rawMainSource.split('\n'))

  const requestedMode = options.separatorMode ?? null
  const needsSeparatorDecision =
    !isExactStructure && separatorIndexes.length > 0
  const separatorMode: SeparatorMode | null = isExactStructure
    ? 'pages'
    : needsSeparatorDecision
      ? requestedMode
      : null

  // 未决策时仍按“分页”给出预览页数，但 UI 必须依据
  // decisionResolved 禁用生成按钮，不会悄悄代用户做决定。
  const pageSources = buildPageSources(
    rawMainSource,
    separatorMode ?? 'pages',
  )
  if (isExactStructure && pageSources.some((page) => !page.trim())) {
    throw new ImportDocumentError(
      'EMPTY_PAGE',
      '分页符前后出现了空白页，请删除连续、开头或结尾处多余的 ---。',
    )
  }

  const cover = isExactStructure
    ? extractCoverMeta(pageSources[0] ?? '')
    : extractOrdinaryTitle(pageSources[0] ?? '')
  if (isExactStructure && (!cover.title || !cover.subtitle)) {
    throw new ImportDocumentError(
      'MISSING_COVER_TEXT',
      '封面需要两个二级标题（##）：第一个作为主标题，第二个作为副标题。',
    )
  }

  const pages = pageSources.map((pageSource, index) =>
    buildPage(pageSource, index, pageSources.length, isExactStructure, cover),
  )
  const contentHtml = pages.map((page) => page.html).join(
    '<hr class="page-break">',
  )
  const overflowPages = pages
    .filter((page) => page.index > 0 && page.mayOverflow)
    .map((page) => page.number)

  return {
    sourceName: options.sourceName?.trim() || '粘贴的文稿',
    source,
    rawMainSource,
    isExactStructure,
    structureLabel: isExactStructure
      ? '已识别 # 封面 / # 正文 专用结构'
      : '普通 Markdown / 纯文本',
    separatorCount: separatorIndexes.length,
    separatorMode,
    needsSeparatorDecision,
    decisionResolved: !needsSeparatorDecision || requestedMode !== null,
    pageCount: pages.length,
    innerPageCount: Math.max(0, pages.length - 1),
    pages,
    cover,
    releaseCopy,
    releaseHtml: releaseCopy ? renderMarkdown(releaseCopy) : '',
    releaseParagraphCount: releaseCopy
      ? releaseCopy.split(/\n\s*\n/).filter((part) => part.trim()).length
      : 0,
    hashtagCount: (releaseCopy.match(/(^|\s)#[^\s#]+/g) ?? []).length,
    preservedTypes: collectPreservedTypes(rawMainSource),
    overflowPages,
    platformStatus: getPlatformStatus(pages.length),
    contentHtml,
  }
}

export function applySeparatorDecision(
  analysis: ImportAnalysis,
  separatorMode: SeparatorMode,
): ImportAnalysis {
  if (separatorMode !== 'pages' && separatorMode !== 'divider') {
    throw new ImportDocumentError(
      'INVALID_SEPARATOR_DECISION',
      '请选择把 --- 作为分页，或保留为普通分隔线。',
    )
  }
  return analyzeImportDocument(analysis.source, {
    sourceName: analysis.sourceName,
    separatorMode,
  })
}

export function getPlatformStatus(
  pageCount: number,
  limit = ORDINARY_POST_IMAGE_LIMIT,
): ImportPlatformStatus {
  if (pageCount === limit) {
    return {
      tone: 'limit',
      label: `${pageCount} 张，达到当前普通图文单篇上限`,
    }
  }
  if (pageCount > limit) {
    return {
      tone: 'over',
      label: `共 ${pageCount} 张，超过普通图文单篇上限 ${limit} 张；仍会完整生成`,
    }
  }
  return {
    tone: 'ok',
    label: '可作为一篇普通图文发布',
  }
}

function buildPage(
  source: string,
  index: number,
  total: number,
  isExactStructure: boolean,
  cover: ImportCover,
): ImportPage {
  const explicitHeading = source.match(/^##\s+(.+)$/m)
  const isCover = index === 0
  const title = isCover
    ? cover.title
    : explicitHeading
      ? stripInlineMarkdown(explicitHeading[1])
      : null
  const subtitle = isCover ? cover.subtitle : null
  const visibleCharacters = countVisibleCharacters(source)
  const html =
    isCover && isExactStructure
      ? renderExactCover(cover)
      : renderMarkdown(source)

  return {
    index,
    number: index + 1,
    total,
    role: isCover ? 'cover' : 'inner',
    source,
    title,
    subtitle,
    outlineLabel: title || `第 ${index + 1} 页续文`,
    visibleCharacters,
    mayOverflow: index > 0 && visibleCharacters > 300,
    html,
  }
}

function renderExactCover(cover: ImportCover): string {
  const body = cover.bodySource.trim()
  return [
    `<h1>${renderInline(cover.title ?? '')}</h1>`,
    `<p>${renderInline(cover.subtitle ?? '')}</p>`,
    body ? renderMarkdown(body) : '',
  ].join('')
}

function renderMarkdown(source: string): string {
  const lines = normalizeSource(source).split('\n')
  const output: string[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) {
      index += 1
      continue
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      const level = heading[1].length
      output.push(`<h${level}>${renderInline(heading[2])}</h${level}>`)
      index += 1
      continue
    }

    if (/^\s*>/.test(line)) {
      const quoteLines: string[] = []
      while (index < lines.length && /^\s*>/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^\s*>\s?/, ''))
        index += 1
      }
      const quoteBody = quoteLines
        .map((value) => (value ? renderInline(value) : ''))
        .join('<br>')
      output.push(`<blockquote><p>${quoteBody}</p></blockquote>`)
      continue
    }

    const unordered = line.match(/^\s*[-+*]\s+(.+)$/)
    const ordered = line.match(/^\s*(\d+)[.)]\s+(.+)$/)
    if (unordered || ordered) {
      const isOrdered = ordered !== null
      const items: string[] = []
      const itemPattern = isOrdered
        ? /^\s*(\d+)[.)]\s+(.+)$/
        : /^\s*[-+*]\s+(.+)$/
      const orderedStart = ordered ? Number(ordered[1]) : 1
      while (index < lines.length) {
        const match = lines[index].match(itemPattern)
        if (!match) break
        const itemText = isOrdered ? match[2] : match[1]
        items.push(`<li><p>${renderInline(itemText)}</p></li>`)
        index += 1
      }
      const tag = isOrdered ? 'ol' : 'ul'
      const startAttribute =
        isOrdered && orderedStart !== 1 ? ` start="${orderedStart}"` : ''
      output.push(`<${tag}${startAttribute}>${items.join('')}</${tag}>`)
      continue
    }

    if (PAGE_SEPARATOR.test(line)) {
      output.push('<hr class="divider">')
      index += 1
      continue
    }

    const fenceMatch = line.match(FENCE_MARKER)
    if (fenceMatch) {
      const fenceCharacter = fenceMatch[1][0]
      const minimumLength = fenceMatch[1].length
      const code: string[] = []
      index += 1
      while (
        index < lines.length &&
        !isClosingFence(lines[index], fenceCharacter, minimumLength)
      ) {
        code.push(lines[index])
        index += 1
      }
      if (index < lines.length) index += 1
      output.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`)
      continue
    }

    const paragraph = [line]
    index += 1
    while (
      index < lines.length &&
      lines[index].trim() &&
      !isBlockStarter(lines[index])
    ) {
      paragraph.push(lines[index])
      index += 1
    }
    // 导入不吞掉用户原文里的软换行；Tiptap 会将 br 解析为 hardBreak。
    output.push(`<p>${paragraph.map(renderInline).join('<br>')}</p>`)
  }

  return output.join('')
}

function normalizeSource(input: unknown): string {
  return String(input ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
}

function looksBinary(source: string): boolean {
  if (source.includes('\u0000')) return true
  const controls = [...source].filter((character) => {
    const code = character.charCodeAt(0)
    return code < 9 || (code > 13 && code < 32)
  }).length
  return controls > Math.max(2, source.length * 0.01)
}

function scanStructuralLines(lines: string[]): {
  cover: number[]
  release: number[]
} {
  const result = { cover: [] as number[], release: [] as number[] }
  let fence: { character: string; minimumLength: number } | null = null

  lines.forEach((line, index) => {
    if (fence) {
      if (isClosingFence(line, fence.character, fence.minimumLength)) {
        fence = null
      }
      return
    }
    const fenceMatch = line.match(FENCE_MARKER)
    if (fenceMatch) {
      fence = {
        character: fenceMatch[1][0],
        minimumLength: fenceMatch[1].length,
      }
      return
    }
    if (/^\s*>/.test(line)) return
    if (COVER_MARKER.test(line)) result.cover.push(index)
    if (RELEASE_MARKER.test(line)) result.release.push(index)
  })

  return result
}

function scanSeparators(lines: string[]): number[] {
  const indexes: number[] = []
  let fence: { character: string; minimumLength: number } | null = null

  lines.forEach((line, index) => {
    if (fence) {
      if (isClosingFence(line, fence.character, fence.minimumLength)) {
        fence = null
      }
      return
    }
    const fenceMatch = line.match(FENCE_MARKER)
    if (fenceMatch) {
      fence = {
        character: fenceMatch[1][0],
        minimumLength: fenceMatch[1].length,
      }
      return
    }
    if (!/^\s*>/.test(line) && PAGE_SEPARATOR.test(line)) {
      indexes.push(index)
    }
  })

  return indexes
}

function isClosingFence(
  line: string,
  character: string,
  minimumLength: number,
): boolean {
  const escapedCharacter = character === '`' ? '`' : '~'
  const pattern = new RegExp(
    `^\\s{0,3}${escapedCharacter}{${minimumLength},}\\s*$`,
  )
  return pattern.test(line)
}

function buildPageSources(source: string, mode: SeparatorMode): string[] {
  if (mode !== 'pages') return [source]
  const lines = source.split('\n')
  const separatorIndexes = new Set(scanSeparators(lines))
  const pages: string[][] = [[]]
  lines.forEach((line, index) => {
    if (separatorIndexes.has(index)) pages.push([])
    else pages[pages.length - 1].push(line)
  })
  return pages.map((page) => trimOuterBlankLines(page).join('\n'))
}

function extractCoverMeta(source: string): ImportCover {
  const lines = source.split('\n')
  const headings: Array<{ index: number; text: string }> = []
  lines.forEach((line, index) => {
    const match = line.match(/^##\s+(.+)$/)
    if (match && headings.length < 2) {
      headings.push({ index, text: stripInlineMarkdown(match[1]) })
    }
  })
  const consumed = new Set(headings.map((heading) => heading.index))
  return {
    title: headings[0]?.text ?? null,
    subtitle: headings[1]?.text ?? null,
    bodySource: trimOuterBlankLines(
      lines.filter((_line, index) => !consumed.has(index)),
    ).join('\n'),
  }
}

function extractOrdinaryTitle(source: string): ImportCover {
  const heading = source.match(/^#{1,3}\s+(.+)$/m)
  return {
    title: heading ? stripInlineMarkdown(heading[1]) : '未命名文稿',
    subtitle: null,
    bodySource: source,
  }
}

function collectPreservedTypes(source: string): string[] {
  const result: string[] = []
  if (/^#{1,3}\s+/m.test(source)) result.push('标题')
  if (/^\s*>/m.test(source)) result.push('引用')
  if (/^\s*(?:[-+*]|\d+[.)])\s+/m.test(source)) result.push('列表')
  if (/\*\*[^*]+\*\*/.test(source)) result.push('粗体')
  return result
}

function countVisibleCharacters(source: string): number {
  return source
    .replace(/^\s*(?:#{1,6}|>|[-+*]|\d+[.)])\s?/gm, '')
    .replace(/\*\*/g, '')
    .replace(/\s/g, '').length
}

function stripInlineMarkdown(value: string): string {
  return value
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim()
}

function renderInline(value: string): string {
  const tokenPattern = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let cursor = 0
  let output = ''
  for (const match of value.matchAll(tokenPattern)) {
    output += escapeHtml(value.slice(cursor, match.index))
    const token = match[0]
    output += token.startsWith('**')
      ? `<strong>${escapeHtml(token.slice(2, -2))}</strong>`
      : `<code>${escapeHtml(token.slice(1, -1))}</code>`
    cursor = (match.index ?? 0) + token.length
  }
  output += escapeHtml(value.slice(cursor))
  return output
}

function isBlockStarter(line: string): boolean {
  return (
    /^(#{1,3})\s+/.test(line) ||
    /^\s*>/.test(line) ||
    /^\s*[-+*]\s+/.test(line) ||
    /^\s*\d+[.)]\s+/.test(line) ||
    PAGE_SEPARATOR.test(line) ||
    FENCE_MARKER.test(line)
  )
}

function trimOuterBlankLines(lines: string[]): string[] {
  let start = 0
  let end = lines.length
  while (start < end && !lines[start].trim()) start += 1
  while (end > start && !lines[end - 1].trim()) end -= 1
  return lines.slice(start, end)
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
