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

/** setContent、草稿恢复与初始内容共用的可靠性入口。 */
export function normalizeIncomingContent(
  content: object | string,
): object | string {
  const normalizedText = normalizeEditorContent(content)
  return typeof normalizedText === 'string'
    ? normalizePageBreakHtml(normalizedText)
    : normalizeImageDocument(
        normalizePageBreakJson(normalizedText) as ImageNodeLike,
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
