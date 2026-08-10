import { Mark, mergeAttributes } from '@tiptap/react'

// 显式的「短语不拆行」语义，不借用 bold，也不根据内容自动猜测。
// data attribute 是稳定的序列化契约；class 仅承担当前版本的样式。
export const NoWrapPhrase = Mark.create({
  name: 'noWrapPhrase',
  inclusive: false,

  parseHTML() {
    return [{ tag: 'span[data-no-wrap-phrase]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-no-wrap-phrase': '',
        class: 'nowrap-phrase',
      }),
      0,
    ]
  },
})
