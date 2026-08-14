import { describe, expect, it } from 'vitest'
import {
  COVER_LAYOUT_EXAMPLES,
  COVER_LAYOUTS,
  COVER_VERTICALS,
  DEFAULT_COVER_LAYOUT,
  DEFAULT_COVER_VERTICAL,
  coverSlotDataset,
  isCoverLayout,
  isCoverVertical,
  matchCoverLayoutExample,
  normalizeCoverLayout,
  normalizeCoverVertical,
  replaceCoverLayoutExampleHtml,
  replaceDefaultTutorialCoverHtml,
} from './coverSlots'

describe('coverSlots', () => {
  it('accepts the three locked layout and vertical values', () => {
    expect(COVER_LAYOUTS).toEqual([
      'stack-left',
      'poster-center',
      'kicker-above',
    ])
    expect(COVER_VERTICALS).toEqual(['top', 'middle', 'bottom'])
    expect(isCoverLayout('poster-center')).toBe(true)
    expect(isCoverVertical('bottom')).toBe(true)
    expect(isCoverLayout('free-drag')).toBe(false)
    expect(isCoverVertical('y-420')).toBe(false)
  })

  it('defaults missing or unsafe values to stack-left + top', () => {
    expect(normalizeCoverLayout(undefined)).toBe(DEFAULT_COVER_LAYOUT)
    expect(normalizeCoverLayout('')).toBe('stack-left')
    expect(normalizeCoverLayout('absolute')).toBe('stack-left')
    expect(normalizeCoverVertical(null)).toBe(DEFAULT_COVER_VERTICAL)
    expect(normalizeCoverVertical(1)).toBe('top')
    expect(normalizeCoverLayout('kicker-above')).toBe('kicker-above')
    expect(normalizeCoverVertical('middle')).toBe('middle')
  })

  it('only stamps dataset attributes on the cover page', () => {
    expect(coverSlotDataset(false, 'poster-center', 'middle')).toEqual({})
    expect(coverSlotDataset(true, 'kicker-above', 'bottom')).toEqual({
      'data-cover-layout': 'kicker-above',
      'data-cover-vertical': 'bottom',
    })
  })

  it('swaps only the canned demo covers and leaves custom titles alone', () => {
    expect(
      matchCoverLayoutExample(
        COVER_LAYOUT_EXAMPLES['stack-left'].title,
        COVER_LAYOUT_EXAMPLES['stack-left'].subtitle,
      ),
    ).toBe('stack-left')

    const fromA = replaceCoverLayoutExampleHtml(
      `<h1>${COVER_LAYOUT_EXAMPLES['stack-left'].title}</h1><p>${COVER_LAYOUT_EXAMPLES['stack-left'].subtitle}</p><p>内页正文</p>`,
      'poster-center',
    )
    expect(fromA).toContain(COVER_LAYOUT_EXAMPLES['poster-center'].title)
    expect(fromA).toContain(COVER_LAYOUT_EXAMPLES['poster-center'].subtitle)
    expect(fromA).toContain('内页正文')

    expect(
      replaceCoverLayoutExampleHtml(
        '<h1>我自己的标题</h1><p>我自己的副标题</p>',
        'kicker-above',
      ),
    ).toBeNull()
  })

  it('replaces the untouched tutorial cover page when switching to the exam theme', () => {
    const tutorial =
      '<h1>教程标题</h1><p>教程副标题</p><hr class="divider"><blockquote>教程引用</blockquote>' +
      '<hr class="page-break"><h2>第二页</h2>'
    const swapped = replaceDefaultTutorialCoverHtml(tutorial, tutorial)
    expect(swapped).not.toBeNull()
    expect(swapped).toContain(COVER_LAYOUT_EXAMPLES['stack-left'].title)
    expect(swapped).toContain(COVER_LAYOUT_EXAMPLES['stack-left'].subtitle)
    // 整页替换：教程首页的分隔线/引用块移除，第 2 页保留
    expect(swapped).not.toContain('教程引用')
    expect(swapped).toContain('page-break')
    expect(swapped).toContain('第二页')

    // 编辑器序列化的空白/结构差异不阻断匹配（忽略空白比文字）
    const reserialized =
      '<h1>教程标题</h1>\n<p>教程 副标题</p>\n<hr class="divider">\n' +
      '<blockquote><p>教程引用</p></blockquote>\n<hr class="page-break"><h2>第二页</h2>'
    expect(replaceDefaultTutorialCoverHtml(reserialized, tutorial)).not.toBeNull()

    // 用户改过任何文字 → 一字不动
    const edited = tutorial.replace('教程标题', '我的标题')
    expect(replaceDefaultTutorialCoverHtml(edited, tutorial)).toBeNull()

    // 用户在首页加了自己的内容 → 不替换（防数据丢失）
    const appended = tutorial.replace(
      '<hr class="page-break">',
      '<p>用户自己补的段落</p><hr class="page-break">',
    )
    expect(replaceDefaultTutorialCoverHtml(appended, tutorial)).toBeNull()
  })
})
