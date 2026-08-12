import { Editor } from '@tiptap/react'
import { describe, expect, it } from 'vitest'
import { createEditorExtensions } from '@/components/Editor/editorExtensions'
import {
  ImportDocumentError,
  ORDINARY_POST_IMAGE_LIMIT,
  analyzeImportDocument,
  applySeparatorDecision,
  getPlatformStatus,
  validateImportFilename,
} from './importDocument'

function exactDocument(pageCount: number): string {
  const pages = [
    '## 主标题\n\n## 副标题\n\n封面导语',
    ...Array.from(
      { length: Math.max(0, pageCount - 1) },
      (_value, index) =>
        `## 第 ${index + 2} 页\n\n第 ${index + 2} 页正文 **重点**`,
    ),
  ]
  return `# 封面\n\n${pages.join('\n\n---\n\n')}\n\n# 正文\n\n发布文案\n\n#话题`
}

function makeEditor(contentHtml: string): Editor {
  return new Editor({
    extensions: createEditorExtensions(),
    content: contentHtml,
  })
}

describe('importDocument', () => {
  it('校验 .md / .txt 扩展名，并拒绝其他文件', () => {
    expect(validateImportFilename('文稿.MD')).toBe(true)
    expect(validateImportFilename('文稿.txt')).toBe(true)
    expect(() => validateImportFilename('文稿.pdf')).toThrowError(
      expect.objectContaining({ code: 'UNSUPPORTED_FILE' }),
    )
  })

  it('识别专用结构，把全部页放入同一份可编辑 Tiptap HTML', () => {
    const result = analyzeImportDocument(exactDocument(3), {
      sourceName: '申论文稿.md',
    })

    expect(result.sourceName).toBe('申论文稿.md')
    expect(result.isExactStructure).toBe(true)
    expect(result.cover).toMatchObject({ title: '主标题', subtitle: '副标题' })
    expect(result.pageCount).toBe(3)
    expect(result.pages.map((page) => page.number)).toEqual([1, 2, 3])
    expect(result.contentHtml.match(/class="page-break"/g)).toHaveLength(2)
    expect(result.contentHtml).toContain('<h1>主标题</h1><p>副标题</p>')
    expect(result.contentHtml).toContain('<strong>重点</strong>')
    expect(result.contentHtml).not.toContain('# 封面')
    expect(result.contentHtml).not.toContain('发布文案')

    const editor = makeEditor(result.contentHtml)
    try {
      const rootTypes = editor.getJSON().content?.map((node) => node.type)
      expect(rootTypes?.filter((type) => type === 'horizontalRule')).toHaveLength(2)
      editor.state.doc.descendants((node, _position, parent) => {
        if (node.type.name === 'horizontalRule') {
          expect(parent?.type.name).toBe('doc')
        }
        return true
      })
      expect(editor.getText()).toContain('第 3 页正文')
    } finally {
      editor.destroy()
    }
  })

  it('发布文案只提取一份，不进入图片内容', () => {
    const result = analyzeImportDocument(exactDocument(2))

    expect(result.releaseCopy).toBe('发布文案\n\n#话题')
    expect(result.releaseParagraphCount).toBe(2)
    expect(result.hashtagCount).toBe(1)
    expect(result.releaseHtml).toContain('#话题')
    expect(result.rawMainSource).not.toContain('发布文案')
    expect(result.pages.some((page) => page.source.includes('#话题'))).toBe(
      false,
    )
  })

  it('普通文稿的 --- 必须先完成一次性全局决策', () => {
    const source = '# 普通文稿\n\n第一段\n\n---\n\n第二段'
    const pending = analyzeImportDocument(source)

    expect(pending.needsSeparatorDecision).toBe(true)
    expect(pending.decisionResolved).toBe(false)
    expect(pending.separatorMode).toBeNull()
    expect(pending.pageCount).toBe(2)

    const asPages = applySeparatorDecision(pending, 'pages')
    expect(asPages.decisionResolved).toBe(true)
    expect(asPages.pageCount).toBe(2)
    expect(asPages.contentHtml).toContain('<hr class="page-break">')

    const asDivider = applySeparatorDecision(pending, 'divider')
    expect(asDivider.decisionResolved).toBe(true)
    expect(asDivider.pageCount).toBe(1)
    expect(asDivider.contentHtml).toContain('<hr class="divider">')
    expect(asDivider.contentHtml).not.toContain('class="page-break"')
  })

  it('4 个及以上连字符同样按分隔线处理（CommonMark thematic break）', () => {
    const pending = analyzeImportDocument('# 普通文稿\n\n第一段\n\n----\n\n第二段')

    expect(pending.needsSeparatorDecision).toBe(true)
    expect(pending.pageCount).toBe(2)

    const asDivider = applySeparatorDecision(pending, 'divider')
    expect(asDivider.contentHtml).toContain('<hr class="divider">')
    expect(asDivider.contentHtml).not.toContain('----')
  })

  it('代码块和引用中的 --- 不会被误判为分页', () => {
    const result = analyzeImportDocument(
      '# 示例\n\n```md\n---\n# 封面\n```\n\n> ---\n> # 正文\n\n结束',
    )

    expect(result.isExactStructure).toBe(false)
    expect(result.separatorCount).toBe(0)
    expect(result.needsSeparatorDecision).toBe(false)
    expect(result.pageCount).toBe(1)
    expect(result.contentHtml).toContain('<pre><code>---\n# 封面</code></pre>')
    expect(result.contentHtml).toContain('<blockquote><p>---<br># 正文</p></blockquote>')
  })

  it('保留标题、引用、列表、粗体、行内代码和软换行语义', () => {
    const result = analyzeImportDocument(
      '# 标题\n\n第一行\n第二行 **重点** `code`\n\n> 引用\n\n- 项目一\n- 项目二\n\n3. 第三项',
    )

    expect(result.preservedTypes).toEqual(['标题', '引用', '列表', '粗体'])
    expect(result.contentHtml).toContain(
      '<p>第一行<br>第二行 <strong>重点</strong> <code>code</code></p>',
    )
    expect(result.contentHtml).toContain('<blockquote><p>引用</p></blockquote>')
    expect(result.contentHtml).toContain(
      '<ul><li><p>项目一</p></li><li><p>项目二</p></li></ul>',
    )
    expect(result.contentHtml).toContain('<ol start="3">')
  })

  it('输出固定 allowlist HTML，不允许原文注入脚本、事件或远程图片', () => {
    const result = analyzeImportDocument(
      '# 安全\n\n<script>alert(1)</script> <img src=x onerror=alert(2)> **重点**',
    )

    const parsed = new DOMParser().parseFromString(
      result.contentHtml,
      'text/html',
    )
    expect(parsed.querySelector('script')).toBeNull()
    expect(parsed.querySelector('img')).toBeNull()
    expect(result.contentHtml).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(result.contentHtml).toContain(
      '&lt;img src=x onerror=alert(2)&gt;',
    )
    expect(result.contentHtml).toContain('<strong>重点</strong>')
  })

  it('精确输出 17 / 18 / 19+ 普通图文边界文案', () => {
    expect(ORDINARY_POST_IMAGE_LIMIT).toBe(18)
    expect(getPlatformStatus(17)).toEqual({
      tone: 'ok',
      label: '可作为一篇普通图文发布',
    })
    expect(getPlatformStatus(18)).toEqual({
      tone: 'limit',
      label: '18 张，达到当前普通图文单篇上限',
    })
    expect(getPlatformStatus(19)).toEqual({
      tone: 'over',
      label: '共 19 张，超过普通图文单篇上限 18 张；仍会完整生成',
    })
  })

  it.each([17, 18, 19])(
    '%s 页仍是一份连续文档，没有丢页或重复页',
    (pageCount) => {
      const result = analyzeImportDocument(exactDocument(pageCount))
      expect(result.pageCount).toBe(pageCount)
      expect(result.pages.map((page) => page.number)).toEqual(
        Array.from({ length: pageCount }, (_value, index) => index + 1),
      )
      expect(result.contentHtml.match(/class="page-break"/g)).toHaveLength(
        pageCount - 1,
      )
      expect(new Set(result.pages.map((page) => page.source)).size).toBe(
        pageCount,
      )
    },
  )

  it('拒绝空文稿、二进制内容、不完整/重复/错序结构', () => {
    const cases: Array<[string, string]> = [
      ['  \n', 'EMPTY_DOCUMENT'],
      ['abc\u0000def', 'BINARY_DOCUMENT'],
      ['# 封面\n\n## 只有标题', 'INCOMPLETE_STRUCTURE'],
      [
        '# 封面\n\n## 主\n\n## 副\n\n# 封面\n\n# 正文',
        'AMBIGUOUS_STRUCTURE',
      ],
      [
        '前置文字\n\n# 封面\n\n## 主\n\n## 副\n\n# 正文',
        'INVALID_STRUCTURE_ORDER',
      ],
      ['# 正文\n\n文案\n\n# 封面\n\n## 主\n\n## 副', 'INVALID_STRUCTURE_ORDER'],
    ]

    for (const [source, code] of cases) {
      expect(() => analyzeImportDocument(source)).toThrowError(
        expect.objectContaining({ code }),
      )
    }
  })

  it('专用结构拒绝缺少封面主/副标题和空白页', () => {
    expect(() =>
      analyzeImportDocument('# 封面\n\n## 只有主标题\n\n# 正文'),
    ).toThrowError(expect.objectContaining({ code: 'MISSING_COVER_TEXT' }))
    expect(() =>
      analyzeImportDocument(
        '# 封面\n\n## 主\n\n## 副\n\n---\n\n---\n\n正文\n\n# 正文',
      ),
    ).toThrowError(expect.objectContaining({ code: 'EMPTY_PAGE' }))
  })

  it('非法分隔线决策在运行时仍会被拒绝', () => {
    const pending = analyzeImportDocument('一\n\n---\n\n二')
    expect(() =>
      applySeparatorDecision(pending, 'invalid' as never),
    ).toThrowError(
      expect.objectContaining({
        code: 'INVALID_SEPARATOR_DECISION',
      } satisfies Partial<ImportDocumentError>),
    )
  })
})
