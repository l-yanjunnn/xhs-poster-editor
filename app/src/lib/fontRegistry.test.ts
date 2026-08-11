import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearTypographyMetricsCache } from './typographyMetrics'
import {
  getFontRegistryRevision,
  registerFontFromBlob,
  subscribeFontRegistryRevision,
  unregisterFont,
} from './fontRegistry'

vi.mock('./fontStore', () => ({ listUserFonts: vi.fn() }))
vi.mock('./typographyMetrics', () => ({
  clearTypographyMetricsCache: vi.fn(),
}))

const mockedClearMetrics = vi.mocked(clearTypographyMetricsCache)
const addFont = vi.fn()
const deleteFont = vi.fn(() => true)
const createObjectUrl = vi.fn(() => 'blob:font-test')
const revokeObjectUrl = vi.fn()
let nextLoad: () => Promise<FontFace>
let familySequence = 0

class MockFontFace {
  readonly family: string
  readonly source: ArrayBuffer

  constructor(family: string, source: ArrayBuffer) {
    this.family = family
    this.source = source
  }

  load(): Promise<FontFace> {
    return nextLoad()
  }
}

function uniqueFamily(label: string): string {
  familySequence += 1
  return `${label}-${familySequence}`
}

beforeEach(() => {
  vi.clearAllMocks()
  nextLoad = async () => ({}) as FontFace
  vi.stubGlobal('FontFace', MockFontFace)
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { add: addFont, delete: deleteFont },
  })
  Object.defineProperties(URL, {
    createObjectURL: { configurable: true, value: createObjectUrl },
    revokeObjectURL: { configurable: true, value: revokeObjectUrl },
  })
})

describe('font registry revision', () => {
  it('注册成功后清理度量缓存并通知订阅者', async () => {
    const before = getFontRegistryRevision()
    const listener = vi.fn()
    const unsubscribe = subscribeFontRegistryRevision(listener)

    await registerFontFromBlob(uniqueFamily('fresh'), new Blob(['font']))

    expect(getFontRegistryRevision()).toBe(before + 1)
    expect(mockedClearMetrics).toHaveBeenCalledTimes(1)
    expect(mockedClearMetrics).toHaveBeenCalledWith()
    expect(addFont).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  it('同 family 覆盖也递增 revision，并删除旧 face/回收旧 URL', async () => {
    const family = uniqueFamily('replace')
    createObjectUrl
      .mockReturnValueOnce('blob:font-old')
      .mockReturnValueOnce('blob:font-new')
    await registerFontFromBlob(family, new Blob(['old']))
    const firstFace = addFont.mock.calls[0][0]
    const beforeReplace = getFontRegistryRevision()
    vi.clearAllMocks()
    createObjectUrl.mockReturnValue('blob:font-new')

    await registerFontFromBlob(family, new Blob(['new']))

    expect(getFontRegistryRevision()).toBe(beforeReplace + 1)
    expect(deleteFont).toHaveBeenCalledWith(firstFace)
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:font-old')
    expect(mockedClearMetrics).toHaveBeenCalledTimes(1)
  })

  it('FontFace.load 失败时不改 registry，也不产生假 revision', async () => {
    const before = getFontRegistryRevision()
    nextLoad = async () => {
      throw new Error('broken font')
    }

    await expect(
      registerFontFromBlob(uniqueFamily('broken'), new Blob(['bad'])),
    ).rejects.toThrow('broken font')

    expect(getFontRegistryRevision()).toBe(before)
    expect(addFont).not.toHaveBeenCalled()
    expect(createObjectUrl).not.toHaveBeenCalled()
    expect(mockedClearMetrics).not.toHaveBeenCalled()
  })

  it('删除真实字体时递增一次，重复删除不递增', async () => {
    const family = uniqueFamily('remove')
    await registerFontFromBlob(family, new Blob(['font']))
    const beforeDelete = getFontRegistryRevision()
    vi.clearAllMocks()

    unregisterFont(family)

    expect(getFontRegistryRevision()).toBe(beforeDelete + 1)
    expect(mockedClearMetrics).toHaveBeenCalledTimes(1)
    expect(deleteFont).toHaveBeenCalledTimes(1)
    expect(revokeObjectUrl).toHaveBeenCalledTimes(1)

    vi.clearAllMocks()
    unregisterFont(family)
    expect(getFontRegistryRevision()).toBe(beforeDelete + 1)
    expect(mockedClearMetrics).not.toHaveBeenCalled()
  })

  it('取消订阅后不再接收 mutation 通知', async () => {
    const listener = vi.fn()
    const unsubscribe = subscribeFontRegistryRevision(listener)
    unsubscribe()

    await registerFontFromBlob(uniqueFamily('unsubscribed'), new Blob(['font']))

    expect(listener).not.toHaveBeenCalled()
  })
})
