// 用户上传素材的 IndexedDB 存储层
// 设计：图片以 Blob 原样存（IndexedDB 支持二进制，比 base64 体积小 33%），
// 取用时转 object URL 给 <img src> 用。注意 URL 在会话内有效，组件卸载要 revoke。

import type { Asset } from './builtinAssets'

const DB_NAME = 'xhs-poster'
const DB_VERSION = 1
const STORE = 'user-assets'

export type AssetKind = 'background' | 'logo' | 'sticker'

// 存进 DB 的形态：blob + 元数据。读出后转 Asset 给上层用。
interface StoredAsset {
  id: string
  name: string
  kind: AssetKind
  blob: Blob
  createdAt: number
}

// 全局单例：避免每次操作都打开一次连接
let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('kind', 'kind', { unique: false })
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

// 已生成的 objectURL 缓存：同一个 id 多次取用返回同一个 URL，避免内存泄漏
const urlCache = new Map<string, string>()

function blobToUrl(id: string, blob: Blob): string {
  const cached = urlCache.get(id)
  if (cached) return cached
  const url = URL.createObjectURL(blob)
  urlCache.set(id, url)
  return url
}

function revokeUrl(id: string) {
  const url = urlCache.get(id)
  if (url) {
    URL.revokeObjectURL(url)
    urlCache.delete(id)
  }
}

export async function addUserAsset(
  kind: AssetKind,
  file: File,
): Promise<Asset> {
  const db = await openDB()
  const id = `user-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const stored: StoredAsset = {
    id,
    name: file.name,
    kind,
    blob: file,
    createdAt: Date.now(),
  }
  await new Promise<void>((resolve, reject) => {
    const req = tx(db, 'readwrite').add(stored)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
  return {
    id,
    name: file.name,
    src: blobToUrl(id, file),
    builtin: false,
  }
}

export async function listUserAssets(kind: AssetKind): Promise<Asset[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const index = tx(db, 'readonly').index('kind')
    const req = index.getAll(kind)
    req.onsuccess = () => {
      const list = (req.result as StoredAsset[])
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((s) => ({
          id: s.id,
          name: s.name,
          src: blobToUrl(s.id, s.blob),
          builtin: false,
        }))
      resolve(list)
    }
    req.onerror = () => reject(req.error)
  })
}

// 按 id 单独取一个素材（apply 主题时按 bgAssetId/logoAssetId 反查用）
// listUserAssets 是按 kind 索引，这里不限定 kind 直接走 keyPath
export async function getUserAssetById(id: string): Promise<Asset | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = tx(db, 'readonly').get(id)
    req.onsuccess = () => {
      const stored = req.result as StoredAsset | undefined
      if (!stored) return resolve(null)
      resolve({
        id: stored.id,
        name: stored.name,
        src: blobToUrl(stored.id, stored.blob),
        builtin: false,
      })
    }
    req.onerror = () => reject(req.error)
  })
}

export async function deleteUserAsset(id: string): Promise<void> {
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const req = tx(db, 'readwrite').delete(id)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
  revokeUrl(id)
}
