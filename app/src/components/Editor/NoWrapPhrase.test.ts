import { Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { describe, expect, it } from 'vitest'
import { NoWrapPhrase } from './NoWrapPhrase'

describe('NoWrapPhrase mark', () => {
  it('以稳定 data attribute 序列化，并可以再次解析', () => {
    const editor = new Editor({
      extensions: [StarterKit, NoWrapPhrase],
      content: '<p>百日整治行动</p>',
    })
    editor.commands.setTextSelection({ from: 1, to: 5 })
    editor.commands.setMark('noWrapPhrase')

    const html = editor.getHTML()
    expect(html).toContain('data-no-wrap-phrase=""')
    expect(html).toContain('class="nowrap-phrase"')
    expect(html).toContain('>百日整治</span>行动</p>')

    const restored = new Editor({
      extensions: [StarterKit, NoWrapPhrase],
      content: html,
    })
    expect(restored.getJSON().content?.[0].content?.[0].marks).toEqual([
      { type: 'noWrapPhrase' },
    ])

    editor.destroy()
    restored.destroy()
  })
})
