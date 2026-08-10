// assetId → src 反查：builtin 走静态表，user 走 IndexedDB
// Why 单独成文件：App（真实画布）和 ThemePreview（缩略图）都要用，
// 曾各自复制一份，逻辑分叉不易察觉，收敛到这里
import {
  BUILTIN_BACKGROUNDS,
  BUILTIN_LOGOS,
  findAssetById,
} from './builtinAssets'
import { getUserAssetById } from './assetStore'

export async function resolveAssetSrc(
  id: string,
  kind: 'background' | 'logo',
): Promise<string> {
  if (!id) return ''
  const builtinList = kind === 'background' ? BUILTIN_BACKGROUNDS : BUILTIN_LOGOS
  const builtin = findAssetById(builtinList, id)
  if (builtin) return builtin.src
  const user = await getUserAssetById(id)
  return user?.src ?? ''
}
