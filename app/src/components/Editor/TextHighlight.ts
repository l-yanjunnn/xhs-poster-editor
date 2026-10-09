import { Mark, mergeAttributes } from '@tiptap/react'
import { Plugin } from '@tiptap/pm/state'
import {
  highlightColorWithOpacity,
  normalizeHighlightColor,
  normalizeHighlightOpacity,
  normalizeHighlightStyle,
} from '@/lib/textHighlight'

export const TextHighlight = Mark.create({
  name: 'textHighlight',
  // 光标移到选区末尾继续输入时不继承荧光笔，保证只命中用户原选区。
  inclusive: false,

  addAttributes() {
    return {
      style: {
        default: 'background',
        parseHTML: (element) => normalizeHighlightStyle(element.getAttribute('data-highlight-style')),
        // 这是语义样式枚举，不能由 Tiptap 当作 CSS style 属性直接输出。
        renderHTML: () => ({}),
      },
      color: {
        // 缺省才使用样式默认色，不能提前补紫色让旧划线 JSON 变色。
        default: null,
        parseHTML: (element) =>
          normalizeHighlightColor(element.getAttribute('data-highlight-color'), element.getAttribute('data-highlight-style')),
      },
      opacity: {
        // 缺省值取决于样式；不能先补 25%，否则旧/外部 JSON 无法区分缺省划线。
        default: null,
        parseHTML: (element) =>
          normalizeHighlightOpacity(element.getAttribute('data-highlight-opacity'), element.getAttribute('data-highlight-style')),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-text-highlight]' }]
  },

  renderHTML({ mark, HTMLAttributes }) {
    // JSON/command 直接写入的 attrs 也只输出固定色板内颜色。
    const style = normalizeHighlightStyle(mark.attrs.style)
    const color = normalizeHighlightColor(mark.attrs.color, style)
    const opacity = normalizeHighlightOpacity(mark.attrs.opacity, style)
    const rgba = highlightColorWithOpacity(color, opacity, style)
    const inlineStyle = style === 'underline'
      ? `background-image: linear-gradient(${rgba}, ${rgba}); background-size: 100% 0.28em; background-position: 0 calc(100% - 0.1em); background-repeat: no-repeat`
      : `background-color: ${rgba}`
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-text-highlight': '',
        'data-highlight-style': style,
        'data-highlight-color': color,
        'data-highlight-opacity': String(opacity),
        style: inlineStyle,
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
            if (!highlight) return true
            const style = normalizeHighlightStyle(highlight.attrs.style)
            const color = normalizeHighlightColor(highlight.attrs.color, style)
            const opacity = normalizeHighlightOpacity(highlight.attrs.opacity, style)
            if (highlight.attrs.style === style && highlight.attrs.color === color && highlight.attrs.opacity === opacity) return true

            transaction.removeMark(position, position + node.nodeSize, highlight)
            transaction.addMark(
              position,
              position + node.nodeSize,
              markType.create({
                ...highlight.attrs,
                style,
                color,
                opacity,
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
