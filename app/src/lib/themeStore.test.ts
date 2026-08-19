import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { BUILTIN_THEMES, type Theme } from './themes'
import { listUserThemes, putUserTheme } from './themeStore'

const records = new Map<string, unknown>()

function successfulRequest<T>(result: T): IDBRequest<T> {
  const request = {
    result,
    error: null,
    onsuccess: null,
    onerror: null,
  } as unknown as IDBRequest<T>
  queueMicrotask(() => request.onsuccess?.call(request, new Event('success')))
  return request
}

function createIndexedDbStub(): IDBFactory {
  const objectStore = {
    put(value: unknown) {
      const id = (value as { id: string }).id
      records.set(id, structuredClone(value))
      return successfulRequest<IDBValidKey>(id)
    },
    getAll() {
      return successfulRequest(
        [...records.values()].map((value) => structuredClone(value)),
      )
    },
    delete(id: IDBValidKey) {
      records.delete(String(id))
      return successfulRequest(undefined)
    },
  } as unknown as IDBObjectStore

  const database = {
    objectStoreNames: { contains: () => true },
    transaction: () => ({ objectStore: () => objectStore }),
  } as unknown as IDBDatabase

  return {
    open() {
      const request = {
        result: database,
        error: null,
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
      } as unknown as IDBOpenDBRequest
      queueMicrotask(() => request.onsuccess?.call(request, new Event('success')))
      return request
    },
  } as unknown as IDBFactory
}

function asLegacyTheme(theme: Theme): Record<string, unknown> {
  const legacy: Record<string, unknown> = { ...theme }
  delete legacy.coverBgAssetId
  delete legacy.coverTitleColor
  delete legacy.coverSubtitleColor
  delete legacy.coverLayout
  delete legacy.coverVertical
  delete legacy.coverSubtitleSpacing
  return legacy
}

describe('themeStore V2 normalization', () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      value: createIndexedDbStub(),
    })
  })

  beforeEach(() => records.clear())

  it('normalizes a legacy theme while reading it', async () => {
    records.set('legacy-dark', {
      ...asLegacyTheme(BUILTIN_THEMES[2]),
      id: 'legacy-dark',
      isBuiltin: false,
      createdAt: 10,
    })

    expect(await listUserThemes()).toEqual([
      expect.objectContaining({
        id: 'legacy-dark',
        coverBgAssetId: '',
        coverTitleColor: '#F0F0F0',
        coverSubtitleColor: '#F0F0F0',
        coverSubtitleSpacing: 'standard',
      }),
    ])
  })

  it('normalizes missing and invalid stored spacing to standard without dropping the theme', async () => {
    const missing = asLegacyTheme(BUILTIN_THEMES[0])
    records.set('legacy-missing-spacing', {
      ...missing,
      id: 'legacy-missing-spacing',
      isBuiltin: false,
      createdAt: 10,
    })
    records.set('legacy-invalid-spacing', {
      ...BUILTIN_THEMES[1],
      id: 'legacy-invalid-spacing',
      isBuiltin: false,
      createdAt: 20,
      coverSubtitleSpacing: 'tracking-12',
    })

    expect(await listUserThemes()).toEqual([
      expect.objectContaining({
        id: 'legacy-invalid-spacing',
        coverSubtitleSpacing: 'standard',
      }),
      expect.objectContaining({
        id: 'legacy-missing-spacing',
        coverSubtitleSpacing: 'standard',
      }),
    ])
  })

  it('stores a complete normalized theme on write', async () => {
    await putUserTheme({
      ...BUILTIN_THEMES[0],
      id: 'user-lowercase',
      isBuiltin: false,
      createdAt: 20,
      coverTitleColor: '#6d136c',
      coverSubtitleColor: '#5a465f',
      coverSubtitleSpacing: 'compact',
    })

    expect(records.get('user-lowercase')).toEqual(
      expect.objectContaining({
        coverBgAssetId: 'builtin-bg-xuan',
        coverTitleColor: '#6D136C',
        coverSubtitleColor: '#5A465F',
        coverSubtitleSpacing: 'compact',
      }),
    )

    expect(await listUserThemes()).toEqual([
      expect.objectContaining({
        id: 'user-lowercase',
        coverSubtitleSpacing: 'compact',
      }),
    ])
  })
})
