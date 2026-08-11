import { Editor } from '@tiptap/react'
import { normalizeIncomingContent } from './contentNormalization'
import { createEditorExtensions } from './editorExtensions'

/**
 * 在不触碰当前可见编辑器的情况下，把导入 HTML 规范化为生产 Tiptap JSON。
 * 这让新草稿可以先原子落盘，再切换 UI，避免保存失败时覆盖当前草稿。
 */
export function createEditorDocumentJSON(content: object | string): object {
  const editor = new Editor({
    extensions: createEditorExtensions(),
    content: normalizeIncomingContent(content),
  })
  try {
    return editor.getJSON()
  } finally {
    editor.destroy()
  }
}
