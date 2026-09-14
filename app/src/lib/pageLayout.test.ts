import { Editor } from '@tiptap/react'
import { closeHistory } from '@tiptap/pm/history'
import { describe, expect, it } from 'vitest'
import { createEditorExtensions } from '@/components/Editor/editorExtensions'
import { normalizePageBreakJson } from './pageBreak'
import { normalizeCoverTopOffset, readPageLayouts } from './pageLayout'

describe('durable page layout boundaries', () => {
  it('keeps the original configured page identity when a copied break is inserted before it; undo restores exactly', () => {
    const editor = new Editor({ extensions: createEditorExtensions(), content: '<p>cover</p><hr class="page-break" data-page-id="original" data-page-vertical="bottom"><p>inner</p>' })
    const before = editor.getJSON()
    const copy = editor.state.schema.nodes.horizontalRule.create({ pageId: 'original', pageVertical: 'bottom' })
    editor.view.dispatch(closeHistory(editor.state.tr.insert(0, copy)))
    const layouts = readPageLayouts(editor.getHTML())
    expect(layouts[1].id).not.toBe('original')
    expect(layouts[2]).toEqual({ id: 'original', vertical: 'bottom' })
    expect(layouts[1].vertical).toBe('bottom')
    editor.commands.undo()
    expect(editor.getJSON()).toEqual(before)
    editor.commands.redo()
    expect(readPageLayouts(editor.getHTML())[2].id).toBe('original')
    expect(normalizePageBreakJson(editor.getJSON()).content?.filter(node => node.type === 'horizontalRule').at(-1)?.attrs?.pageId).toBe('original')
    editor.destroy()
  })

  it('keeps legacy pages inherited and clamps cover displacement in canvas pixels', () => {
    expect(readPageLayouts('<p>cover</p><hr class="page-break"><p>inner</p>')).toEqual([{ id: 'cover', vertical: 'inherit' }, { id: null, vertical: 'inherit' }])
    expect(normalizeCoverTopOffset(undefined)).toBe(0)
    expect(normalizeCoverTopOffset(-500)).toBe(-120)
    expect(normalizeCoverTopOffset(500)).toBe(120)
  })
})
