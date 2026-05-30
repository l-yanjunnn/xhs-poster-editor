import { describe, it, expect } from 'vitest'
import { suggestFilename } from './exportPng'

describe('suggestFilename', () => {
  it('空 HTML 回退到今日日期 YYYY-MM-DD', () => {
    const name = suggestFilename('')
    expect(name).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('提取首个 H1 文本', () => {
    expect(suggestFilename('<h1>我的标题</h1><p>正文</p>')).toBe('我的标题')
  })

  it('多个 H1 时只取第一个', () => {
    expect(suggestFilename('<h1>第一</h1><h1>第二</h1>')).toBe('第一')
  })

  it('H1 内带嵌套标签时取拼接的 textContent', () => {
    expect(suggestFilename('<h1>前<strong>中</strong>后</h1>')).toBe('前中后')
  })

  it('过滤文件名非法字符 \\ / : * ? " < > |', () => {
    expect(suggestFilename('<h1>a/b\\c:d*e?f"g&lt;h&gt;i|j</h1>')).toBe(
      'abcdefghij',
    )
  })

  it('超长 H1 截断到 40 字符', () => {
    const longH1 = '一'.repeat(80)
    const name = suggestFilename(`<h1>${longH1}</h1>`)
    expect(name).toHaveLength(40)
  })

  it('trim H1 前后空白', () => {
    expect(suggestFilename('<h1>   带空白   </h1>')).toBe('带空白')
  })

  it('无 H1 时回退到日期', () => {
    const name = suggestFilename('<p>没有标题</p>')
    expect(name).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('H1 全是非法字符 → trim 后为空 → 回退日期', () => {
    const name = suggestFilename('<h1>///***</h1>')
    expect(name).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('H1 空标签也回退日期', () => {
    const name = suggestFilename('<h1></h1>')
    expect(name).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
