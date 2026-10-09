import { Editor, type JSONContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, describe, expect, it } from 'vitest'
import { TEXT_HIGHLIGHT_COLOR, TEXT_HIGHLIGHT_UNDERLINE_COLOR, TEXT_HIGHLIGHT_COLORS } from '@/lib/textHighlight'
import { TextHighlight } from './TextHighlight'

const editors: Editor[] = []

function makeEditor(content: string | JSONContent = '<p>start</p>') {
  const editor = new Editor({
    extensions: [StarterKit, TextHighlight],
    content,
  })
  editors.push(editor)
  return editor
}

afterEach(() => {
  for (const editor of editors.splice(0)) {
    if (!editor.isDestroyed) editor.destroy()
  }
})

function documentWithHighlight(attrs: Record<string, unknown>): JSONContent {
  return {
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: [{ type: 'text', text: '强调文字', marks: [{ type: 'textHighlight', attrs }] }],
    }],
  }
}

function highlightedElement(html: string): HTMLElement {
  const document = new DOMParser().parseFromString(html, 'text/html')
  const element = document.querySelector<HTMLElement>('[data-text-highlight]')
  if (!element) throw new Error('Expected a serialized highlight element')
  return element
}

describe('TextHighlight fixed palette invariant', () => {
  it.each(TEXT_HIGHLIGHT_COLORS)('round trips $label in both styles without recoloring it', ({ value }) => {
    for (const style of ['background', 'underline'] as const) {
      const source = makeEditor()
      source.commands.setContent(documentWithHighlight({ style, color: value.toLowerCase(), opacity: 0.37 }))
      const json = source.getJSON()
      expect(json.content?.[0]?.content?.[0]?.marks?.[0]?.attrs).toEqual({ style, color: value, opacity: 0.37 })
      expect(highlightedElement(source.getHTML()).dataset.highlightColor).toBe(value)
      const restoredJSON = makeEditor(json)
      const restoredHTML = makeEditor(source.getHTML())
      expect(restoredJSON.getJSON()).toEqual(json)
      expect(restoredHTML.getJSON()).toEqual(json)
    }
  })

  it('normalizes a pasted data color before storing and rendering it', () => {
    const editor = makeEditor(
      '<p><span data-text-highlight data-highlight-color="#00FF00" data-highlight-opacity="0.5">marked</span></p>',
    )

    const mark = editor.getJSON().content?.[0]?.content?.[0]?.marks?.[0]
    expect(mark?.attrs?.color).toBe(TEXT_HIGHLIGHT_COLOR)
    expect(editor.getHTML()).toContain('data-highlight-color="#7B3B8B"')
    expect(editor.getHTML()).toContain('rgba(123, 59, 139, 0.5)')
    expect(editor.getHTML()).not.toContain('#00FF00')
    editor.destroy()
  })

  it('canonicalizes a restored JSON mark and never renders its arbitrary hex', () => {
    const editor = makeEditor()
    editor.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'restored',
              marks: [
                {
                  type: 'textHighlight',
                  attrs: { color: '#00FF00', opacity: 0.75 },
                },
              ],
            },
          ],
        },
      ],
    })

    const mark = editor.getJSON().content?.[0]?.content?.[0]?.marks?.[0]
    expect(mark?.attrs?.color).toBe(TEXT_HIGHLIGHT_COLOR)
    expect(editor.getHTML()).toContain('data-highlight-color="#7B3B8B"')
    expect(editor.getHTML()).toContain('rgba(123, 59, 139, 0.75)')
    expect(editor.getHTML()).not.toContain('#00FF00')
    editor.destroy()
  })
})

describe('TextHighlight style round trips', () => {
  it.each([0, 0.37, 1])('preserves underline style and opacity %s through HTML, persisted JSON and HTML restoration', (opacity) => {
    const source = makeEditor(`<p>前<strong><u><span data-text-highlight data-highlight-style="underline" data-highlight-color="#FF0000" data-highlight-opacity="${opacity}">青绿</span></u></strong>后</p>`)
    const json = source.getJSON()
    const markedText = json.content?.[0]?.content?.find((node) => 'text' in node && node.text === '青绿')
    expect(markedText?.marks?.find((mark) => mark.type === 'textHighlight')?.attrs).toEqual({
      style: 'underline', color: TEXT_HIGHLIGHT_UNDERLINE_COLOR, opacity,
    })
    expect(markedText?.marks?.map((mark) => mark.type)).toEqual(['bold', 'underline', 'textHighlight'])

    const restored = makeEditor()
    restored.commands.setContent(JSON.parse(JSON.stringify(json)))
    expect(restored.getJSON()).toEqual(json)
    const html = restored.getHTML()
    const highlight = highlightedElement(html)
    expect(highlight.dataset.highlightStyle).toBe('underline')
    expect(highlight.dataset.highlightColor).toBe(TEXT_HIGHLIGHT_UNDERLINE_COLOR)
    expect(highlight.dataset.highlightOpacity).toBe(String(opacity))
    expect(highlight.style.backgroundImage).toContain(`rgba(49, 201, 193, ${opacity})`)
    expect(highlight.style.backgroundSize).toBe('100% 0.28em')
    expect(highlight.style.backgroundRepeat).toBe('no-repeat')
    expect(highlight.style.backgroundColor).toBe('')
    expect(highlight.getAttribute('style')).not.toBe('underline')
    expect(html).not.toContain('#FF0000')
    expect(makeEditor(html).getJSON()).toEqual(json)
  })

  it.each(['html', 'json'] as const)('defaults new underline opacity to 50%% when restoring %s without opacity', (format) => {
    const editor = makeEditor()
    editor.commands.setContent(format === 'html'
      ? '<p><span data-text-highlight data-highlight-style="underline">强调文字</span></p>'
      : documentWithHighlight({ style: 'underline' }))
    const expected = { style: 'underline', color: TEXT_HIGHLIGHT_UNDERLINE_COLOR, opacity: 0.5 }
    expect(editor.getJSON().content?.[0]?.content?.[0]?.marks?.[0]?.attrs).toEqual(expected)
    expect(highlightedElement(editor.getHTML()).dataset.highlightOpacity).toBe('0.5')
    expect(makeEditor(editor.getHTML()).getJSON()).toEqual(editor.getJSON())
  })

  it.each(['html', 'json'] as const)('keeps legacy %s without style or opacity as the purple 25%% background', (format) => {
    const editor = makeEditor()
    editor.commands.setContent(format === 'html'
      ? '<p><span data-text-highlight>强调文字</span></p>'
      : documentWithHighlight({ color: TEXT_HIGHLIGHT_COLOR }))
    expect(editor.getJSON().content?.[0]?.content?.[0]?.marks?.[0]?.attrs).toEqual({
      style: 'background', color: TEXT_HIGHLIGHT_COLOR, opacity: 0.25,
    })
    const highlight = highlightedElement(editor.getHTML())
    expect(highlight.dataset.highlightStyle).toBe('background')
    expect(highlight.style.backgroundColor).toBe('rgba(123, 59, 139, 0.25)')
    expect(highlight.style.backgroundImage).toBe('')
    expect(makeEditor(editor.getHTML()).getJSON()).toEqual(editor.getJSON())
  })

  it.each(['html', 'json'] as const)('falls back from an invalid %s style while preserving valid color and opacity', (format) => {
    const editor = makeEditor()
    editor.commands.setContent(format === 'html'
      ? '<p><span data-text-highlight data-highlight-style="wavy" data-highlight-color="#31C9C1" data-highlight-opacity="0.62">强调文字</span></p>'
      : documentWithHighlight({ style: 'wavy', color: TEXT_HIGHLIGHT_UNDERLINE_COLOR, opacity: 0.62 }))
    expect(editor.getJSON().content?.[0]?.content?.[0]?.marks?.[0]?.attrs).toEqual({
      style: 'background', color: TEXT_HIGHLIGHT_UNDERLINE_COLOR, opacity: 0.62,
    })
    const highlight = highlightedElement(editor.getHTML())
    expect(highlight.dataset.highlightStyle).toBe('background')
    expect(highlight.style.backgroundColor).toBe('rgba(49, 201, 193, 0.62)')
    expect(highlight.style.backgroundImage).toBe('')
    expect(editor.getHTML()).not.toContain('wavy')
    expect(makeEditor(editor.getHTML()).getJSON()).toEqual(editor.getJSON())
  })
})
