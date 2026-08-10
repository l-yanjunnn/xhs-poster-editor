import Image from '@tiptap/extension-image'
import { Plugin } from '@tiptap/pm/state'
import {
  createImageId,
  normalizeImageAlign,
  normalizeImageAttributes,
  normalizeImageWidth,
  type ImageAlign,
} from '@/lib/imageModel'

export interface PosterImageAttributes {
  src: string
  alt?: string | null
  title?: string | null
  assetId?: string | null
  imageId: string
  width: string | null
  align: ImageAlign
}

function attrsChanged(
  current: Record<string, unknown>,
  next: Record<string, unknown>,
): boolean {
  return (
    current.imageId !== next.imageId ||
    current.align !== next.align ||
    current.width !== next.width ||
    current.height !== next.height
  )
}

/**
 * 正式 renderHTML 永远保持单个根级 img。选框与手柄由中央 Preview 的 React
 * 覆盖层负责，绝不写入 schema，也不会混入草稿或导出。
 */
export const PosterImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        renderHTML: (attrs) => {
          const width = normalizeImageWidth(attrs.width)
          return width ? { style: `width: ${width}` } : {}
        },
        parseHTML: (element) =>
          normalizeImageWidth((element as HTMLElement).style.width),
      },
      // 外部 HTML 可能带 width/height 像素属性。v1.4 只接受百分比 width，
      // height:auto 由 CSS 统一保证，所以不再序列化 height。
      height: {
        default: null,
        renderHTML: () => ({}),
        parseHTML: () => null,
      },
      align: {
        default: 'left',
        renderHTML: (attrs) => ({
          'data-align': normalizeImageAlign(attrs.align),
        }),
        parseHTML: (element) =>
          normalizeImageAlign((element as HTMLElement).getAttribute('data-align')),
      },
      imageId: {
        default: null,
        renderHTML: (attrs) =>
          attrs.imageId ? { 'data-image-id': attrs.imageId } : {},
        parseHTML: (element) =>
          (element as HTMLElement).getAttribute('data-image-id'),
      },
      assetId: {
        default: null,
        renderHTML: (attrs) =>
          attrs.assetId ? { 'data-asset-id': attrs.assetId } : {},
        parseHTML: (element) =>
          (element as HTMLElement).getAttribute('data-asset-id'),
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() ?? []),
      new Plugin({
        appendTransaction: (_transactions, _oldState, newState) => {
          const seen = new Set<string>()
          const transaction = newState.tr
          let changed = false

          newState.doc.descendants((node, position) => {
            if (node.type.name !== this.name) return true
            const current = node.attrs as Record<string, unknown>
            const normalized = normalizeImageAttributes(current, seen, createImageId)
            if (attrsChanged(current, normalized)) {
              transaction.setNodeMarkup(position, undefined, normalized, node.marks)
              changed = true
            }
            return false
          })

          if (!changed) return null
          // ID/非法属性修复属于同一次输入的 schema 维护，不应额外占一格 undo。
          transaction.setMeta('addToHistory', false)
          return transaction
        },
      }),
    ]
  },
})
