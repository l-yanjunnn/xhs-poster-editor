// 用户主题的 IndexedDB 存储层
// 独立 DB（xhs-poster-themes），与素材/字体 DB 解耦
// Theme.contentJSON 直接存对象，IndexedDB 原生支持结构化克隆

import type { Theme } from './themes'

const DB_NAME = 'xhs-poster-themes'
const DB_VERSION = 1
const STORE = 'user-themes'

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
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

// put 而非 add：同 id 直接覆盖（rename / 重新保存）
export async function putUserTheme(theme: Theme): Promise<void> {
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const req = tx(db, 'readwrite').put(theme)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

export async function listUserThemes(): Promise<Theme[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = tx(db, 'readonly').getAll()
    req.onsuccess = () => {
      const list = (req.result as Theme[]).sort(
        (a, b) => b.createdAt - a.createdAt,
      )
      resolve(list)
    }
    req.onerror = () => reject(req.error)
  })
}

export async function deleteUserTheme(id: string): Promise<void> {
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const req = tx(db, 'readwrite').delete(id)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

export function newUserThemeId(): string {
  return `user-theme-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
