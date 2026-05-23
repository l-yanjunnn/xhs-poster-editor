// 用户字体的 IndexedDB 存储层
// 设计：用单独 DB（xhs-poster-fonts）避免动到 xhs-poster 已有的素材 DB 版本号。
// keyPath = family，同 family 上传会直接覆盖（put 语义），符合直觉。

const DB_NAME = 'xhs-poster-fonts'
const DB_VERSION = 1
const STORE = 'user-fonts'

export interface StoredFont {
  family: string
  fileName: string
  blob: Blob
  createdAt: number
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'family' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function tx(db: IDBDatabase, mode: IDBTransactionMode) {
  return db.transaction(STORE, mode).objectStore(STORE)
}

// 文件名 → 默认 family：去后缀、trim
export function fileNameToFamily(fileName: string): string {
  return fileName.replace(/\.(ttf|otf|woff2?|ttc)$/i, '').trim()
}

// put 而非 add：同 family 覆盖
export async function putUserFont(family: string, file: File): Promise<StoredFont> {
  const db = await openDB()
  const stored: StoredFont = {
    family,
    fileName: file.name,
    blob: file,
    createdAt: Date.now(),
  }
  await new Promise<void>((resolve, reject) => {
    const req = tx(db, 'readwrite').put(stored)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
  return stored
}

export async function listUserFonts(): Promise<StoredFont[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = tx(db, 'readonly').getAll()
    req.onsuccess = () => {
      const list = (req.result as StoredFont[]).sort(
        (a, b) => b.createdAt - a.createdAt,
      )
      resolve(list)
    }
    req.onerror = () => reject(req.error)
  })
}

export async function deleteUserFont(family: string): Promise<void> {
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const req = tx(db, 'readwrite').delete(family)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}
