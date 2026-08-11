import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BUILTIN_THEMES, type Theme } from '@/lib/themes'
import { resolveAssetSrc } from '@/lib/resolveAsset'
import { resolvePageBackgrounds } from '@/lib/pageBackgrounds'
import { ThemePreview } from './ThemePreview'

vi.mock('@/lib/resolveAsset', () => ({
  resolveAssetSrc: vi.fn(),
}))
vi.mock('@/lib/pageBackgrounds', () => ({
  resolvePageBackgrounds: vi.fn(),
}))

type ReactActGlobal = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
;(globalThis as ReactActGlobal).IS_REACT_ACT_ENVIRONMENT = true

const mockedResolveAssetSrc = vi.mocked(resolveAssetSrc)
const mockedResolvePageBackgrounds = vi.mocked(resolvePageBackgrounds)
const mounted: Array<{ host: HTMLDivElement; root: Root }> = []

function publicExamTheme(overrides: Partial<Theme> = {}): Theme {
  const theme = BUILTIN_THEMES.find(
    (candidate) => candidate.id === 'builtin-public-exam-landscape',
  )
  if (!theme) throw new Error('缺少公考内置主题')
  return { ...theme, ...overrides }
}

async function mountThemePreview(theme: Theme) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(createElement(ThemePreview, { theme }))
  })
  const result = { host, root }
  mounted.push(result)
  return result
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

beforeEach(() => {
  mockedResolveAssetSrc.mockReset()
  mockedResolvePageBackgrounds.mockReset()
})

afterEach(async () => {
  for (const item of mounted.splice(0)) {
    await act(async () => item.root.unmount())
    item.host.remove()
  }
})

describe('ThemePreview cover semantics', () => {
  it('用 cover asset 渲染首页，注入主副标题色并展示公考封面文案', async () => {
    mockedResolveAssetSrc.mockResolvedValue('')
    const theme = publicExamTheme({
      coverTitleColor: '#123456',
      coverSubtitleColor: '#654321',
    })
    mockedResolvePageBackgrounds.mockResolvedValue({
      coverSrc: `/resolved/${theme.coverBgAssetId}.png`,
      innerSrc: `/resolved/${theme.bgAssetId}.png`,
      issues: [],
    })
    const { host } = await mountThemePreview(theme)

    expect(mockedResolvePageBackgrounds).toHaveBeenCalledWith({
      coverAssetId: theme.coverBgAssetId,
      innerAssetId: theme.bgAssetId,
    })
    expect(host.querySelector<HTMLImageElement>('img.bg')?.getAttribute('src')).toBe(
      `/resolved/${theme.coverBgAssetId}.png`,
    )

    const variableScope = host.querySelector<HTMLElement>('.page')?.parentElement
    expect(variableScope?.style.getPropertyValue('--c-cover-title')).toBe(
      '#123456',
    )
    expect(variableScope?.style.getPropertyValue('--c-cover-subtitle')).toBe(
      '#654321',
    )
    const heading = host.querySelector('.content > h1')
    expect(heading?.textContent).toBe('申论高分方法')
    expect(heading?.nextElementSibling?.tagName).toBe('P')
    expect(heading?.nextElementSibling?.textContent).toContain('公考上岸')
  })

  it('切换主题时立即清空旧 src，且慢请求不会覆盖新结果', async () => {
    const slow = deferred<{
      coverSrc: string
      innerSrc: string
      issues: []
    }>()
    const latest = deferred<{
      coverSrc: string
      innerSrc: string
      issues: []
    }>()
    mockedResolveAssetSrc.mockResolvedValue('')
    mockedResolvePageBackgrounds.mockImplementation(({ coverAssetId }) => {
      if (coverAssetId === 'cover-initial') {
        return Promise.resolve({
          coverSrc: '/initial.png',
          innerSrc: '',
          issues: [],
        })
      }
      if (coverAssetId === 'cover-slow') return slow.promise
      if (coverAssetId === 'cover-latest') return latest.promise
      return Promise.resolve({ coverSrc: '', innerSrc: '', issues: [] })
    })

    const initialTheme = publicExamTheme({ coverBgAssetId: 'cover-initial' })
    const slowTheme = publicExamTheme({ coverBgAssetId: 'cover-slow' })
    const latestTheme = publicExamTheme({ coverBgAssetId: 'cover-latest' })
    const item = await mountThemePreview(initialTheme)
    expect(item.host.querySelector('img.bg')?.getAttribute('src')).toBe(
      '/initial.png',
    )

    await act(async () => {
      item.root.render(createElement(ThemePreview, { theme: slowTheme }))
    })
    expect(item.host.querySelector('img.bg')).toBeNull()

    await act(async () => {
      item.root.render(createElement(ThemePreview, { theme: latestTheme }))
      latest.resolve({ coverSrc: '/latest.png', innerSrc: '', issues: [] })
    })
    expect(item.host.querySelector('img.bg')?.getAttribute('src')).toBe(
      '/latest.png',
    )

    await act(async () => {
      slow.resolve({ coverSrc: '/stale.png', innerSrc: '', issues: [] })
    })
    expect(item.host.querySelector('img.bg')?.getAttribute('src')).toBe(
      '/latest.png',
    )
  })
})
