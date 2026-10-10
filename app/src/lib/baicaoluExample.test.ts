import { describe, expect, it } from 'vitest'
import type { JSONContent } from '@tiptap/react'
import { createEditorDocumentJSON } from '@/components/Editor/createEditorDocumentJSON'
import { createBaicaoluExample } from './baicaoluExample'

describe('百草路排版示例', () => {
  it('实际编辑器保留单个纯标题封面、人工断句及独立正文页', () => {
    const example = createBaicaoluExample()
    expect(example.decisionResolved).toBe(true)
    expect(example.needsSeparatorDecision).toBe(false)
    expect(example.cover.subtitle).toBeNull()
    const content = createEditorDocumentJSON(example.contentHtml) as JSONContent
    const nodes = content.content ?? []
    expect(nodes[0]).toMatchObject({
      type: 'heading', attrs: { level: 1 }, content: [
        { type: 'text', text: '普通人' },
        { type: 'hardBreak' },
        { type: 'text', text: '可以完整。' },
      ],
    })
    expect(nodes[1]).toMatchObject({ type: 'horizontalRule' })
    expect(nodes.filter((node) => node.type === 'horizontalRule')).toHaveLength(2)
    expect(nodes.slice(2).some((node) => node.type === 'heading' && node.attrs?.level === 1)).toBe(false)
    expect(example.releaseCopy).toBe('')
  })
})
