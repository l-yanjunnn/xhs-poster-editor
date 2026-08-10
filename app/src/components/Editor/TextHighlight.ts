import { Mark, mergeAttributes } from '@tiptap/react'
import { Plugin } from '@tiptap/pm/state'
import {
  highlightColorWithOpacity,
  normalizeHighlightColor,
  normalizeHighlightOpacity,
  TEXT_HIGHLIGHT_COLOR,
  TEXT_HIGHLIGHT_DEFAULT_OPACITY,
} from '@/lib/textHighlight'

export const TextHighlight = Mark.create({
  name: 'textHighlight',
  // 光标移到选区末尾继续输入时不继承荧光笔，保证只命中用户原选区。
  inclusive: false,

  addAttributes() {
    return {
      color: {
        default: TEXT_HIGHLIGHT_COLOR,
        // 粘贴/恢复的外部色值不是 V1.4 文档语义的一部分。
        parseHTML: (element) =>
          normalizeHighlightColor(element.getAttribute('data-highlight-color')),
      },
      opacity: {
        default: TEXT_HIGHLIGHT_DEFAULT_OPACITY,
        parseHTML: (element) =>
          normalizeHighlightOpacity(element.getAttribute('data-highlight-opacity')),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-text-highlight]' }]
  },

  renderHTML({ HTMLAttributes }) {
    // 不信任 JSON/command 直接写入的 mark attrs；正式 HTML 始终只输出固定基色。
    const color = normalizeHighlightColor(HTMLAttributes.color)
    const opacity = normalizeHighlightOpacity(HTMLAttributes.opacity)
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-text-highlight': '',
        'data-highlight-color': color,
        'data-highlight-opacity': String(opacity),
        style: `background-color: ${highlightColorWithOpacity(color, opacity)}`,
      }),
      0,
    ]
  },

  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() ?? []),
      new Plugin({
        appendTransaction: (_transactions, _oldState, newState) => {
          const markType = newState.schema.marks[this.name]
          if (!markType) return null

          const transaction = newState.tr
          let changed = false
          newState.doc.descendants((node, position) => {
            if (!node.isText) return true
            const highlight = node.marks.find((mark) => mark.type === markType)
            if (!highlight || highlight.attrs.color === TEXT_HIGHLIGHT_COLOR) {
              return true
            }

            transaction.removeMark(position, position + node.nodeSize, highlight)
            transaction.addMark(
              position,
              position + node.nodeSize,
              markType.create({
                ...highlight.attrs,
                color: TEXT_HIGHLIGHT_COLOR,
              }),
            )
            changed = true
            return true
          })

          if (!changed) return null
          transaction.setMeta('addToHistory', false)
          return transaction
        },
      }),
    ]
  },
})
