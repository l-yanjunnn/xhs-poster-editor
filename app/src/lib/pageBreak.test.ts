import { describe, expect, it } from 'vitest'
import {
  normalizePageBreakHtml,
  normalizePageBreakJson,
  type PageBreakJsonNode,
} from './pageBreak'

function paragraph(text?: string): PageBreakJsonNode {
  return {
    type: 'paragraph',
    ...(text ? { content: [{ type: 'text', text }] } : {}),
  }
}

function listItem(
  text: string,
  extra: PageBreakJsonNode[] = [],
): PageBreakJsonNode {
  return { type: 'listItem', content: [paragraph(text), ...extra] }
}

describe('page-break content normalization', () => {
  it('lifts an old ordered-list page break and continues numbering', () => {
    const input: PageBreakJsonNode = {
      type: 'doc',
      content: [
        {
          type: 'orderedList',
          attrs: { start: 4 },
          content: [
            listItem('四', [{ type: 'horizontalRule' }]),
            listItem('五'),
          ],
        },
      ],
    }
    const snapshot = structuredClone(input)

    const normalized = normalizePageBreakJson(input)

    expect(input).toEqual(snapshot)
    expect(normalized.content?.map((node) => node.type)).toEqual([
      'orderedList',
      'horizontalRule',
      'orderedList',
    ])
    expect(normalized.content?.[0]?.attrs?.start).toBe(4)
    expect(normalized.content?.[2]?.attrs?.start).toBe(5)
    expect(normalizePageBreakJson(normalized)).toEqual(normalized)
  })

  it('keeps the current outer item and its nested hierarchy before the break', () => {
    const input: PageBreakJsonNode = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                paragraph('外层一'),
                {
                  type: 'bulletList',
                  content: [
                    listItem('嵌套一', [{ type: 'horizontalRule' }]),
                    listItem('嵌套二'),
                  ],
                },
              ],
            },
            listItem('外层二'),
          ],
        },
      ],
    }

    const normalized = normalizePageBreakJson(input)
    const prefix = normalized.content?.[0]
    const suffix = normalized.content?.[2]
    expect(normalized.content?.map((node) => node.type)).toEqual([
      'bulletList',
      'horizontalRule',
      'bulletList',
    ])
    expect(JSON.stringify(prefix)).toContain('嵌套一')
    expect(JSON.stringify(prefix)).toContain('嵌套二')
    expect(JSON.stringify(suffix)).toContain('外层二')
    const nestedBreaks: string[] = []
    const visit = (node: PageBreakJsonNode, parentType?: string) => {
      if (node.type === 'horizontalRule' && parentType !== 'doc') {
        nestedBreaks.push(parentType ?? 'unknown')
      }
      node.content?.forEach((child) => visit(child, node.type))
    }
    visit(normalized)
    expect(nestedBreaks).toEqual([])
  })

  it('moves a nested blockquote break after the whole quote', () => {
    const normalized = normalizePageBreakJson<PageBreakJsonNode>({
      type: 'doc',
      content: [
        {
          type: 'blockquote',
          content: [paragraph('引用一'), { type: 'horizontalRule' }, paragraph('引用二')],
        },
        paragraph('正文'),
      ],
    })

    expect(normalized.content?.map((node) => node.type)).toEqual([
      'blockquote',
      'horizontalRule',
      'paragraph',
    ])
    expect(JSON.stringify(normalized.content?.[0])).toContain('引用二')
  })

  it('normalizes pasted HTML without losing ordered-list type or nested items', () => {
    const html = normalizePageBreakHtml(
      '<ol start="4"><li><p>四</p><hr class="page-break"></li><li><p>五</p><ul><li><p>嵌套</p></li></ul></li></ol>',
    )
    const parsed = new DOMParser().parseFromString(html, 'text/html')
    const children = Array.from(parsed.body.children)

    expect(children.map((node) => node.tagName)).toEqual(['OL', 'HR', 'OL'])
    expect(children[0]?.getAttribute('start')).toBe('4')
    expect(children[2]?.getAttribute('start')).toBe('5')
    expect(children[2]?.querySelector('ul li')?.textContent).toBe('嵌套')
    expect(children[1]?.classList.contains('page-break')).toBe(true)
  })

  it('consumes an empty list item that only carried a page break', () => {
    const normalized = normalizePageBreakJson<PageBreakJsonNode>({
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            listItem('前'),
            { type: 'listItem', content: [paragraph(), { type: 'horizontalRule' }] },
            listItem('后'),
          ],
        },
      ],
    })
    expect(JSON.stringify(normalized)).not.toContain('"type":"paragraph"},{"type":"horizontalRule"')
    expect(normalized.content?.map((node) => node.type)).toEqual([
      'bulletList',
      'horizontalRule',
      'bulletList',
    ])
  })
})
