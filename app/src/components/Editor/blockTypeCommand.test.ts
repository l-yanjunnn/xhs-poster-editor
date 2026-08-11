import { Editor } from '@tiptap/react'
import { TextSelection } from '@tiptap/pm/state'
import { describe, expect, it } from 'vitest'
import { applyBlockType } from './blockTypeCommand'
import { createEditorExtensions } from './editorExtensions'

function makeEditor(content: string) {
  return new Editor({ extensions: createEditorExtensions(), content })
}

function textRange(editor: Editor, text: string) {
  let from = -1
  let to = -1
  editor.state.doc.descendants((node, position) => {
    if (from < 0 && node.isText && node.text === text) {
      from = position
      to = position + node.nodeSize
      return false
    }
    return true
  })
  if (from < 0 || to < 0) throw new Error(`找不到文本：${text}`)
  return { from, to }
}

function select(editor: Editor, anchor: number, head: number) {
  editor.view.dispatch(
    editor.state.tr.setSelection(
      TextSelection.create(editor.state.doc, anchor, head),
    ),
  )
}

function blocks(editor: Editor) {
  return editor.getJSON().content?.map((node) => ({
    type: node.type,
    level: node.attrs?.level,
  }))
}

describe('block type selection boundaries', () => {
  it('excludes the previous paragraph when the selection starts at its end', () => {
    const editor = makeEditor('<p>上一段</p><p>下一段</p>')
    const previous = textRange(editor, '上一段')
    const next = textRange(editor, '下一段')
    select(editor, previous.to, next.from + 1)

    expect(applyBlockType(editor, 'h2')).toBe(true)
    expect(blocks(editor)?.slice(0, 2)).toEqual([
      { type: 'paragraph', level: undefined },
      { type: 'heading', level: 2 },
    ])
    editor.destroy()
  })

  it('excludes the next paragraph when the selection ends at its start', () => {
    const editor = makeEditor('<p>上一段</p><p>下一段</p>')
    const previous = textRange(editor, '上一段')
    const next = textRange(editor, '下一段')
    select(editor, previous.from + 1, next.from)

    expect(applyBlockType(editor, 'h1')).toBe(true)
    expect(blocks(editor)?.slice(0, 2)).toEqual([
      { type: 'heading', level: 1 },
      { type: 'paragraph', level: undefined },
    ])
    editor.destroy()
  })

  it('keeps both paragraphs when the selection contains text from both', () => {
    const editor = makeEditor('<p>上一段</p><p>下一段</p>')
    const previous = textRange(editor, '上一段')
    const next = textRange(editor, '下一段')
    select(editor, previous.from + 1, next.from + 1)

    expect(applyBlockType(editor, 'h3')).toBe(true)
    expect(blocks(editor)?.slice(0, 2)).toEqual([
      { type: 'heading', level: 3 },
      { type: 'heading', level: 3 },
    ])
    editor.destroy()
  })

  it('normalizes a reversed selection whose head is at the previous end', () => {
    const editor = makeEditor('<p>上一段</p><p>下一段</p>')
    const previous = textRange(editor, '上一段')
    const next = textRange(editor, '下一段')
    select(editor, next.from + 1, previous.to)

    expect(applyBlockType(editor, 'h2')).toBe(true)
    expect(blocks(editor)?.slice(0, 2)).toEqual([
      { type: 'paragraph', level: undefined },
      { type: 'heading', level: 2 },
    ])
    editor.destroy()
  })

  it('does nothing when the range contains only the boundary between paragraphs', () => {
    const editor = makeEditor('<p>上一段</p><p>下一段</p>')
    const previous = textRange(editor, '上一段')
    const next = textRange(editor, '下一段')
    const before = editor.getJSON()
    select(editor, previous.to, next.from)

    expect(applyBlockType(editor, 'h2')).toBe(false)
    expect(editor.getJSON()).toEqual(before)

    select(editor, next.from, previous.to)
    editor.commands.keyboardShortcut('Mod-Alt-2')
    expect(editor.getJSON()).toEqual(before)
    editor.destroy()
  })

  it('changes only the complete middle paragraph between two empty endpoints', () => {
    const editor = makeEditor('<p>第一段</p><p>第二段</p><p>第三段</p>')
    const first = textRange(editor, '第一段')
    const third = textRange(editor, '第三段')
    select(editor, first.to, third.from)

    expect(applyBlockType(editor, 'h2')).toBe(true)
    expect(blocks(editor)?.slice(0, 3)).toEqual([
      { type: 'paragraph', level: undefined },
      { type: 'heading', level: 2 },
      { type: 'paragraph', level: undefined },
    ])
    editor.destroy()
  })

  it('changes the next paragraph from its previous-end boundary through its end', () => {
    const editor = makeEditor('<p>上一段</p><p>下一段</p>')
    const previous = textRange(editor, '上一段')
    const next = textRange(editor, '下一段')
    select(editor, previous.to, next.to)

    expect(applyBlockType(editor, 'h3')).toBe(true)
    expect(blocks(editor)?.slice(0, 2)).toEqual([
      { type: 'paragraph', level: undefined },
      { type: 'heading', level: 3 },
    ])
    editor.destroy()
  })

  it('skips selectable atomic nodes while finding the first selected text block', () => {
    const editor = makeEditor(
      '<p>上一段</p><img src="image.png"><p>下一段</p>',
    )
    const previous = textRange(editor, '上一段')
    const next = textRange(editor, '下一段')
    select(editor, previous.to, next.from + 1)

    expect(applyBlockType(editor, 'h2')).toBe(true)
    expect(blocks(editor)?.slice(0, 3)).toEqual([
      { type: 'paragraph', level: undefined },
      { type: 'image', level: undefined },
      { type: 'heading', level: 2 },
    ])
    editor.destroy()
  })

  it('keeps a caret at a paragraph end attached to that paragraph', () => {
    const editor = makeEditor('<p>上一段</p><p>下一段</p>')
    const previous = textRange(editor, '上一段')
    select(editor, previous.to, previous.to)

    expect(applyBlockType(editor, 'h1')).toBe(true)
    expect(blocks(editor)?.slice(0, 2)).toEqual([
      { type: 'heading', level: 1 },
      { type: 'paragraph', level: undefined },
    ])
    editor.destroy()
  })

  it('applies one heading style to a whole block containing a soft break', () => {
    const editor = makeEditor('<p>第一行<br>第二行</p><p>下一段</p>')
    const secondLine = textRange(editor, '第二行')
    select(editor, secondLine.from + 1, secondLine.from + 1)

    expect(applyBlockType(editor, 'h2')).toBe(true)
    expect(blocks(editor)?.slice(0, 2)).toEqual([
      { type: 'heading', level: 2 },
      { type: 'paragraph', level: undefined },
    ])
    expect(editor.getHTML()).toContain('<h2>第一行<br>第二行</h2>')
    editor.destroy()
  })

  it('uses the same boundary rule for native heading shortcuts', () => {
    const editor = makeEditor('<p>上一段</p><p>下一段</p>')
    const previous = textRange(editor, '上一段')
    const next = textRange(editor, '下一段')
    select(editor, previous.to, next.from + 1)

    editor.commands.keyboardShortcut('Mod-Alt-2')
    expect(blocks(editor)?.slice(0, 2)).toEqual([
      { type: 'paragraph', level: undefined },
      { type: 'heading', level: 2 },
    ])
    editor.destroy()
  })

  it('uses the same boundary rule for the native paragraph shortcut', () => {
    const editor = makeEditor('<h2>上一段</h2><h2>下一段</h2>')
    const previous = textRange(editor, '上一段')
    const next = textRange(editor, '下一段')
    select(editor, previous.to, next.from + 1)

    editor.commands.keyboardShortcut('Mod-Alt-0')
    expect(blocks(editor)?.slice(0, 2)).toEqual([
      { type: 'heading', level: 2 },
      { type: 'paragraph', level: undefined },
    ])
    editor.destroy()
  })
})
