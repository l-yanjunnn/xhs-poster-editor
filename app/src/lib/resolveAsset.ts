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

// —— 正文插图的 assetId → src 重解析 ——
// Why: 主题「包含正文」时插图节点存的 src 是 session-bound blob URL，刷新即失效。
// 图片节点带 assetId attribute，apply 主题前按 id 重新 resolve 出本会话有效的 src。

// Tiptap doc JSON 的最小结构类型（只关心遍历所需字段）
interface ContentNode {
  type?: string
  attrs?: Record<string, unknown>
  content?: ContentNode[]
}

// 纯函数：深拷贝并对每个带 assetId 的 image 节点调用 mapSrc 替换 src。
// mapSrc 返回 null 表示解析失败（素材已删），保留原 src 不动。
// 抽成纯函数是为了可单测（IndexedDB IO 在 resolveContentImages 里）
export async function mapContentImages(
  doc: ContentNode,
  mapSrc: (assetId: string) => Promise<string | null>,
): Promise<ContentNode> {
  async function walk(node: ContentNode): Promise<ContentNode> {
    const out: ContentNode = { ...node }
    if (node.type === 'image' && typeof node.attrs?.assetId === 'string') {
      const src = await mapSrc(node.attrs.assetId)
      if (src) out.attrs = { ...node.attrs, src }
    }
    if (node.content) {
      out.content = await Promise.all(node.content.map(walk))
    }
    return out
  }
  return walk(doc)
}

// IO 版：从 IndexedDB 按 assetId 反查 src
export async function resolveContentImages(doc: object): Promise<object> {
  return mapContentImages(doc as ContentNode, async (assetId) => {
    const asset = await getUserAssetById(assetId)
    return asset?.src ?? null
  })
}
