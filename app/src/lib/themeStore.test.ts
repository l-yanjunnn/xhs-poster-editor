import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { BUILTIN_THEMES, type Theme } from './themes'
import { listUserThemes, putUserTheme } from './themeStore'
import { SYSTEM_FONT_STACK } from './fontPresets'

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
    transaction: () => {
      const transaction = new EventTarget()
      Object.assign(objectStore, { transaction })
      queueMicrotask(() => queueMicrotask(() => transaction.dispatchEvent(new Event('complete'))))
      return Object.assign(transaction, { objectStore: () => objectStore })
    },
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
  delete legacy.coverTitleFontSize
  delete legacy.coverTitleFontFamily
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
        coverTitleFontSize: undefined,
        coverTitleFontFamily: undefined,
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
      coverTitleFontSize: 126,
    })

    expect(records.get('user-lowercase')).toEqual(
      expect.objectContaining({
        coverBgAssetId: 'builtin-bg-xuan',
        coverTitleColor: '#6D136C',
        coverSubtitleColor: '#5A465F',
        coverSubtitleSpacing: 'compact',
        coverTitleFontSize: 126,
        coverTitleFontFamily: SYSTEM_FONT_STACK,
        contentJSON: null,
      }),
    )

    expect(await listUserThemes()).toEqual([
      expect.objectContaining({
        id: 'user-lowercase',
        coverSubtitleSpacing: 'compact',
        coverTitleFontSize: 126,
        coverTitleFontFamily: SYSTEM_FONT_STACK,
      }),
    ])
  })

  it('normalizes an invalid stored cover size to follow while retaining legacy theme content', async () => {
    const contentJSON = {
      type: 'doc',
      content: [{
        type: 'heading',
        attrs: { level: 1 },
        content: [{
          type: 'text',
          text: '历史含正文主题',
          marks: [{ type: 'textHighlight', attrs: { color: '#7B3B8B', opacity: 0.25 } }],
        }],
      }],
    }
    records.set('legacy-content-theme', {
      ...BUILTIN_THEMES[0],
      id: 'legacy-content-theme',
      isBuiltin: false,
      coverTitleFontSize: '126px',
      contentJSON,
    })

    const [restored] = await listUserThemes()
    expect(restored.coverTitleFontSize).toBeUndefined()
    expect(restored.contentJSON).toEqual(contentJSON)
    expect(restored.fontSize).toBe(BUILTIN_THEMES[0].fontSize)
  })

  it('keeps legacy elegant snapshots unchanged instead of applying renamed built-in defaults', async () => {
    const legacy = {
      ...asLegacyTheme(BUILTIN_THEMES[0]),
      id: 'user-old-elegant',
      name: '雅致',
      isBuiltin: false,
      coverVertical: 'top',
    }
    records.set(legacy.id, structuredClone(legacy))

    const [restored] = await listUserThemes()
    expect(restored).toMatchObject({ name: '雅致', coverVertical: 'top', fontH1: BUILTIN_THEMES[0].fontH1 })
    expect(restored.coverTitleFontFamily).toBeUndefined()
    expect(records.get(legacy.id)).toEqual(legacy)
  })

  it('round-trips a custom cover font and clears it when the theme follows H1 again', async () => {
    const theme: Theme = {
      ...BUILTIN_THEMES[0],
      id: 'user-cover-font',
      isBuiltin: false,
      coverTitleFontFamily: '"user-font-123", sans-serif',
    }
    await putUserTheme(theme)
    expect((await listUserThemes())[0].coverTitleFontFamily).toBe(theme.coverTitleFontFamily)

    await putUserTheme({ ...theme, coverTitleFontFamily: undefined })
    expect((await listUserThemes())[0].coverTitleFontFamily).toBeUndefined()
    expect((await listUserThemes())[0].fontH1).toBe(theme.fontH1)
  })
})
