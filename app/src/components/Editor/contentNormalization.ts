import {
  normalizeImageDocument,
  type ImageNodeLike,
} from '@/lib/imageModel'
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
