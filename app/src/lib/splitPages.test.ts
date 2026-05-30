import { describe, it, expect } from 'vitest'
import { splitIntoPages } from './splitPages'

describe('splitIntoPages', () => {
  it('空输入返回单页占位（让 Preview 不至于 0 个画布）', () => {
    expect(splitIntoPages('')).toEqual([''])
    expect(splitIntoPages('   ')).toEqual([''])
  })

  it('无 hr.page-break 时整段就是一页', () => {
    const html = '<h1>标题</h1><p>正文</p>'
    expect(splitIntoPages(html)).toEqual([html])
  })

  it('单个 hr.page-break 切成两页', () => {
    const html = '<h1>A</h1><hr class="page-break"><h1>B</h1>'
    expect(splitIntoPages(html)).toEqual(['<h1>A</h1>', '<h1>B</h1>'])
  })

  it('hr.divider 不当分页符（保留在页内）', () => {
    const html = '<h1>A</h1><hr class="divider"><p>B</p>'
    const pages = splitIntoPages(html)
    expect(pages).toHaveLength(1)
    expect(pages[0]).toContain('class="divider"')
  })

  it('连续 hr.page-break 之间产生空页（保留用户意图）', () => {
    const html =
      '<p>A</p><hr class="page-break"><hr class="page-break"><p>B</p>'
    expect(splitIntoPages(html)).toEqual(['<p>A</p>', '', '<p>B</p>'])
  })

  it('首/尾 hr.page-break 各多出一个空页', () => {
    const html = '<hr class="page-break"><p>A</p><hr class="page-break">'
    expect(splitIntoPages(html)).toEqual(['', '<p>A</p>', ''])
  })

  it('混合 page-break 和 divider：仅前者切页，divider 留在原页', () => {
    const html =
      '<p>A</p><hr class="divider"><p>B</p><hr class="page-break"><p>C</p>'
    const pages = splitIntoPages(html)
    expect(pages).toHaveLength(2)
    expect(pages[0]).toContain('class="divider"')
    expect(pages[1]).toBe('<p>C</p>')
  })
})
