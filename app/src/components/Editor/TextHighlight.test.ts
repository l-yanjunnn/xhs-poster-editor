import { Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { describe, expect, it } from 'vitest'
import { TEXT_HIGHLIGHT_COLOR } from '@/lib/textHighlight'
import { TextHighlight } from './TextHighlight'

function makeEditor(content = '<p>start</p>') {
  return new Editor({
    extensions: [StarterKit, TextHighlight],
    content,
  })
}

describe('TextHighlight fixed color invariant', () => {
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
