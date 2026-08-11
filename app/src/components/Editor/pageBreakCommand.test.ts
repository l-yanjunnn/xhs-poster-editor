import { Editor } from '@tiptap/react'
import { TextSelection } from '@tiptap/pm/state'
import { describe, expect, it, vi } from 'vitest'
import { splitIntoPages } from '@/lib/splitPages'
import { createEditorExtensions } from './editorExtensions'
import {
  handlePageBreakPaste,
  insertRootPageBreak,
} from './pageBreakCommand'

function makeEditor(content: object | string): Editor {
  return new Editor({
    extensions: createEditorExtensions(),
    content: content as never,
  })
}

function textPosition(editor: Editor, needle: string, offset = 0): number {
  let found = -1
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text?.includes(needle) || found >= 0) return true
    found = pos + node.text.indexOf(needle) + offset
    return false
  })
  if (found < 0) throw new Error(`找不到文本：${needle}`)
  return found
}

function setCursor(editor: Editor, needle: string, offset = 0): void {
  const pos = textPosition(editor, needle, offset)
  editor.view.dispatch(
    editor.state.tr.setSelection(TextSelection.create(editor.state.doc, pos)),
  )
}

function rootTypes(editor: Editor): string[] {
  return editor.getJSON().content?.map((node) => node.type) ?? []
}

function expectOnlyRootPageBreaks(editor: Editor): void {
  editor.state.doc.descendants((node, _pos, parent) => {
    if (node.type.name === 'horizontalRule') {
      expect(parent?.type.name).toBe('doc')
    }
    return true
  })
}

describe('insertRootPageBreak', () => {
  it('keeps paragraph and heading insertion at the cursor position', () => {
    const editor = makeEditor('<p>正文内容</p><h2>后续</h2>')
    setCursor(editor, '正文内容', 2)

    expect(insertRootPageBreak(editor)).toBe(true)

    expect(rootTypes(editor).slice(0, 3)).toEqual([
      'paragraph',
      'horizontalRule',
      'paragraph',
    ])
    expect(editor.state.doc.textContent).toContain('正文内容后续')
    expect(splitIntoPages(editor.getHTML())).toHaveLength(2)
    expectOnlyRootPageBreaks(editor)
    editor.destroy()
  })

  it('places the cursor in an editable new page after paragraph-end and empty-block breaks', () => {
    for (const html of ['<p>段尾</p>', '<h1>标题</h1>', '<p></p>']) {
      const editor = makeEditor(html)
      const position = editor.state.doc.firstChild?.content.size
        ? editor.state.doc.firstChild.content.size + 1
        : 1
      editor.commands.setTextSelection(position)

      insertRootPageBreak(editor)

      expect(editor.state.selection).toBeInstanceOf(TextSelection)
      editor.commands.insertContent('新页输入')
      const pages = splitIntoPages(editor.getHTML())
      expect(pages).toHaveLength(2)
      expect(pages[1]).toContain('新页输入')
      expectOnlyRootPageBreaks(editor)
      editor.destroy()
    }
  })

  it('splits a bullet list after the whole current item, never inside its text', () => {
    const editor = makeEditor(
      '<ul><li><p>第一项</p></li><li><p>第二项</p></li><li><p>第三项</p></li></ul>',
    )
    setCursor(editor, '第二项', 1)

    insertRootPageBreak(editor)

    expect(rootTypes(editor).slice(0, 3)).toEqual([
      'bulletList',
      'horizontalRule',
      'bulletList',
    ])
    const json = editor.getJSON().content ?? []
    expect(JSON.stringify(json[0])).toContain('第二项')
    expect(JSON.stringify(json[2])).toContain('第三项')
    expect(JSON.stringify(json[2])).not.toContain('第二项')
    expectOnlyRootPageBreaks(editor)
    editor.destroy()
  })

  it('inserts before a non-empty item when the cursor is at its start', () => {
    const editor = makeEditor(
      '<ul><li><p>第一项</p></li><li><p>第二项</p></li><li><p>第三项</p></li></ul>',
    )
    setCursor(editor, '第二项')

    insertRootPageBreak(editor)

    const json = editor.getJSON().content ?? []
    expect(JSON.stringify(json[0])).toContain('第一项')
    expect(JSON.stringify(json[0])).not.toContain('第二项')
    expect(JSON.stringify(json[2])).toContain('第二项')
    expect(JSON.stringify(json[2])).toContain('第三项')
    editor.destroy()
  })

  it('continues ordered numbering and round-trips in one undo/redo step', () => {
    const editor = makeEditor(
      '<ol start="4"><li><p>第四项</p></li><li><p>第五项</p></li><li><p>第六项</p></li></ol>',
    )
    setCursor(editor, '第五项', 1)
    const before = editor.getJSON()

    insertRootPageBreak(editor)

    const inserted = editor.getJSON()
    expect(inserted.content?.[0]?.attrs?.start).toBe(4)
    expect(inserted.content?.[2]?.attrs?.start).toBe(6)
    expect(editor.commands.undo()).toBe(true)
    expect(editor.getJSON()).toEqual(before)
    expect(editor.commands.redo()).toBe(true)
    expect(editor.getJSON()).toEqual(inserted)
    editor.destroy()
  })

  it('consumes an empty list item without leaving a ghost bullet', () => {
    const editor = makeEditor({
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: '前' }] }],
            },
            { type: 'listItem', content: [{ type: 'paragraph' }] },
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: '后' }] }],
            },
          ],
        },
      ],
    })
    const emptyParagraphPos = (() => {
      let position = -1
      editor.state.doc.descendants((node, pos) => {
        if (position < 0 && node.type.name === 'paragraph' && node.content.size === 0) {
          position = pos + 1
          return false
        }
        return true
      })
      return position
    })()
    editor.commands.setTextSelection(emptyParagraphPos)

    insertRootPageBreak(editor)

    expect(rootTypes(editor).slice(0, 3)).toEqual([
      'bulletList',
      'horizontalRule',
      'bulletList',
    ])
    expect(editor.getHTML()).not.toMatch(/<li><p><\/p><\/li>/)
    editor.destroy()
  })

  it('keeps a nested list with its outer item before the break', () => {
    const editor = makeEditor(
      '<ul><li><p>外层一</p><ul><li><p>嵌套一</p></li><li><p>嵌套二</p></li></ul></li><li><p>外层二</p></li></ul>',
    )
    setCursor(editor, '嵌套一', 2)

    insertRootPageBreak(editor)

    const json = editor.getJSON().content ?? []
    expect(JSON.stringify(json[0])).toContain('嵌套一')
    expect(JSON.stringify(json[0])).toContain('嵌套二')
    expect(JSON.stringify(json[2])).toContain('外层二')
    expectOnlyRootPageBreaks(editor)
    editor.destroy()
  })

  it('places blockquote breaks after the whole quote and codeBlock breaks at root', () => {
    const quoteEditor = makeEditor(
      '<blockquote><p>引用第一段</p><p>引用第二段</p></blockquote><p>正文</p>',
    )
    setCursor(quoteEditor, '引用第一段', 2)
    insertRootPageBreak(quoteEditor)
    expect(rootTypes(quoteEditor).slice(0, 3)).toEqual([
      'blockquote',
      'horizontalRule',
      'paragraph',
    ])
    expect(JSON.stringify(quoteEditor.getJSON().content?.[0])).toContain('引用第二段')
    expectOnlyRootPageBreaks(quoteEditor)
    quoteEditor.destroy()

    const codeEditor = makeEditor('<pre><code>const value = 1</code></pre>')
    setCursor(codeEditor, 'const value', 5)
    insertRootPageBreak(codeEditor)
    expect(rootTypes(codeEditor)).toContain('horizontalRule')
    expectOnlyRootPageBreaks(codeEditor)
    codeEditor.destroy()
  })

  it('takes over page-break paste at a list boundary without merging existing text', () => {
    const editor = makeEditor(
      '<ol start="8"><li><p>已有一</p></li><li><p>已有二</p></li></ol>',
    )
    setCursor(editor, '已有一', 2)
    const before = editor.getJSON()
    const preventDefault = vi.fn()
    const event = {
      clipboardData: {
        getData: (type: string) =>
          type === 'text/html'
            ? '<ol start="4"><li><p>粘贴四</p><hr class="page-break"></li><li><p>粘贴五</p></li></ol>'
            : '',
      },
      preventDefault,
    } as unknown as ClipboardEvent

    expect(handlePageBreakPaste(editor.view, event)).toBe(true)

    expect(preventDefault).toHaveBeenCalledOnce()
    expect(editor.state.doc.textContent).toBe('已有一粘贴四粘贴五已有二')
    expectOnlyRootPageBreaks(editor)
    expect(splitIntoPages(editor.getHTML())).toHaveLength(2)
    const lists = editor.getJSON().content?.filter((node) =>
      ['orderedList', 'bulletList'].includes(node.type),
    )
    expect(lists?.map((list) => list.attrs?.start)).toEqual([8, 4, 5, 9])
    expect(editor.commands.undo()).toBe(true)
    expect(editor.getJSON()).toEqual(before)
    expect(editor.commands.redo()).toBe(true)
    expect(editor.state.doc.textContent).toBe('已有一粘贴四粘贴五已有二')
    editor.destroy()
  })
})
