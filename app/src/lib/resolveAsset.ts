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

export interface AssetResolution {
  src: string
  missing: boolean
}

// 带状态版供草稿恢复/主题切换使用：空 id 表示用户主动未设置，
// 非空 id 却查不到才是可恢复的资源缺失。
export async function resolveAssetSrcWithStatus(
  id: string,
  kind: 'background' | 'logo',
): Promise<AssetResolution> {
  if (!id) return { src: '', missing: false }
  const src = await resolveAssetSrc(id, kind)
  return { src, missing: !src }
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

export interface ContentImageResolution<T = object> {
  document: T
  missingAssetIds: string[]
}

export interface ResolvedContentImageSource {
  imageId: string
  src: string
}

export function collectContentImageAssetIds(doc: object): string[] {
  const assetIds = new Set<string>()
  function walk(node: ContentNode) {
    if (
      node.type === 'image' &&
      typeof node.attrs?.assetId === 'string' &&
      node.attrs.assetId
    ) {
      assetIds.add(node.attrs.assetId)
    }
    node.content?.forEach(walk)
  }
  walk(doc as ContentNode)
  return Array.from(assetIds)
}

export function collectResolvedContentImageSources(
  doc: object,
): ResolvedContentImageSource[] {
  const sources: ResolvedContentImageSource[] = []
  function walk(node: ContentNode) {
    if (
      node.type === 'image' &&
      typeof node.attrs?.imageId === 'string' &&
      typeof node.attrs.src === 'string' &&
      node.attrs.src
    ) {
      sources.push({ imageId: node.attrs.imageId, src: node.attrs.src })
    }
    node.content?.forEach(walk)
  }
  walk(doc as ContentNode)
  return sources
}

// 与 mapContentImages 相同的深拷贝语义，同时把查不到的素材显式上报。
// 缺失时保留原 src，让仍然有效的外链/旧会话缓存有机会继续显示。
export async function mapContentImagesWithReport<T extends ContentNode>(
  doc: T,
  mapSrc: (assetId: string) => Promise<string | null>,
): Promise<ContentImageResolution<T>> {
  const missing = new Set<string>()
  const document = await mapContentImages(doc, async (assetId) => {
    const src = await mapSrc(assetId)
    if (!src) missing.add(assetId)
    return src
  })
  return {
    document: document as T,
    missingAssetIds: Array.from(missing),
  }
}

// IO 版：从 IndexedDB 按 assetId 反查 src
export async function resolveContentImages(doc: object): Promise<object> {
  return mapContentImages(doc as ContentNode, async (assetId) => {
    const asset = await getUserAssetById(assetId)
    return asset?.src ?? null
  })
}

export async function resolveContentImagesWithReport(
  doc: object,
): Promise<ContentImageResolution> {
  return mapContentImagesWithReport(doc as ContentNode, async (assetId) => {
    const asset = await getUserAssetById(assetId)
    return asset?.src ?? null
  })
}
