import { Editor } from '@tiptap/react'
import { closeHistory } from '@tiptap/pm/history'
import { describe, expect, it } from 'vitest'
import { createEditorExtensions } from '@/components/Editor/editorExtensions'
import { normalizePageBreakJson } from './pageBreak'
import { normalizeCoverTopOffset, normalizeInnerPageOffset, readPageLayouts, resolveInnerPageOffset } from './pageLayout'
import { BUILTIN_THEMES, normalizeTheme } from './themes'

describe('durable page layout boundaries', () => {
  it('keeps the original configured page identity when a copied break is inserted before it; undo restores exactly', () => {
    const editor = new Editor({ extensions: createEditorExtensions(), content: '<p>cover</p><hr class="page-break" data-page-id="original" data-page-vertical="top"><p>inner</p>' })
    const before = editor.getJSON()
    const copy = editor.state.schema.nodes.horizontalRule.create({ pageId: 'original', pageVertical: 'top' })
    editor.view.dispatch(closeHistory(editor.state.tr.insert(0, copy)))
    const layouts = readPageLayouts(editor.getHTML())
    expect(layouts[1].id).not.toBe('original')
    expect(layouts[2]).toEqual({ id: 'original', vertical: 'top', offset: null })
    expect(layouts[1].vertical).toBe('top')
    editor.commands.undo()
    expect(editor.getJSON()).toEqual(before)
    editor.commands.redo()
    expect(readPageLayouts(editor.getHTML())[2].id).toBe('original')
    expect(normalizePageBreakJson(editor.getJSON()).content?.filter(node => node.type === 'horizontalRule').at(-1)?.attrs?.pageId).toBe('original')
    editor.destroy()
  })

  it('keeps legacy pages inherited and clamps cover displacement in canvas pixels', () => {
    expect(readPageLayouts('<p>cover</p><hr class="page-break"><p>inner</p>')).toEqual([{ id: 'cover', vertical: 'inherit', offset: null }, { id: null, vertical: 'inherit', offset: null }])
    expect(normalizeCoverTopOffset(undefined)).toBe(0)
    expect(normalizeCoverTopOffset(-500)).toBe(-120)
    expect(normalizeCoverTopOffset(500)).toBe(120)
  })
})

describe('template-owned inner page default', () => {
  it('inherits template offsets but preserves an explicit zero, and bounds invalid values', () => {
    expect(resolveInnerPageOffset(null, 120)).toBe(120)
    expect(resolveInnerPageOffset(0, 120)).toBe(0)
    expect(resolveInnerPageOffset(-60, 120)).toBe(-60)
    expect(normalizeInnerPageOffset(999)).toBe(360)
    expect(normalizeInnerPageOffset(-999)).toBe(-360)
    expect(normalizeInnerPageOffset(12.6)).toBe(13)
    expect(normalizeInnerPageOffset(NaN)).toBe(0)
    expect(normalizeTheme({ ...BUILTIN_THEMES[0], innerOffsetDefault: 120 })?.innerOffsetDefault).toBe(120)
  })
  it('keeps independent page offsets through HTML, JSON and copied page boundaries', () => {
    const editor = new Editor({ extensions: createEditorExtensions(), content: '<p>cover</p><hr class="page-break" data-page-id="original" data-page-vertical="top" data-page-offset="120"><p>inner</p><hr class="page-break" data-page-offset="0"><p>third</p>' })
    const before = editor.getJSON()
    expect(readPageLayouts(editor.getHTML()).map(page => page.offset)).toEqual([null, 120, 0])
    const copy = editor.state.schema.nodes.horizontalRule.create({ pageId: 'original', pageVertical: 'top', pageOffset: 120 })
    editor.view.dispatch(closeHistory(editor.state.tr.insert(0, copy)))
    expect(readPageLayouts(editor.getHTML()).map(page => page.offset)).toEqual([null, 120, 120, 0])
    editor.commands.undo()
    expect(editor.getJSON()).toEqual(before)
    const restored = new Editor({ extensions: createEditorExtensions(), content: normalizePageBreakJson(before) })
    expect(readPageLayouts(restored.getHTML()).map(page => page.offset)).toEqual([null, 120, 0])
    editor.destroy()
    restored.destroy()
  })
  it('preserves the saved top position when normalizing a template', () => {
    expect(normalizeTheme({ ...BUILTIN_THEMES[0], innerVerticalDefault: 'top' })).toHaveProperty('innerVerticalDefault', 'top')
  })
  it('uses the existing template placement, named middle, for older templates', () => {
    expect(normalizeTheme(BUILTIN_THEMES[0])).toHaveProperty('innerVerticalDefault', 'middle')
  })
})
