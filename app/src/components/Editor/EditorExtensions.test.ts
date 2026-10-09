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
  it('exposes only H1–H3 commands and keyboard shortcuts', () => {
    const editor = makeEditor('<p>段落</p>')

    expect(
      editor.extensionManager.extensions.find((item) => item.name === 'heading')
        ?.options.levels,
    ).toEqual([1, 2, 3])
    for (const level of [4, 5, 6] as const) {
      expect(editor.commands.setHeading({ level })).toBe(false)
      editor.commands.keyboardShortcut(`Mod-Alt-${level}`)
      expect(editor.getJSON().content?.[0]?.type).toBe('paragraph')
    }

    expect(editor.commands.keyboardShortcut('Mod-Alt-3')).toBe(true)
    expect(editor.getJSON().content?.[0]).toMatchObject({
      type: 'heading',
      attrs: { level: 3 },
    })
    editor.destroy()
  })

  it('downgrades legacy H4–H6 content to the nearest supported heading', () => {
    const html = makeEditor(
      normalizeIncomingContent('<h4>四级</h4><h5>五级</h5><h6>六级</h6>'),
    )
    expect(html.getJSON().content).toEqual([
      expect.objectContaining({ type: 'heading', attrs: { level: 3 } }),
      expect.objectContaining({ type: 'heading', attrs: { level: 3 } }),
      expect.objectContaining({ type: 'heading', attrs: { level: 3 } }),
    ])

    const json = makeEditor(
      normalizeIncomingContent({
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 6 },
            content: [{ type: 'text', text: '历史标题' }],
          },
        ],
      }),
    )
    expect(json.getJSON().content?.[0]).toMatchObject({
      type: 'heading',
      attrs: { level: 3 },
    })
    expect(json.getText()).toBe('历史标题')
    html.destroy()
    json.destroy()
  })

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

  it('preserves underline style through JSON/HTML and canonicalizes its color without changing text', () => {
    const editor = makeEditor('<h1>创始人与付费咨询</h1>')
    editor.commands.setTextSelection({ from: 1, to: 4 })
    editor.commands.setMark('textHighlight', { style: 'underline', color: '#FF0000', opacity: 0.5 })
    const mark = editor.state.doc.firstChild!.firstChild!.marks[0]
    expect(mark.attrs).toMatchObject({ style: 'underline', color: '#31C9C1', opacity: 0.5 })
    const parsed = new DOMParser().parseFromString(editor.getHTML(), 'text/html')
    const highlighted = parsed.querySelector<HTMLElement>('[data-text-highlight]')!
    expect(highlighted.dataset.highlightStyle).toBe('underline')
    expect(highlighted.dataset.highlightColor).toBe('#31C9C1')
    expect(highlighted.style.backgroundImage).toContain('linear-gradient')
    expect(highlighted.style.backgroundSize).toBe('100% 0.28em')
    expect(highlighted.textContent).toBe('创始人')
    const fromJSON = makeEditor(editor.getJSON())
    const fromHTML = makeEditor(editor.getHTML())
    expect(fromJSON.getJSON()).toEqual(editor.getJSON())
    expect(fromHTML.state.doc.firstChild!.firstChild!.marks[0].attrs).toMatchObject(mark.attrs)
    expect(fromHTML.state.doc.textContent).toBe('创始人与付费咨询')
    editor.destroy()
    fromJSON.destroy()
    fromHTML.destroy()
  })

  it('defaults missing legacy style to purple and missing underline opacity to 50%', () => {
    const editor = makeEditor({ type: 'doc', content: [{ type: 'paragraph', content: [
      { type: 'text', text: '旧底色', marks: [{ type: 'textHighlight', attrs: { color: '#FF0000' } }] },
      { type: 'text', text: '新划线', marks: [{ type: 'textHighlight', attrs: { style: 'underline' } }] },
    ] }] })
    const parsed = new DOMParser().parseFromString(editor.getHTML(), 'text/html')
    const highlights = Array.from(parsed.querySelectorAll<HTMLElement>('[data-text-highlight]'))
    expect(highlights.map(node => [node.dataset.highlightStyle, node.dataset.highlightColor, node.dataset.highlightOpacity])).toEqual([
      ['background', '#7B3B8B', '0.25'], ['underline', '#31C9C1', '0.5'],
    ])
    // Imported JSON may omit defaults; the first ordinary transaction canonicalizes them.
    editor.commands.setTextSelection(2)
    expect(editor.state.doc.firstChild!.firstChild!.marks[0].attrs).toMatchObject({ style: 'background', color: '#7B3B8B', opacity: 0.25 })
    expect(editor.state.doc.firstChild!.lastChild!.marks[0].attrs).toMatchObject({ style: 'underline', color: '#31C9C1', opacity: 0.5 })
    editor.destroy()
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

  it('guards raw editor.commands.setContent and keeps normalization in one history event', () => {
    const editor = makeEditor('<p>操作前</p>')
    editor.commands.setTextSelection(2)
    const before = editor.getJSON()

    editor.commands.setContent({
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

    expect(editor.getJSON().content?.slice(0, 3).map((node) => node.type)).toEqual([
      'orderedList',
      'horizontalRule',
      'orderedList',
    ])
    editor.state.doc.descendants((node, _position, parent) => {
      if (node.type.name === 'horizontalRule') {
        expect(parent?.type.name).toBe('doc')
      }
      return true
    })
    expect(editor.commands.undo()).toBe(true)
    expect(editor.getJSON()).toEqual(before)
    expect(editor.commands.redo()).toBe(true)
    expect(editor.getJSON().content?.[1]?.type).toBe('horizontalRule')
    editor.destroy()
  })
})
