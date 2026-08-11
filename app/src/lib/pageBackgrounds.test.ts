import { describe, expect, it, vi } from 'vitest'
import {
  pageBackgroundIssuesForPageCount,
  resolvePageBackgrounds,
  type PageBackgroundResolver,
} from './pageBackgrounds'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

describe('resolvePageBackgrounds', () => {
  it('并行解析两个不同的底图 id', async () => {
    const cover = deferred<{ src: string; missing: boolean }>()
    const inner = deferred<{ src: string; missing: boolean }>()
    const resolver = vi.fn<PageBackgroundResolver>((assetId) =>
      assetId === 'cover' ? cover.promise : inner.promise,
    )

    const pending = resolvePageBackgrounds(
      { coverAssetId: 'cover', innerAssetId: 'inner' },
      resolver,
    )

    expect(resolver).toHaveBeenCalledTimes(2)
    expect(resolver).toHaveBeenCalledWith('cover', 'background')
    expect(resolver).toHaveBeenCalledWith('inner', 'background')
    cover.resolve({ src: '/cover.png', missing: false })
    inner.resolve({ src: '/inner.png', missing: false })

    await expect(pending).resolves.toEqual({
      coverSrc: '/cover.png',
      innerSrc: '/inner.png',
      issues: [],
    })
  })

  it('同一 assetId 只读取一次并共用结果', async () => {
    const resolver = vi.fn<PageBackgroundResolver>(async () => ({
      src: '/shared.png',
      missing: false,
    }))

    await expect(
      resolvePageBackgrounds(
        { coverAssetId: 'shared', innerAssetId: 'shared' },
        resolver,
      ),
    ).resolves.toEqual({
      coverSrc: '/shared.png',
      innerSrc: '/shared.png',
      issues: [],
    })
    expect(resolver).toHaveBeenCalledTimes(1)
  })

  it('显式空 id 是纯色，不读取也不交叉 fallback', async () => {
    const resolver = vi.fn<PageBackgroundResolver>(async (assetId) => ({
      src: `/${assetId}.png`,
      missing: false,
    }))

    const coverPureColor = await resolvePageBackgrounds(
      { coverAssetId: '', innerAssetId: 'inner' },
      resolver,
    )
    const innerPureColor = await resolvePageBackgrounds(
      { coverAssetId: 'cover', innerAssetId: '' },
      resolver,
    )

    expect(coverPureColor).toEqual({
      coverSrc: '',
      innerSrc: '/inner.png',
      issues: [],
    })
    expect(innerPureColor).toEqual({
      coverSrc: '/cover.png',
      innerSrc: '',
      issues: [],
    })
    expect(resolver).toHaveBeenCalledTimes(2)
    expect(resolver).not.toHaveBeenCalledWith('', 'background')
  })

  it('非空 Cover 缺失时借用 Inner，但保留 Cover issue', async () => {
    const resolver = vi.fn<PageBackgroundResolver>(async (assetId) =>
      assetId === 'cover'
        ? { src: '', missing: true }
        : { src: '/inner.png', missing: false },
    )

    const result = await resolvePageBackgrounds(
      { coverAssetId: 'cover', innerAssetId: 'inner' },
      resolver,
    )

    expect(result.coverSrc).toBe('/inner.png')
    expect(result.innerSrc).toBe('/inner.png')
    expect(result.issues).toEqual([
      {
        id: 'background:cover:cover',
        role: 'cover',
        assetId: 'cover',
        kind: 'missing',
        label: '首图背景',
        message: '素材已经被删除或暂时无法读取',
      },
    ])
  })

  it('非空 Inner 读取报错时借用 Cover，并保留可单独重试信息', async () => {
    const resolver = vi.fn<PageBackgroundResolver>(async (assetId) => {
      if (assetId === 'inner') throw new Error('IndexedDB 暂时不可用')
      return { src: '/cover.png', missing: false }
    })

    const result = await resolvePageBackgrounds(
      { coverAssetId: 'cover', innerAssetId: 'inner' },
      resolver,
    )

    expect(result.coverSrc).toBe('/cover.png')
    expect(result.innerSrc).toBe('/cover.png')
    expect(result.issues).toEqual([
      expect.objectContaining({
        id: 'background:inner:inner',
        role: 'inner',
        assetId: 'inner',
        kind: 'load-error',
        label: '内页背景',
        message: 'IndexedDB 暂时不可用',
      }),
    ])
  })

  it('双缺失时回退纯色，并分角色报告问题', async () => {
    const resolver = vi.fn<PageBackgroundResolver>(async () => ({
      src: '',
      missing: true,
    }))

    const result = await resolvePageBackgrounds(
      { coverAssetId: 'cover', innerAssetId: 'inner' },
      resolver,
    )

    expect(result.coverSrc).toBe('')
    expect(result.innerSrc).toBe('')
    expect(result.issues.map(({ role, assetId }) => ({ role, assetId }))).toEqual([
      { role: 'cover', assetId: 'cover' },
      { role: 'inner', assetId: 'inner' },
    ])
  })

  it('同 id 缺失仍按角色报告，但不重复读取', async () => {
    const resolver = vi.fn<PageBackgroundResolver>(async () => ({
      src: '',
      missing: true,
    }))

    const result = await resolvePageBackgrounds(
      { coverAssetId: 'shared', innerAssetId: 'shared' },
      resolver,
    )

    expect(resolver).toHaveBeenCalledOnce()
    expect(result.issues.map((issue) => issue.role)).toEqual(['cover', 'inner'])
  })
})

describe('pageBackgroundIssuesForPageCount', () => {
  it('单页只忽略未使用的 Inner issue', async () => {
    const result = await resolvePageBackgrounds(
      { coverAssetId: 'cover', innerAssetId: 'inner' },
      async (assetId) =>
        assetId === 'cover'
          ? { src: '/cover.png', missing: false }
          : { src: '', missing: true },
    )

    expect(result.issues).toEqual([
      expect.objectContaining({ role: 'inner' }),
    ])
    expect(pageBackgroundIssuesForPageCount(result.issues, 1)).toEqual([])
    expect(pageBackgroundIssuesForPageCount(result.issues, 2)).toEqual(
      result.issues,
    )
  })
})
