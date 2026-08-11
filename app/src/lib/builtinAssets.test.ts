import { describe, expect, it } from 'vitest'
import {
  BUILTIN_BACKGROUNDS,
  BUILTIN_THEME_BACKGROUNDS,
  findAssetById,
} from './builtinAssets'
import { resolveAssetSrc, resolveAssetSrcWithStatus } from './resolveAsset'

const COVER_ID = 'builtin-bg-public-exam-landscape-cover-v1'
const INNER_ID = 'builtin-bg-public-exam-landscape-inner-v1'

describe('builtinAssets', () => {
  it('公考双底图不进入普通背景列表', () => {
    expect(BUILTIN_BACKGROUNDS.map((asset) => asset.id)).not.toContain(COVER_ID)
    expect(BUILTIN_BACKGROUNDS.map((asset) => asset.id)).not.toContain(INNER_ID)
    expect(BUILTIN_BACKGROUNDS.every((asset) => !asset.themeOnly)).toBe(true)
  })

  it('主题专用资产保留 stable ID 和版本化静态路径', () => {
    expect(BUILTIN_THEME_BACKGROUNDS).toEqual([
      expect.objectContaining({
        id: COVER_ID,
        src: '/builtin-assets/bg-public-exam-landscape-cover-v1.png',
        builtin: true,
        themeOnly: true,
      }),
      expect.objectContaining({
        id: INNER_ID,
        src: '/builtin-assets/bg-public-exam-landscape-inner-v1.png',
        builtin: true,
        themeOnly: true,
      }),
    ])
  })

  it('findAssetById 仍能从背景解析边界找到主题专用资产', () => {
    expect(findAssetById(BUILTIN_BACKGROUNDS, COVER_ID)?.src).toBe(
      '/builtin-assets/bg-public-exam-landscape-cover-v1.png',
    )
    expect(findAssetById(BUILTIN_BACKGROUNDS, INNER_ID)?.src).toBe(
      '/builtin-assets/bg-public-exam-landscape-inner-v1.png',
    )
  })

  it('resolveAsset 按 stable ID 返回两张内置底图且不误报缺失', async () => {
    await expect(resolveAssetSrc(COVER_ID, 'background')).resolves.toBe(
      '/builtin-assets/bg-public-exam-landscape-cover-v1.png',
    )
    await expect(resolveAssetSrc(INNER_ID, 'background')).resolves.toBe(
      '/builtin-assets/bg-public-exam-landscape-inner-v1.png',
    )
    await expect(
      resolveAssetSrcWithStatus(COVER_ID, 'background'),
    ).resolves.toEqual({
      src: '/builtin-assets/bg-public-exam-landscape-cover-v1.png',
      missing: false,
    })
  })
})
