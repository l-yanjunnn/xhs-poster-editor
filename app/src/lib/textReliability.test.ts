import { describe, expect, it } from 'vitest'
import {
  canKeepPhraseTogether,
  normalizeChineseBoldBoundaryWhitespaceHtml,
  normalizeChineseBoldBoundaryWhitespaceJson,
  NO_WRAP_PHRASE_MAX_LENGTH,
} from './textReliability'

describe('中文粗体边界空白清理', () => {
  it('删除中文与粗体边界的 ASCII 空格和换行', () => {
    const input = [
      '<p><strong>2025年10月</strong> 的一天，鲁师傅 ',
      '<strong>经营</strong> 了三家门店。</p>',
      '<p>工商局\n<strong>百日整治</strong>\n行动。</p>',
    ].join('')

    expect(normalizeChineseBoldBoundaryWhitespaceHtml(input)).toBe(
      '<p><strong>2025年10月</strong>的一天，鲁师傅<strong>经营</strong>了三家门店。</p>' +
        '<p>工商局<strong>百日整治</strong>行动。</p>',
    )
  })

  it('识别富文本粘贴常见的 inline font-weight', () => {
    const input =
      '<p>举行 <span style="font-weight: 700">百日整治</span> 行动。</p>'

    expect(normalizeChineseBoldBoundaryWhitespaceHtml(input)).toBe(
      '<p>举行<span style="font-weight: 700">百日整治</span>行动。</p>',
    )
  })

  it('清理中文日期/数量粗体边界的数字空格与 NBSP', () => {
    const input =
      '<p><strong>2026</strong> 年国考，全国约<strong>100</strong> 家企业，' +
      '<strong>100</strong>&nbsp;家门店。</p>'

    expect(normalizeChineseBoldBoundaryWhitespaceHtml(input)).toBe(
      '<p><strong>2026</strong>年国考，全国约<strong>100</strong>家企业，' +
        '<strong>100</strong>家门店。</p>',
    )
  })

  it('保留普通中文人工空格、英文空格和 URL', () => {
    const input =
      '<p>中文 留白；<strong>Hello</strong> world；访问 <strong>https://example.com/a b</strong> 查看。</p>'

    expect(normalizeChineseBoldBoundaryWhitespaceHtml(input)).toBe(input)
  })

  it('数字与英文之间的正常空格仍然保留', () => {
    const input =
      '<p><strong>Version 2</strong> release；容量 <strong>100</strong> GB。</p>'
    expect(normalizeChineseBoldBoundaryWhitespaceHtml(input)).toBe(input)
  })

  it('不改写 inline code 和 pre 中的原始空白', () => {
    const input =
      '<p>前文<strong>关键词</strong> <code>中文  代码</code> 后文</p>' +
      '<pre><code>中文   粗体\n  缩进</code></pre>'

    const output = normalizeChineseBoldBoundaryWhitespaceHtml(input)
    expect(output).toContain('<code>中文  代码</code>')
    expect(output).toContain('<pre><code>中文   粗体\n  缩进</code></pre>')
  })

  it('同样清理 setContent 使用的 Tiptap JSON，且不修改入参', () => {
    const input = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: '2026年', marks: [{ type: 'bold' }] },
            { type: 'text', text: ' \n国考申论' },
            { type: 'text', text: ' keeps English space' },
          ],
        },
      ],
    }

    const output = normalizeChineseBoldBoundaryWhitespaceJson(input)
    expect(output.content[0].content[1].text).toBe('国考申论')
    expect(output.content[0].content[2].text).toBe(' keeps English space')
    expect(input.content[0].content[1].text).toBe(' \n国考申论')
  })
})

describe('短语不拆行约束', () => {
  it('只允许单行短文本', () => {
    expect(canKeepPhraseTogether('百日整治')).toBe(true)
    expect(canKeepPhraseTogether('广合县市场监督管理局')).toBe(true)
    expect(canKeepPhraseTogether('')).toBe(false)
    expect(canKeepPhraseTogether('第一行\n第二行')).toBe(false)
  })

  it('超长内容不会获得 nowrap 资格', () => {
    const maxLength = '关键短语完整机构名称测试'
    const tooLong = `${maxLength}长`
    expect(Array.from(maxLength)).toHaveLength(NO_WRAP_PHRASE_MAX_LENGTH)
    expect(Array.from(tooLong)).toHaveLength(NO_WRAP_PHRASE_MAX_LENGTH + 1)
    expect(canKeepPhraseTogether(maxLength)).toBe(true)
    expect(canKeepPhraseTogether(tooLong)).toBe(false)

    const normalized = normalizeChineseBoldBoundaryWhitespaceHtml(
      `<p><strong>${tooLong}</strong>正文</p>`,
    )
    expect(normalized).not.toContain('data-no-wrap-phrase')
    expect(normalized).not.toContain('nowrap-phrase')
  })
})
