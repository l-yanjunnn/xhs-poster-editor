import { Editor } from '@tiptap/react'
import { TextSelection } from '@tiptap/pm/state'
import { act, createElement, createRef } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { EditorPane, type EditorHandle } from './Editor'
import { normalizeIncomingContent } from './contentNormalization'
import { createEditorExtensions } from './editorExtensions'

function makeEditor(content: object | string) {
  return new Editor({
    extensions: createEditorExtensions(),
    content: content as never,
  })
}

function getFirstImageAttrs(handle: EditorHandle | null) {
  const json = handle?.getJSON() as {
    content?: Array<{
      type?: string
      attrs?: Record<string, unknown>
    }>
  } | null
  return json?.content?.find((node) => node.type === 'image')?.attrs
}

describe('v1.4 editor extensions', () => {
  it('round-trips one root img with semantic attrs and no pixel height', () => {
    const editor = makeEditor({
      type: 'doc',
      content: [
        {
          type: 'image',
          attrs: {
            src: 'https://example.com/image.png',
            assetId: 'asset-1',
            imageId: 'image-1',
            width: '66%',
            height: null,
            align: 'center',
          },
        },
      ],
    })

    const parsed = new DOMParser().parseFromString(editor.getHTML(), 'text/html')
    const images = parsed.querySelectorAll('img')
    expect(images).toHaveLength(1)
    expect(images[0]!.parentElement).toBe(parsed.body)
    expect(images[0]!.dataset.imageId).toBe('image-1')
    expect(images[0]!.dataset.align).toBe('center')
    expect(images[0]!.style.width).toBe('66%')
    expect(images[0]!.getAttribute('height')).toBeNull()

    const restored = makeEditor(editor.getJSON())
    expect(restored.getJSON()).toEqual(editor.getJSON())
    editor.destroy()
    restored.destroy()
  })

  it('deduplicates image ids after a content transaction', () => {
    const editor = makeEditor('<p>start</p>')
    editor.commands.setContent({
      type: 'doc',
      content: [
        { type: 'image', attrs: { src: 'a.png', imageId: 'duplicate' } },
        { type: 'image', attrs: { src: 'b.png', imageId: 'duplicate' } },
      ],
    })
    const ids = editor
      .getJSON()
      .content!.filter((node) => node.type === 'image')
      .map((node) => node.attrs!.imageId)
    expect(ids[0]).toBe('duplicate')
    expect(ids[1]).toMatch(/^image-/)
    expect(new Set(ids).size).toBe(2)
    editor.destroy()
  })

  it('stores highlight semantics and does not include later typing', () => {
    const editor = makeEditor('<p>abcdef</p>')
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1, 4)),
    )
    editor.commands.setMark('textHighlight', {
      color: '#7B3B8B',
      opacity: 0.5,
    })
    editor.commands.setTextSelection(4)
    editor.commands.insertContent('Z')

    const parsed = new DOMParser().parseFromString(editor.getHTML(), 'text/html')
    const highlighted = parsed.querySelector('[data-text-highlight]')
    expect(highlighted?.textContent).toBe('abc')
    expect(highlighted?.getAttribute('data-highlight-color')).toBe('#7B3B8B')
    expect(highlighted?.getAttribute('data-highlight-opacity')).toBe('0.5')
    expect(parsed.body.textContent).toBe('abcZdef')

    const restored = makeEditor(editor.getJSON())
    expect(restored.getHTML()).toContain('data-text-highlight')
    expect(restored.getJSON()).toEqual(editor.getJSON())
    editor.destroy()
    restored.destroy()
  })

  it('undoes semantic image attrs without reverting a later non-history src sync', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const editorRef = createRef<EditorHandle>()

    await act(async () => {
      root.render(
        createElement(EditorPane, {
          ref: editorRef,
          initialContent:
            '<img src="old.png" data-image-id="image-history" data-align="left" style="width: 33%">',
        }),
      )
    })

    expect(
      editorRef.current?.commitImageAttributes('image-history', {
        width: '66%',
        align: 'right',
      }),
    ).toBe(true)
    expect(
      editorRef.current?.syncImageSources([
        { imageId: 'image-history', src: 'restored.png' },
      ]),
    ).toBe(true)
    expect(editorRef.current?.undo()).toBe(true)

    expect(getFirstImageAttrs(editorRef.current)).toMatchObject({
      src: 'restored.png',
      width: '33%',
      align: 'left',
    })

    expect(editorRef.current?.redo()).toBe(true)
    expect(getFirstImageAttrs(editorRef.current)).toMatchObject({
      src: 'restored.png',
      width: '66%',
      align: 'right',
    })

    await act(async () => root.unmount())
    host.remove()
  })

  it('normalizes legacy nested page breaks at the shared setContent boundary', () => {
    const normalized = normalizeIncomingContent({
      type: 'doc',
      content: [
        {
          type: 'orderedList',
          attrs: { start: 4 },
          content: [
            {
              type: 'listItem',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: '第四项' }] },
                { type: 'horizontalRule' },
              ],
            },
            {
              type: 'listItem',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: '第五项' }] },
              ],
            },
          ],
        },
      ],
    })
    const editor = makeEditor(normalized)
    const json = editor.getJSON()
    expect(json.content?.slice(0, 3).map((node) => node.type)).toEqual([
      'orderedList',
      'horizontalRule',
      'orderedList',
    ])
    expect(json.content?.[2]?.attrs?.start).toBe(5)
    editor.destroy()
  })
})
