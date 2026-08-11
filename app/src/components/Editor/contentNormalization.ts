import {
  normalizeImageDocument,
  type ImageNodeLike,
} from '@/lib/imageModel'
import { Fragment, Slice } from '@tiptap/pm/model'
import {
  normalizePageBreakHtml,
  normalizePageBreakJson,
} from '@/lib/pageBreak'
import { normalizeEditorContent } from '@/lib/textReliability'

const SUPPORTED_HEADING_LEVELS = new Set([1, 2, 3])

function normalizeHeadingHtml(html: string): string {
  return html.replace(/<(\/?)h[4-6](?=[\s>])/gi, '<$1h3')
}

function normalizeHeadingJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeHeadingJson)
  if (!value || typeof value !== 'object') return value

  const node = value as Record<string, unknown>
  const normalized = Object.fromEntries(
    Object.entries(node).map(([key, child]) => [key, normalizeHeadingJson(child)]),
  )
  if (node.type !== 'heading') return normalized

  const attrs =
    normalized.attrs && typeof normalized.attrs === 'object'
      ? (normalized.attrs as Record<string, unknown>)
      : {}
  const level = attrs.level ?? 1
  return SUPPORTED_HEADING_LEVELS.has(level as number)
    ? normalized
    : { ...normalized, attrs: { ...attrs, level: 3 } }
}

/** setContent、草稿恢复与初始内容共用的可靠性入口。 */
export function normalizeIncomingContent(
  content: object | string,
): object | string {
  const normalizedText = normalizeEditorContent(content)
  return typeof normalizedText === 'string'
    ? normalizePageBreakHtml(normalizeHeadingHtml(normalizedText))
    : normalizeImageDocument(
        normalizePageBreakJson(
          normalizeHeadingJson(normalizedText) as object,
        ) as ImageNodeLike,
      )
}

/** 内部复制图片会带出稳定 ID；粘贴副本必须重新分配身份。 */
export function stripPastedImageIds(slice: Slice): Slice {
  function mapFragment(fragment: Fragment): Fragment {
    const nodes = Array.from({ length: fragment.childCount }, (_, index) => {
      const node = fragment.child(index)
      if (node.type.name === 'image') {
        return node.type.create(
          { ...node.attrs, imageId: null },
          node.content,
          node.marks,
        )
      }
      return node.content.size > 0 ? node.copy(mapFragment(node.content)) : node
    })
    return Fragment.fromArray(nodes)
  }
  return new Slice(mapFragment(slice.content), slice.openStart, slice.openEnd)
}
