import type { Editor } from '@tiptap/react'
import { TextSelection } from '@tiptap/pm/state'
import { act, createElement, createRef, type RefObject } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  TEXT_HIGHLIGHT_COLOR,
  TEXT_HIGHLIGHT_UNDERLINE_COLOR,
} from '@/lib/textHighlight'
import { EditorPane, type EditorHandle, type TextSelectionState } from './Editor'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true

interface MountedEditor {
  host: HTMLDivElement
  root: Root
  handle: RefObject<EditorHandle | null>
  editor: Editor
  onUpdate: ReturnType<typeof vi.fn>
  onSelection: ReturnType<typeof vi.fn<(state: TextSelectionState) => void>>
}

const mounted: MountedEditor[] = []

async function mountEditor(initialContent: string): Promise<MountedEditor> {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const handle = createRef<EditorHandle>()
  const onUpdate = vi.fn()
  const onSelection = vi.fn<(state: TextSelectionState) => void>()
  await act(async () => {
    root.render(createElement(EditorPane, {
      ref: handle,
      initialContent,
      onUpdate,
      onTextSelectionStateChange: onSelection,
    }))
  })
  const editor = (window as unknown as { __editor: Editor }).__editor
  const result = { host, root, handle, editor, onUpdate, onSelection }
  mounted.push(result)
  return result
}

afterEach(async () => {
  for (const item of mounted.splice(0)) {
    await act(async () => item.root.unmount())
    item.host.remove()
  }
})

async function select(item: MountedEditor, from: number, to = from) {
  await act(async () => {
    item.editor.view.dispatch(item.editor.state.tr.setSelection(
      TextSelection.create(item.editor.state.doc, from, to),
    ))
  })
}

function textRuns(editor: Editor) {
  const runs: Array<{
    text: string
    highlight: Record<string, unknown> | null
    otherMarks: string[]
  }> = []
  editor.state.doc.descendants((node) => {
    if (node.isText) {
      runs.push({
        text: node.text!,
        highlight: node.marks.find((mark) => mark.type.name === 'textHighlight')?.attrs ?? null,
        otherMarks: node.marks.filter((mark) => mark.type.name !== 'textHighlight').map((mark) => mark.type.name),
      })
    }
  })
  return runs
}

const mixedContent = '<p><strong><span data-text-highlight data-highlight-opacity="0.25">甲乙</span></strong><u><span data-text-highlight data-highlight-style="underline" data-highlight-opacity="0.5">丙丁</span></u>戊己</p>'

describe('Editor highlight commands', () => {
  it('applies a style only to the selected title word and restores it in one undo/redo step', async () => {
    const item = await mountEditor('<h1>甲<strong><u>乙丙</u></strong>丁</h1><p>正文</p>')
    await select(item, 2, 4)
    const before = item.handle.current!.getJSON()
    item.onUpdate.mockClear()

    let changed = false
    await act(async () => { changed = item.handle.current!.setTextHighlight(0.5, 'underline') })
    expect(changed).toBe(true)
    expect(item.onUpdate).toHaveBeenCalledOnce()
    expect(textRuns(item.editor)).toEqual([
      { text: '甲', highlight: null, otherMarks: [] },
      { text: '乙丙', highlight: { style: 'underline', color: TEXT_HIGHLIGHT_UNDERLINE_COLOR, opacity: 0.5 }, otherMarks: ['bold', 'underline'] },
      { text: '丁', highlight: null, otherMarks: [] },
      { text: '正文', highlight: null, otherMarks: [] },
    ])
    expect([item.editor.state.selection.from, item.editor.state.selection.to]).toEqual([2, 4])
    const applied = item.handle.current!.getJSON()
    await act(async () => { expect(item.handle.current!.undo()).toBe(true) })
    expect(item.handle.current!.getJSON()).toEqual(before)
    await act(async () => { expect(item.handle.current!.redo()).toBe(true) })
    expect(item.handle.current!.getJSON()).toEqual(applied)
  })

  it('preserves each mixed run style when changing opacity and gives unmarked text the legacy background', async () => {
    const item = await mountEditor(mixedContent)
    await select(item, 1, 7)
    const before = item.handle.current!.getJSON()
    expect(item.onSelection.mock.lastCall?.[0]).toMatchObject({ active: true, mixedStyle: true })

    await act(async () => { expect(item.handle.current!.setTextHighlight(0.37)).toBe(true) })
    expect(textRuns(item.editor)).toEqual([
      { text: '甲乙', highlight: { style: 'background', color: TEXT_HIGHLIGHT_COLOR, opacity: 0.37 }, otherMarks: ['bold'] },
      { text: '丙丁', highlight: { style: 'underline', color: TEXT_HIGHLIGHT_UNDERLINE_COLOR, opacity: 0.37 }, otherMarks: ['underline'] },
      { text: '戊己', highlight: { style: 'background', color: TEXT_HIGHLIGHT_COLOR, opacity: 0.37 }, otherMarks: [] },
    ])
    expect(item.onSelection.mock.lastCall?.[0]).toMatchObject({ highlighted: true, mixedStyle: true })
    await act(async () => { expect(item.handle.current!.undo()).toBe(true) })
    expect(item.handle.current!.getJSON()).toEqual(before)
  })

  it('unifies explicitly chosen styles, clears both shapes without removing other marks, and keeps each action undoable', async () => {
    const item = await mountEditor(mixedContent)
    await select(item, 1, 7)
    const original = item.handle.current!.getJSON()
    await act(async () => { expect(item.handle.current!.setTextHighlight(0.6, 'underline')).toBe(true) })
    expect(textRuns(item.editor).map((run) => run.highlight)).toEqual([
      { style: 'underline', color: TEXT_HIGHLIGHT_COLOR, opacity: 0.6 },
      { style: 'underline', color: TEXT_HIGHLIGHT_UNDERLINE_COLOR, opacity: 0.6 },
      { style: 'underline', color: TEXT_HIGHLIGHT_UNDERLINE_COLOR, opacity: 0.6 },
    ])
    expect(item.onSelection.mock.lastCall?.[0]).toMatchObject({ style: 'underline', mixedStyle: false, opacity: 0.6 })
    const unified = item.handle.current!.getJSON()

    await act(async () => { expect(item.handle.current!.clearTextHighlight()).toBe(true) })
    expect(textRuns(item.editor)).toEqual([
      { text: '甲乙', highlight: null, otherMarks: ['bold'] },
      { text: '丙丁', highlight: null, otherMarks: ['underline'] },
      { text: '戊己', highlight: null, otherMarks: [] },
    ])
    await act(async () => { expect(item.handle.current!.undo()).toBe(true) })
    expect(item.handle.current!.getJSON()).toEqual(unified)
    await act(async () => { expect(item.handle.current!.undo()).toBe(true) })
    expect(item.handle.current!.getJSON()).toEqual(original)
  })

  it('changes only shape across mixed colors and opacities, including one-step undo/redo', async () => {
    const item = await mountEditor('<p><span data-text-highlight data-highlight-color="#F2C94C" data-highlight-opacity="0.25">甲乙</span><span data-text-highlight data-highlight-style="underline" data-highlight-color="#EF7998" data-highlight-opacity="0.7">丙丁</span></p>')
    await select(item, 1, 5)
    expect(item.onSelection.mock.lastCall?.[0]).toMatchObject({ mixedStyle: true, mixedColor: true })
    const before = item.handle.current!.getJSON()
    await act(async () => { expect(item.handle.current!.setTextHighlight(undefined, 'underline')).toBe(true) })
    expect(textRuns(item.editor).map(run => run.highlight)).toEqual([
      { style: 'underline', color: '#F2C94C', opacity: 0.25 },
      { style: 'underline', color: '#EF7998', opacity: 0.7 },
    ])
    expect(item.onSelection.mock.lastCall?.[0]).toMatchObject({ mixedStyle: false, mixedColor: true })
    const after = item.handle.current!.getJSON()
    await act(async () => { expect(item.handle.current!.undo()).toBe(true) })
    expect(item.handle.current!.getJSON()).toEqual(before)
    await act(async () => { expect(item.handle.current!.redo()).toBe(true) })
    expect(item.handle.current!.getJSON()).toEqual(after)
  })

  it('changes only color, then only opacity, without resetting mixed shapes or other marks', async () => {
    const item = await mountEditor(mixedContent)
    await select(item, 1, 7)
    const before = item.handle.current!.getJSON()
    await act(async () => { expect(item.handle.current!.setTextHighlight(undefined, undefined, '#5B8DEF')).toBe(true) })
    expect(textRuns(item.editor).map(run => run.highlight)).toEqual([
      { style: 'background', color: '#5B8DEF', opacity: 0.25 },
      { style: 'underline', color: '#5B8DEF', opacity: 0.5 },
      { style: 'background', color: '#5B8DEF', opacity: 0.25 },
    ])
    expect(item.onSelection.mock.lastCall?.[0]).toMatchObject({ color: '#5B8DEF', mixedColor: false, mixedStyle: true })
    const colored = item.handle.current!.getJSON()
    await act(async () => { expect(item.handle.current!.setTextHighlight(0.6)).toBe(true) })
    expect(textRuns(item.editor).map(run => run.highlight)).toEqual([
      { style: 'background', color: '#5B8DEF', opacity: 0.6 },
      { style: 'underline', color: '#5B8DEF', opacity: 0.6 },
      { style: 'background', color: '#5B8DEF', opacity: 0.6 },
    ])
    expect(textRuns(item.editor).map(run => run.otherMarks)).toEqual([['bold'], ['underline'], []])
    await act(async () => { expect(item.handle.current!.undo()).toBe(true) })
    expect(item.handle.current!.getJSON()).toEqual(colored)
    await act(async () => { expect(item.handle.current!.undo()).toBe(true) })
    expect(item.handle.current!.getJSON()).toEqual(before)
  })

  it('reports color-only selection changes and treats an identical color application as a no-op', async () => {
    const item = await mountEditor('<p><span data-text-highlight data-highlight-color="#F2C94C" data-highlight-opacity="0.25">甲乙</span><span data-text-highlight data-highlight-color="#EF7998" data-highlight-opacity="0.25">丙丁</span></p>')
    await select(item, 1, 3)
    expect(item.onSelection.mock.lastCall?.[0]).toMatchObject({ color: '#F2C94C', mixedColor: false })
    item.onSelection.mockClear()
    await select(item, 3, 5)
    expect(item.onSelection).toHaveBeenCalledOnce()
    expect(item.onSelection.mock.lastCall?.[0]).toMatchObject({ color: '#EF7998', mixedColor: false })
    const before = item.handle.current!.getJSON()
    item.onUpdate.mockClear()
    await act(async () => { expect(item.handle.current!.setTextHighlight(undefined, undefined, '#EF7998')).toBe(false) })
    expect(item.onUpdate).not.toHaveBeenCalled()
    expect(item.handle.current!.getJSON()).toEqual(before)
    expect(item.editor.can().undo()).toBe(false)
  })

  it('reports a style-only selection change and avoids history or update events for no-op commands', async () => {
    const item = await mountEditor('<p><span data-text-highlight data-highlight-opacity="0.25">甲乙</span><span data-text-highlight data-highlight-style="underline" data-highlight-opacity="0.25">丙丁</span></p>')
    await select(item, 1, 3)
    expect(item.onSelection.mock.lastCall?.[0]).toMatchObject({ style: 'background', opacity: 0.25, mixedStyle: false })
    item.onSelection.mockClear()
    await select(item, 3, 5)
    expect(item.onSelection).toHaveBeenCalledOnce()
    expect(item.onSelection.mock.lastCall?.[0]).toMatchObject({ style: 'underline', opacity: 0.25, mixedStyle: false })
    const before = item.handle.current!.getJSON()
    item.onUpdate.mockClear()
    await act(async () => { expect(item.handle.current!.setTextHighlight(0.25, 'underline')).toBe(false) })
    expect(item.onUpdate).not.toHaveBeenCalled()
    expect(item.editor.can().undo()).toBe(false)
    expect(item.handle.current!.getJSON()).toEqual(before)

    await select(item, 2)
    await act(async () => {
      expect(item.handle.current!.setTextHighlight(0.5, 'underline')).toBe(false)
      expect(item.handle.current!.clearTextHighlight()).toBe(false)
    })
    expect(item.handle.current!.getJSON()).toEqual(before)
    expect(item.onUpdate).not.toHaveBeenCalled()
  })
})
