import { Editor } from '@tiptap/react'
import { createEditorExtensions } from '@/components/Editor/editorExtensions'
import { describe, expect, it } from 'vitest'
import { normalizeIncomingContent } from '../components/Editor/contentNormalization'
import { analyzeImportDocument } from './importDocument'

describe('2026-09 reliability boundaries', () => {
  it('preserves rich-text spaces through the production parser without manufacturing paragraphs from HTML indentation', () => {
    const editor = new Editor({ extensions: createEditorExtensions(), content: '<h1>标题</h1>\n\n<p><strong>管家：</strong>   我有一千万</p>\n\n<hr class="page-break">\n\n<p>内页</p>' })
    expect(editor.getJSON().content).toHaveLength(4)
    expect(editor.getText()).toContain('管家：   我有一千万')
    const restored = new Editor({ extensions: createEditorExtensions(), content: editor.getJSON() })
    expect(restored.getJSON()).toEqual(editor.getJSON())
    restored.destroy(); editor.destroy()
  })
  it('preserves intentional Unicode whitespace on content entry', () => {
    for (const space of [' ', '   ', '\u00a0', '\u3000']) {
      const html = `<p><strong>管家：</strong>${space}我有一千万</p>`
      const result = normalizeIncomingContent(html) as string
      const doc = new DOMParser().parseFromString(result, 'text/html')
      expect(doc.body.textContent).toBe(`管家：${space}我有一千万`)
    }
  })
  it.each(['```md', '~~~markdown', '````md'])('ignores headings inside %s cover fences', (fence) => {
    const closing = fence.match(/^[`~]+/)![0]
    const code = `${fence}\n## 伪标题\n## 伪副标题\n${closing}`
    const result = analyzeImportDocument(`# 封面\n${code}\n## 真实标题\n## 真实副标题\n# 正文\n发布文案`)
    expect(result.cover.title).toBe('真实标题')
    expect(result.cover.subtitle).toBe('真实副标题')
    expect(result.cover.bodySource).toContain(code)
  })
})
