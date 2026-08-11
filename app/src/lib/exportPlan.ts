import { ORDINARY_POST_IMAGE_LIMIT } from './productConfig'

export { ORDINARY_POST_IMAGE_LIMIT } from './productConfig'
export const EXPORT_MANIFEST_SCHEMA_VERSION = 1
export const EXPORT_MANIFEST_FILE_NAME = '导出清单.json'

const DEFAULT_DOCUMENT_NAME = '未命名文稿'
const BEIJING_UTC_OFFSET_MS = 8 * 60 * 60 * 1000
// Why: APFS/NTFS 等常见文件系统对单个路径段有长度上限；
// 120 UTF-8 bytes 仍可完整保留默认的 40 个中文字，并为页码/角色/时间戳留足余量。
const MAX_DOCUMENT_NAME_UTF8_BYTES = 120
const MAX_ZIP_BASE_NAME_UTF8_BYTES = 220

export const EXPORT_DELIVERY_MODE = {
  DIRECTORY: 'directory',
  COMPATIBILITY_ZIP: 'compatibility-zip',
} as const

export type ExportDeliveryMode =
  (typeof EXPORT_DELIVERY_MODE)[keyof typeof EXPORT_DELIVERY_MODE]
export type ExportScope = 'all' | 'range' | 'selection'
export type ExportPageRole = 'cover' | 'inner'
export type OrdinaryPostStatusKind = 'within-limit' | 'at-limit' | 'over-limit'

export class ExportPlanError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'ExportPlanError'
    this.code = code
  }
}

export interface OrdinaryPostStatus {
  kind: OrdinaryPostStatusKind
  label: string
  limit: number
  pageCount: number
}

export interface ExportPageRange {
  start: number
  end: number
  pages: number[]
}

export interface ParsedPageSelection {
  pages: number[]
  ranges: ExportPageRange[]
  label: string
  inputValue: string
}

export interface ExportPageFile {
  pageNumber: number
  role: ExportPageRole
  fileName: string
}

export interface ExportManifest {
  schemaVersion: typeof EXPORT_MANIFEST_SCHEMA_VERSION
  documentTopic: string
  sourcePageCount: number
  exportMode: ExportScope
  exportedPageCount: number
  sourcePages: number[]
  ordinaryPostCompatibility: {
    limit: number
    isCompatible: boolean
  }
  generatedAt: string
  deliveryMode: ExportDeliveryMode
  folderName: string
  releaseCopyIncluded: false
  files: ExportPageFile[]
}

export interface FolderExportPlan {
  mode: ExportScope
  folderName: string
  pages: number[]
  files: ExportPageFile[]
  documentName: string
  pageCount: number
  timestamp: string
  manifest: ExportManifest
  manifestJson: string
  manifestFile: {
    fileName: typeof EXPORT_MANIFEST_FILE_NAME
    content: string
  }
}

export interface CreateFolderExportPlanOptions {
  sourceName: string
  pageCount: number
  selectedPages?: readonly number[]
  exportedAt?: Date
  collisionIndex?: number
  ordinaryPostImageLimit?: number
  deliveryMode?: ExportDeliveryMode
}

export interface ExportDeliveryPlan {
  mode: ExportDeliveryMode
  artifactName: string
  rootFolderName: string
  childNames: string[]
  entryPaths: string[]
  pngCount: number
  manifestFileName: typeof EXPORT_MANIFEST_FILE_NAME
  topLevelFolderCount: 1
  isSplit: false
}

export interface DirectoryResumePlan {
  completed: number[]
  remaining: number[]
  completedFiles: ExportPageFile[]
  remainingFiles: ExportPageFile[]
  isComplete: boolean
  resumePlan: {
    folderName: string
    pages: number[]
    files: ExportPageFile[]
  }
}

/**
 * 18 只是普通图文单篇的上传兼容线，不是生成或导出上限。
 */
export function getOrdinaryPostStatus(
  pageCount: number,
  limit = ORDINARY_POST_IMAGE_LIMIT,
): OrdinaryPostStatus {
  assertPositiveInteger(pageCount, '页数')
  assertPositiveInteger(limit, '普通图文兼容上限')

  if (pageCount < limit) {
    return {
      kind: 'within-limit',
      label: '可作为一篇普通图文发布',
      limit,
      pageCount,
    }
  }
  if (pageCount === limit) {
    return {
      kind: 'at-limit',
      label: `${pageCount} 张，达到当前普通图文单篇上限`,
      limit,
      pageCount,
    }
  }
  return {
    kind: 'over-limit',
    label: `共 ${pageCount} 张，超过普通图文单篇上限 ${limit} 张；仍会完整生成`,
    limit,
    pageCount,
  }
}

/** 只有“全部导出”越过上传兼容线时增加一次本地留存确认。 */
export function requiresAllPagesConfirmation(
  pageCount: number,
  limit = ORDINARY_POST_IMAGE_LIMIT,
): boolean {
  assertPositiveInteger(pageCount, '文稿总页数')
  assertPositiveInteger(limit, '普通图文兼容上限')
  return pageCount > limit
}

/** 解析如 `1-3, 5, 7-9`，支持中文分隔符，结果始终升序去重。 */
export function parsePageSelection(
  input: string,
  pageCount: number,
): ParsedPageSelection {
  assertPositiveInteger(pageCount, '文稿总页数')
  const source = String(input ?? '').trim()
  if (!source) {
    throw new ExportPlanError('EMPTY_SELECTION', '请输入要导出的页码。')
  }

  const tokens = source
    .replace(/\s*[-–—~～]\s*/g, '-')
    .replace(/[，、；;]/g, ',')
    .split(/[,\s]+/)
    .filter(Boolean)
  const selected = new Set<number>()

  for (const token of tokens) {
    const match = token.match(/^(\d+)(?:-(\d+))?$/)
    if (!match) {
      throw new ExportPlanError(
        'INVALID_SELECTION_FORMAT',
        `无法识别页码“${token}”，请使用如 1-3, 5, 7-9 的格式。`,
      )
    }

    const start = Number(match[1])
    const end = Number(match[2] ?? match[1])
    if (start > end) {
      throw new ExportPlanError(
        'DESCENDING_SELECTION_RANGE',
        `页码范围 ${start}-${end} 的起始页不能大于结束页。`,
      )
    }
    if (start < 1 || end > pageCount) {
      throw new ExportPlanError(
        'SELECTION_OUT_OF_RANGE',
        `页码应在 1–${pageCount} 之间。`,
      )
    }
    for (let page = start; page <= end; page += 1) selected.add(page)
  }

  const pages = [...selected].sort((left, right) => left - right)
  const ranges = collapsePagesToRanges(pages)
  const rangeLabel = ranges
    .map(({ start, end }) => (start === end ? `${start}` : `${start}–${end}`))
    .join('、')

  return {
    pages,
    ranges,
    label: `第 ${rangeLabel} 页`,
    inputValue: ranges
      .map(({ start, end }) => (start === end ? `${start}` : `${start}-${end}`))
      .join(', '),
  }
}

/** 缩略图点选与范围输入共用：始终按原稿页码升序去重。 */
export function togglePageSelection(
  selectedPages: readonly number[],
  pageNumber: number,
  pageCount: number,
): number[] {
  const pages = normalizePageNumbers(selectedPages, pageCount, true)
  assertPageNumber(pageNumber, pageCount)
  const next = new Set(pages)
  if (next.has(pageNumber)) next.delete(pageNumber)
  else next.add(pageNumber)
  return [...next].sort((left, right) => left - right)
}

export function formatPageSelection(
  selectedPages: readonly number[],
  pageCount: number,
): string {
  const pages = normalizePageNumbers(selectedPages, pageCount, true)
  return collapsePagesToRanges(pages)
    .map(({ start, end }) => (start === end ? `${start}` : `${start}-${end}`))
    .join(', ')
}

export function cleanDocumentName(sourceName: string): string {
  const withoutExtension = String(sourceName ?? '')
    .trim()
    .replace(/\.(?:md|txt)$/i, '')
  const cleaned = truncatePathSegment(
    sanitizePathSegment(withoutExtension),
    MAX_DOCUMENT_NAME_UTF8_BYTES,
  )
  return cleaned || DEFAULT_DOCUMENT_NAME
}

export function formatPageNumber(pageNumber: number, total: number): string {
  assertPositiveInteger(total, '原稿总页数')
  assertPageNumber(pageNumber, total)
  return String(pageNumber).padStart(Math.max(2, String(total).length), '0')
}

export function createFolderExportPlan({
  sourceName,
  pageCount,
  selectedPages,
  exportedAt = new Date(),
  collisionIndex = 1,
  ordinaryPostImageLimit = ORDINARY_POST_IMAGE_LIMIT,
  deliveryMode = EXPORT_DELIVERY_MODE.DIRECTORY,
}: CreateFolderExportPlanOptions): FolderExportPlan {
  assertPositiveInteger(pageCount, '原稿总页数')
  assertPositiveInteger(collisionIndex, '文件夹冲突序号')
  assertPositiveInteger(ordinaryPostImageLimit, '普通图文兼容上限')
  assertDeliveryMode(deliveryMode)

  const documentName = cleanDocumentName(sourceName)
  const pages = selectedPages == null
    ? Array.from({ length: pageCount }, (_, index) => index + 1)
    : normalizePageNumbers(selectedPages, pageCount, false)
  const mode = getExportScope(pages, pageCount)
  const timestamp = formatBeijingTimestamp(exportedAt)
  const folderBaseName = [
    documentName,
    getFolderScope(mode, pages, pageCount),
    `${pages.length}张`,
    timestamp,
  ].join('__')
  const folderName = collisionIndex === 1
    ? folderBaseName
    : `${folderBaseName}-${String(collisionIndex).padStart(2, '0')}`
  const files = pages.map<ExportPageFile>((pageNumber) => {
    const role: ExportPageRole = pageNumber === 1 ? 'cover' : 'inner'
    return {
      pageNumber,
      role,
      fileName: `${formatPageNumber(pageNumber, pageCount)}_${documentName}_${role}.png`,
    }
  })
  const manifest: ExportManifest = {
    schemaVersion: EXPORT_MANIFEST_SCHEMA_VERSION,
    documentTopic: documentName,
    sourcePageCount: pageCount,
    exportMode: mode,
    exportedPageCount: pages.length,
    sourcePages: [...pages],
    ordinaryPostCompatibility: {
      limit: ordinaryPostImageLimit,
      isCompatible: pages.length <= ordinaryPostImageLimit,
    },
    generatedAt: formatBeijingIso(exportedAt),
    deliveryMode,
    folderName,
    releaseCopyIncluded: false,
    files: files.map((file) => ({ ...file })),
  }
  const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`

  return {
    mode,
    folderName,
    pages,
    files,
    documentName,
    pageCount,
    timestamp,
    manifest,
    manifestJson,
    manifestFile: {
      fileName: EXPORT_MANIFEST_FILE_NAME,
      content: manifestJson,
    },
  }
}

export function recommendDeliveryMode(
  directoryPickerSupported: boolean,
): ExportDeliveryMode {
  return directoryPickerSupported
    ? EXPORT_DELIVERY_MODE.DIRECTORY
    : EXPORT_DELIVERY_MODE.COMPATIBILITY_ZIP
}

export function createZipArtifactName(
  suggestedName: string,
  fallbackFolderName: string,
  collisionIndex = 1,
): string {
  if (!fallbackFolderName.trim()) {
    throw new ExportPlanError('INVALID_FALLBACK_NAME', '缺少兼容 ZIP 的默认名称。')
  }
  assertPositiveInteger(collisionIndex, '重复导出序号')

  const safeName = truncatePathSegment(
    sanitizePathSegment(String(suggestedName ?? '')
      .trim()
      .replace(/\.zip$/i, '')),
    MAX_ZIP_BASE_NAME_UTF8_BYTES,
  )
  if (!safeName) return `${fallbackFolderName}.zip`
  const suffix = collisionIndex === 1
    ? ''
    : `-${String(collisionIndex).padStart(2, '0')}`
  return `${safeName}${suffix}.zip`
}

export function createDeliveryPlan(
  folderPlan: FolderExportPlan,
  mode: ExportDeliveryMode,
  options: { zipFileName?: string; collisionIndex?: number } = {},
): ExportDeliveryPlan {
  assertDeliveryMode(mode)
  if (folderPlan.manifest.deliveryMode !== mode) {
    throw new ExportPlanError(
      'DELIVERY_MODE_MISMATCH',
      '导出清单中的交付方式与当前导出方式不一致。',
    )
  }
  const childNames = [
    ...folderPlan.files.map(({ fileName }) => fileName),
    EXPORT_MANIFEST_FILE_NAME,
  ]
  return {
    mode,
    artifactName: mode === EXPORT_DELIVERY_MODE.DIRECTORY
      ? folderPlan.folderName
      : createZipArtifactName(
          options.zipFileName ?? '',
          folderPlan.folderName,
          options.collisionIndex,
        ),
    rootFolderName: folderPlan.folderName,
    childNames,
    entryPaths: childNames.map(
      (fileName) => `${folderPlan.folderName}/${fileName}`,
    ),
    pngCount: folderPlan.files.length,
    manifestFileName: EXPORT_MANIFEST_FILE_NAME,
    topLevelFolderCount: 1,
    isSplit: false,
  }
}

/** 根据已成功写入的原稿页码，只续写同一目录中的差集。 */
export function createDirectoryResumePlan(
  originalPlan: FolderExportPlan,
  completedPageNumbers: readonly number[] = [],
): DirectoryResumePlan {
  if (originalPlan.manifest.deliveryMode !== EXPORT_DELIVERY_MODE.DIRECTORY) {
    throw new ExportPlanError(
      'UNSUPPORTED_DELIVERY_MODE',
      '只有直接文件夹写入支持继续剩余页面。',
    )
  }
  const plannedPages = new Set(originalPlan.pages)
  const completed = normalizePageNumbers(
    completedPageNumbers,
    originalPlan.pageCount,
    true,
  )
  for (const pageNumber of completed) {
    if (!plannedPages.has(pageNumber)) {
      throw new ExportPlanError(
        'PAGE_NOT_IN_EXPORT_PLAN',
        `第 ${pageNumber} 页不在原导出计划中。`,
      )
    }
  }

  const completedSet = new Set(completed)
  const remaining = originalPlan.pages.filter((page) => !completedSet.has(page))
  const completedFiles = originalPlan.files
    .filter(({ pageNumber }) => completedSet.has(pageNumber))
    .map((file) => ({ ...file }))
  const remainingSet = new Set(remaining)
  const remainingFiles = originalPlan.files
    .filter(({ pageNumber }) => remainingSet.has(pageNumber))
    .map((file) => ({ ...file }))

  return {
    completed,
    remaining,
    completedFiles,
    remainingFiles,
    isComplete: remaining.length === 0,
    resumePlan: {
      folderName: originalPlan.folderName,
      pages: [...remaining],
      files: remainingFiles.map((file) => ({ ...file })),
    },
  }
}

function normalizePageNumbers(
  pageNumbers: readonly number[],
  pageCount: number,
  allowEmpty: boolean,
): number[] {
  assertPositiveInteger(pageCount, '原稿总页数')
  if (!Array.isArray(pageNumbers)) {
    throw new ExportPlanError('INVALID_PAGE_SELECTION', '导出页码必须是一组数字。')
  }
  if (!allowEmpty && pageNumbers.length === 0) {
    throw new ExportPlanError('EMPTY_SELECTION', '至少选择一页导出。')
  }
  const pages = [...new Set(pageNumbers)]
  for (const pageNumber of pages) assertPageNumber(pageNumber, pageCount)
  return pages.sort((left, right) => left - right)
}

function collapsePagesToRanges(pages: readonly number[]): ExportPageRange[] {
  const ranges: ExportPageRange[] = []
  for (const page of pages) {
    const previous = ranges.at(-1)
    if (previous && page === previous.end + 1) {
      previous.end = page
      previous.pages.push(page)
    } else {
      ranges.push({ start: page, end: page, pages: [page] })
    }
  }
  return ranges
}

function getExportScope(pages: readonly number[], pageCount: number): ExportScope {
  const isAll =
    pages.length === pageCount &&
    pages.every((pageNumber, index) => pageNumber === index + 1)
  if (isAll) return 'all'
  const isRange = pages.every(
    (pageNumber, index) => index === 0 || pageNumber === pages[index - 1] + 1,
  )
  return isRange ? 'range' : 'selection'
}

function getFolderScope(
  mode: ExportScope,
  pages: readonly number[],
  pageCount: number,
): string {
  if (mode === 'all') return '全部'
  if (mode === 'selection') return '自选'
  return `范围-p${formatPageNumber(pages[0], pageCount)}-p${formatPageNumber(pages.at(-1)!, pageCount)}`
}

function formatBeijingTimestamp(value: Date): string {
  const date = getBeijingDate(value)
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('') + '-' + [
    String(date.getUTCHours()).padStart(2, '0'),
    String(date.getUTCMinutes()).padStart(2, '0'),
    String(date.getUTCSeconds()).padStart(2, '0'),
  ].join('')
}

function formatBeijingIso(value: Date): string {
  const date = getBeijingDate(value)
  const day = [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-')
  const time = [
    String(date.getUTCHours()).padStart(2, '0'),
    String(date.getUTCMinutes()).padStart(2, '0'),
    String(date.getUTCSeconds()).padStart(2, '0'),
  ].join(':')
  return `${day}T${time}+08:00`
}

function getBeijingDate(value: Date): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new ExportPlanError('INVALID_EXPORT_TIME', '导出时间必须是有效日期。')
  }
  return new Date(value.getTime() + BEIJING_UTC_OFFSET_MS)
}

function sanitizePathSegment(value: string): string {
  const withoutControlCharacters = [...value]
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0
      return codePoint <= 31 || codePoint === 127 ? '-' : character
    })
    .join('')
  return withoutControlCharacters
    .replace(/[<>:"/\\|?*]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/-+/g, '-')
    .replace(/^[.\s-]+|[.\s-]+$/g, '')
}

function truncatePathSegment(value: string, maxUtf8Bytes: number): string {
  const encoder = new TextEncoder()
  let byteLength = 0
  let result = ''
  for (const character of value) {
    const characterBytes = encoder.encode(character).byteLength
    if (byteLength + characterBytes > maxUtf8Bytes) break
    result += character
    byteLength += characterBytes
  }
  return result.replace(/[.\s-]+$/g, '')
}

function assertPageNumber(pageNumber: number, pageCount: number): void {
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pageCount) {
    throw new ExportPlanError(
      'PAGE_OUT_OF_RANGE',
      `页码应在 1–${pageCount} 之间。`,
    )
  }
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new ExportPlanError('INVALID_POSITIVE_INTEGER', `${label}必须是正整数。`)
  }
}

function assertDeliveryMode(mode: string): asserts mode is ExportDeliveryMode {
  if (!Object.values(EXPORT_DELIVERY_MODE).includes(mode as ExportDeliveryMode)) {
    throw new ExportPlanError(
      'INVALID_DELIVERY_MODE',
      '导出方式必须是直接文件夹或兼容 ZIP。',
    )
  }
}
