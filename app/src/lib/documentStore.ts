import type {
  DensityLevel,
  H1Width,
  LogoStrategy,
  OverlayKey,
  ThemeKey,
} from './themes'

export const EDITOR_DOCUMENT_SCHEMA_VERSION = 1 as const

/**
 * A document owns a style snapshot. Themes remain reusable style presets and
 * are deliberately not used as the persistence layer for editable work.
 */
export interface EditorDocumentStyleV1 {
  themeClass: ThemeKey
  overlay: OverlayKey
  h1Width: H1Width
  fontH1: string
  fontH2: string
  fontH3: string
  fontBody: string
  h1Bold: boolean
  h2Bold: boolean
  h3Bold: boolean
  fontSize: number
  density: DensityLevel
  logoStrategy: LogoStrategy
  bgAssetId: string
  logoAssetId: string
}

export interface EditorDocumentV1 {
  schemaVersion: typeof EDITOR_DOCUMENT_SCHEMA_VERSION
  id: string
  /** 唯一写前日志 id；IDB 提交与 localStorage 清理必须按它精确匹配。 */
  recoveryId: string
  /** 同一文档内严格递增；启动时据此区分旧日志与未提交的新快照。 */
  revision: number
  title: string
  createdAt: number
  updatedAt: number
  contentJSON: object
  style: EditorDocumentStyleV1
}

const DB_NAME = 'xhs-poster-documents'
const DB_VERSION = 1
const DOCUMENTS_STORE = 'documents'
const META_STORE = 'meta'
const ACTIVE_DOCUMENT_KEY = 'active-document-id'
const RECOVERY_STORAGE_KEY = 'xhs-poster-active-document-recovery-v1'
const VALID_THEME_CLASSES = new Set<ThemeKey>([
  '',
  'theme-minimal-white',
  'theme-dark-night',
])
const VALID_OVERLAYS = new Set<OverlayKey>([
  'none',
  'light-30',
  'light-60',
  'dark-30',
  'dark-60',
  'dark-80',
])
const VALID_H1_WIDTHS = new Set<H1Width>(['50%', '66%', '80%', '100%'])
const VALID_DENSITIES = new Set<DensityLevel>([
  'compact',
  'normal',
  'relaxed',
  'loose',
])
const VALID_LOGO_STRATEGIES = new Set<LogoStrategy>([
  'every',
  'first',
  'first-last',
  'none',
])

interface StoredMeta {
  key: string
  value: string
}

export interface DocumentStoreBackend {
  put: (document: EditorDocumentV1, makeActive: boolean) => Promise<void>
  list: () => Promise<unknown[]>
  get: (id: string) => Promise<unknown | undefined>
  getActiveId: () => Promise<string | null>
  setActiveId: (id: string | null) => Promise<void>
  delete: (id: string) => Promise<void>
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(DOCUMENTS_STORE)) {
        const documents = db.createObjectStore(DOCUMENTS_STORE, {
          keyPath: 'id',
        })
        documents.createIndex('updatedAt', 'updatedAt', { unique: false })
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' })
      }
    }

    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => {
        db.close()
        dbPromise = null
      }
      resolve(db)
    }
    request.onerror = () => {
      dbPromise = null
      reject(request.error ?? new Error('无法打开草稿数据库'))
    }
    request.onblocked = () => {
      dbPromise = null
      reject(new Error('草稿数据库升级被其他页面阻塞，请关闭其他编辑器页面后重试'))
    }
  })

  return dbPromise
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('草稿数据库写入失败'))
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('草稿数据库写入已中止'))
  })
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error('草稿数据库读取失败'))
  })
}

function parseStoredDocument(value: unknown): EditorDocumentV1 {
  if (!value || typeof value !== 'object') {
    throw new Error('草稿数据损坏：无法识别文档内容')
  }

  const document = value as Partial<EditorDocumentV1>
  if (document.schemaVersion !== EDITOR_DOCUMENT_SCHEMA_VERSION) {
    throw new Error(
      `暂不支持草稿版本 ${String(document.schemaVersion)}，请使用更新版编辑器打开`,
    )
  }
  if (
    typeof document.id !== 'string' ||
    typeof document.recoveryId !== 'string' ||
    !document.recoveryId ||
    typeof document.revision !== 'number' ||
    !Number.isSafeInteger(document.revision) ||
    document.revision < 0 ||
    typeof document.title !== 'string' ||
    typeof document.createdAt !== 'number' ||
    typeof document.updatedAt !== 'number' ||
    !document.contentJSON ||
    typeof document.contentJSON !== 'object' ||
    !document.style ||
    typeof document.style !== 'object'
  ) {
    throw new Error('草稿数据损坏：缺少必要字段')
  }

  const style = document.style as Partial<EditorDocumentStyleV1>
  const stringFields: (keyof EditorDocumentStyleV1)[] = [
    'themeClass',
    'overlay',
    'h1Width',
    'fontH1',
    'fontH2',
    'fontH3',
    'fontBody',
    'density',
    'logoStrategy',
    'bgAssetId',
    'logoAssetId',
  ]
  const booleanFields: (keyof EditorDocumentStyleV1)[] = [
    'h1Bold',
    'h2Bold',
    'h3Bold',
  ]
  if (
    stringFields.some((field) => typeof style[field] !== 'string') ||
    booleanFields.some((field) => typeof style[field] !== 'boolean') ||
    typeof style.fontSize !== 'number' ||
    !Number.isFinite(style.fontSize) ||
    style.fontSize < 12 ||
    style.fontSize > 120
  ) {
    throw new Error('草稿数据损坏：样式字段不完整')
  }
  if (
    !VALID_THEME_CLASSES.has(style.themeClass as ThemeKey) ||
    !VALID_OVERLAYS.has(style.overlay as OverlayKey) ||
    !VALID_H1_WIDTHS.has(style.h1Width as H1Width) ||
    !VALID_DENSITIES.has(style.density as DensityLevel) ||
    !VALID_LOGO_STRATEGIES.has(style.logoStrategy as LogoStrategy)
  ) {
    throw new Error('草稿数据损坏：样式枚举值无效')
  }

  return document as EditorDocumentV1
}

/** Save a complete document snapshot and make it the last active document atomically. */
async function putIndexedDbDocument(
  document: EditorDocumentV1,
  makeActive = true,
): Promise<void> {
  // Validate before IndexedDB structured-clones it so bad snapshots fail loudly.
  parseStoredDocument(document)
  const db = await openDB()
  const stores = makeActive
    ? [DOCUMENTS_STORE, META_STORE]
    : [DOCUMENTS_STORE]
  const transaction = db.transaction(stores, 'readwrite')
  transaction.objectStore(DOCUMENTS_STORE).put(document)
  if (makeActive) {
    transaction.objectStore(META_STORE).put({
      key: ACTIVE_DOCUMENT_KEY,
      value: document.id,
    } satisfies StoredMeta)
  }
  await transactionDone(transaction)
}

async function listIndexedDbDocuments(): Promise<unknown[]> {
  const db = await openDB()
  const transaction = db.transaction(DOCUMENTS_STORE, 'readonly')
  const values = await requestResult(
    transaction.objectStore(DOCUMENTS_STORE).getAll(),
  )
  return values
}

async function getIndexedDbDocument(id: string): Promise<unknown | undefined> {
  const db = await openDB()
  const transaction = db.transaction(DOCUMENTS_STORE, 'readonly')
  const value = await requestResult(
    transaction.objectStore(DOCUMENTS_STORE).get(id),
  )
  return value
}

async function getIndexedDbActiveDocumentId(): Promise<string | null> {
  const db = await openDB()
  const transaction = db.transaction(META_STORE, 'readonly')
  const meta = (await requestResult(
    transaction.objectStore(META_STORE).get(ACTIVE_DOCUMENT_KEY),
  )) as StoredMeta | undefined
  return meta?.value ?? null
}

async function setIndexedDbActiveDocumentId(id: string | null): Promise<void> {
  const db = await openDB()
  const transaction = db.transaction(META_STORE, 'readwrite')
  const store = transaction.objectStore(META_STORE)
  if (id) {
    store.put({ key: ACTIVE_DOCUMENT_KEY, value: id } satisfies StoredMeta)
  } else {
    store.delete(ACTIVE_DOCUMENT_KEY)
  }
  await transactionDone(transaction)
}

async function deleteIndexedDbDocument(id: string): Promise<void> {
  const db = await openDB()
  const transaction = db.transaction(
    [DOCUMENTS_STORE, META_STORE],
    'readwrite',
  )
  transaction.objectStore(DOCUMENTS_STORE).delete(id)

  const metaStore = transaction.objectStore(META_STORE)
  const activeRequest = metaStore.get(ACTIVE_DOCUMENT_KEY)
  activeRequest.onsuccess = () => {
    const active = activeRequest.result as StoredMeta | undefined
    if (active?.value === id) metaStore.delete(ACTIVE_DOCUMENT_KEY)
  }
  await transactionDone(transaction)
}

const indexedDbBackend: DocumentStoreBackend = {
  put: putIndexedDbDocument,
  list: listIndexedDbDocuments,
  get: getIndexedDbDocument,
  getActiveId: getIndexedDbActiveDocumentId,
  setActiveId: setIndexedDbActiveDocumentId,
  delete: deleteIndexedDbDocument,
}

let backendOverride: DocumentStoreBackend | null = null

function backend(): DocumentStoreBackend {
  return backendOverride ?? indexedDbBackend
}

export async function putEditorDocument(
  document: EditorDocumentV1,
  makeActive = true,
): Promise<void> {
  parseStoredDocument(document)
  await backend().put(document, makeActive)
}

export async function listEditorDocuments(): Promise<EditorDocumentV1[]> {
  const documents: EditorDocumentV1[] = []
  for (const value of await backend().list()) {
    try {
      documents.push(parseStoredDocument(value))
    } catch (error) {
      // 单条未来 schema / 损坏记录不能阻断其余健康草稿恢复。
      // 保留原记录，不在读取路径里擅自删除，方便未来版本迁移或人工诊断。
      console.warn('跳过无法读取的草稿记录', error)
    }
  }
  return documents.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function getEditorDocument(
  id: string,
): Promise<EditorDocumentV1 | null> {
  const value = await backend().get(id)
  return value === undefined ? null : parseStoredDocument(value)
}

export async function getActiveDocumentId(): Promise<string | null> {
  return backend().getActiveId()
}

export async function getActiveEditorDocument(): Promise<EditorDocumentV1 | null> {
  const id = await getActiveDocumentId()
  if (!id) return null
  try {
    return await getEditorDocument(id)
  } catch (error) {
    // 活动指针若恰好指向损坏记录，App 仍可从健康草稿列表回退恢复。
    console.warn('活动草稿无法读取，将尝试恢复其他草稿', error)
    return null
  }
}

export async function setActiveDocumentId(id: string | null): Promise<void> {
  await backend().setActiveId(id)
}

export async function deleteEditorDocument(id: string): Promise<void> {
  await backend().delete(id)
}

export function newEditorDocumentId(): string {
  return `document-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function newEditorDocumentRecoveryId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `recovery-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function describeDocumentStoreError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'QuotaExceededError') {
      return '浏览器存储空间不足，草稿未能保存'
    }
    if (error.name === 'SecurityError') {
      return '浏览器阻止了本地存储，请检查隐私模式或站点权限'
    }
  }
  return error instanceof Error ? error.message : '草稿存储发生未知错误'
}

/**
 * 同步恢复日志只兜底“最后一次 IDB 防抖尚未完成就关页”的窗口。
 * IndexedDB 仍是草稿主存储；日志在对应快照落盘后立即清除。
 */
export function writeEditorDocumentRecovery(
  document: EditorDocumentV1,
): boolean {
  try {
    parseStoredDocument(document)
    const serialized = JSON.stringify(document)
    // assetId/blob URL 正常很小；超大 data URL 不应在每次按键时同步阻塞主线程。
    if (serialized.length > 1_000_000) {
      console.warn('草稿恢复日志超过 1MB，跳过同步保护并继续使用 IndexedDB')
      try {
        localStorage.removeItem(RECOVERY_STORAGE_KEY)
      } catch {
        // 正式 IDB 保存仍会继续；关键是不能让旧 WAL 冒充这次新编辑。
      }
      return false
    }
    localStorage.setItem(RECOVERY_STORAGE_KEY, serialized)
    return true
  } catch (error) {
    // 极大 base64 正文可能超过 localStorage 配额；不能因此阻断正常 IDB 保存。
    console.warn('无法写入草稿恢复日志，将继续使用 IndexedDB 自动保存', error)
    try {
      localStorage.removeItem(RECOVERY_STORAGE_KEY)
    } catch {
      // 同上：清理失败时也不阻断 IndexedDB 主路径。
    }
    return false
  }
}

export function readEditorDocumentRecovery(): EditorDocumentV1 | null {
  try {
    const raw = localStorage.getItem(RECOVERY_STORAGE_KEY)
    if (!raw) return null
    return parseStoredDocument(JSON.parse(raw))
  } catch (error) {
    console.warn('草稿恢复日志损坏，已忽略', error)
    try {
      localStorage.removeItem(RECOVERY_STORAGE_KEY)
    } catch {
      // 隐私模式下 localStorage 自身也可能不可用；读取路径保持可恢复。
    }
    return null
  }
}

/** 只清掉与已落盘 recoveryId 完全一致的日志，旧写入永不误删新编辑。 */
export function clearEditorDocumentRecovery(
  documentId: string,
  committedRecoveryId: string,
): void {
  try {
    const raw = localStorage.getItem(RECOVERY_STORAGE_KEY)
    if (!raw) return
    const recovery = parseStoredDocument(JSON.parse(raw))
    if (
      recovery.id === documentId &&
      recovery.recoveryId === committedRecoveryId
    ) {
      localStorage.removeItem(RECOVERY_STORAGE_KEY)
    }
  } catch (error) {
    console.warn('清理草稿恢复日志失败', error)
  }
}

/** 用户明确删除草稿时，丢弃该文档尚未提交的恢复日志，防止下次启动复活。 */
export function discardEditorDocumentRecovery(documentId: string): void {
  try {
    const raw = localStorage.getItem(RECOVERY_STORAGE_KEY)
    if (!raw) return
    const recovery = parseStoredDocument(JSON.parse(raw))
    if (recovery.id === documentId) {
      localStorage.removeItem(RECOVERY_STORAGE_KEY)
    }
  } catch (error) {
    console.warn('丢弃草稿恢复日志失败', error)
  }
}

/** @internal Injects a deterministic backend without relying on browser IDB in unit tests. */
export function setDocumentStoreBackendForTests(
  testBackend: DocumentStoreBackend | null,
): void {
  backendOverride = testBackend
}

/** @internal Test isolation for the real IndexedDB CRUD suite. */
export async function resetDocumentStoreForTests(): Promise<void> {
  if (dbPromise) {
    try {
      const db = await dbPromise
      db.close()
    } catch {
      // A rejected open has no connection to close.
    }
    dbPromise = null
  }

  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('测试数据库删除被阻塞'))
  })
}
