import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const canvasCss = readFileSync('src/styles/canvas.css', 'utf8')
const editorCss = readFileSync('src/styles/editor.css', 'utf8')

interface StyleRuleLike {
  selectorText: string
  declarations: string
}

function normalizeSelector(selector: string): string {
  return selector.replace(/\s+/g, ' ').trim()
}

function parseStyleRules(css: string): StyleRuleLike[] {
  const normalizedCss = css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
  return Array.from(
    normalizedCss.matchAll(/([^{}]+)\{([^{}]*)\}/g),
    (match) => ({
      selectorText: normalizeSelector(match[1]),
      declarations: match[2],
    }),
  )
}

const rules = parseStyleRules(canvasCss)
const editorRules = parseStyleRules(editorCss)

function findRule(
  selector: string,
  sourceRules: StyleRuleLike[] = rules,
): StyleRuleLike {
  const rule = sourceRules.find(
    (candidate) => normalizeSelector(candidate.selectorText) === selector,
  )
  if (!rule) throw new Error(`缺少画布规则：${selector}`)
  return rule
}

function property(rule: StyleRuleLike, name: string): string {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = rule.declarations.match(
    new RegExp(`(?:^|;)\\s*${escapedName}\\s*:\\s*([^;]+)`),
  )
  if (!match) throw new Error(`${rule.selectorText} 缺少 ${name}`)
  return match[1].trim()
}

describe('theme-public-exam-landscape canvas CSS', () => {
  it('定义内页和封面各自的安全区与颜色 token', () => {
    const inner = findRule('.theme-public-exam-landscape')
    expect(property(inner, '--page-padding-x')).toBe('96px')
    expect(property(inner, '--page-padding-top')).toBe('180px')
    expect(property(inner, '--page-padding-bottom')).toBe('300px')
    expect(property(inner, '--c-text-primary')).toBe('#2D292B')
    expect(property(inner, '--c-accent')).toBe('#8A4B7C')
    expect(property(inner, '--c-overlay-opacity')).toBe('0')

    const cover = findRule(
      '.theme-public-exam-landscape.page--first',
    )
    expect(property(cover, '--page-padding-x')).toBe('120px')
    expect(property(cover, '--page-padding-top')).toBe('300px')
    expect(property(cover, '--page-padding-bottom')).toBe('300px')
  })

  it('保留五条简洁参考线，中线更淡且使用虚线', () => {
    const center = findRule('.layout-guide--center')
    expect(property(center, 'width')).toBe('0')
    expect(property(center, 'border-left')).toBe(
      '2px dashed rgba(37, 99, 235, 0.24)',
    )
    expect(property(center, 'background')).toBe('transparent')
  })

  it('所有主题的封面可编辑色只命中首个 H1 和紧邻段落', () => {
    const titleSelector = '.page--first .content > h1:first-of-type'
    const subtitleSelector = `${titleSelector} + p`
    expect(property(findRule(titleSelector), 'color')).toBe(
      'var(--c-cover-title, var(--c-text-primary))',
    )
    expect(property(findRule(subtitleSelector), 'color')).toBe(
      'var(--c-cover-subtitle, var(--c-text-secondary))',
    )

    const coverColorSelectors = rules
      .filter((rule) => rule.declarations.includes('--c-cover-'))
      .map((rule) => normalizeSelector(rule.selectorText))
    expect(coverColorSelectors).toEqual([titleSelector, subtitleSelector])

    const publicExamTitle = findRule(
      '.theme-public-exam-landscape.page--first .content > h1:first-of-type',
    )
    const publicExamSubtitle = findRule(
      '.theme-public-exam-landscape.page--first .content > h1:first-of-type + p',
    )
    expect(publicExamTitle.declarations).not.toMatch(/(?:^|;)\s*color\s*:/)
    expect(publicExamSubtitle.declarations).not.toMatch(/(?:^|;)\s*color\s*:/)
  })

  it('用语义 page--first 控制页码，并强制隐藏 Logo 与遮罩', () => {
    expect(
      property(
        findRule('.theme-public-exam-landscape.page--first .page-tag'),
        'display',
      ),
    ).toBe('none')

    const innerPageTag = findRule(
      '.theme-public-exam-landscape:not(.page--first) .page-tag',
    )
    // v1.7.3：用户目检两版 demo 后定稿为下方居中（原 v1.5.0 为
    // 顶线下方右侧 top:112/right:96）。
    expect(property(innerPageTag, 'top')).toBe('auto')
    expect(property(innerPageTag, 'bottom')).toBe('96px')
    expect(property(innerPageTag, 'right')).toBe('auto')
    expect(property(innerPageTag, 'left')).toBe('50%')
    expect(property(innerPageTag, 'transform')).toBe('translateX(-50%)')
    expect(
      property(findRule('.theme-public-exam-landscape .logo'), 'display'),
    ).toBe('none')
    expect(
      property(findRule('.theme-public-exam-landscape .overlay'), 'opacity'),
    ).toBe('0')
    expect(
      rules
        .filter((rule) => rule.selectorText.includes('theme-public-exam'))
        .every((rule) => !rule.selectorText.includes(':nth-')),
    ).toBe(true)
  })
})

describe('字体光学对齐 CSS 契约', () => {
  it('H2 竖线用运行时字形中线/高度，并保留无 JS 回退', () => {
    const bar = findRule('.content h2::before')
    expect(property(bar, 'top')).toBe('var(--h2-optical-center-y, 50%)')
    expect(property(bar, 'bottom')).toBe('auto')
    expect(property(bar, 'height')).toBe(
      'var(--h2-optical-bar-height, 92%)',
    )
    expect(property(bar, 'transform')).toBe('translateY(-50%)')
  })

  it('只在 marker 已装饰时关闭原生序号，且列宽/垂直位移都走度量变量', () => {
    const list = findRule(
      '.content ol[data-optical-list-marker-columns]',
    )
    expect(property(list, 'list-style')).toBe('none')
    expect(property(list, 'padding-left')).toContain(
      'var(--optical-list-marker-column-width, 2ch)',
    )

    const marker = findRule(
      '.content ol[data-optical-list-marker-columns] > li > .optical-list-marker',
    )
    expect(property(marker, 'position')).toBe('absolute')
    expect(property(marker, 'top')).toBe('0')
    expect(property(marker, 'right')).toBe('calc(100% + 8px)')
    expect(property(marker, 'font')).toBe('inherit')
    expect(property(marker, 'width')).toBe(
      'var(--optical-list-marker-column-width, 2ch)',
    )
    expect(property(marker, 'transform')).toBe(
      'translateY( calc( var(--optical-list-marker-shift-y, 0px) + var(--optical-list-marker-export-shift-y, 0px) ) )',
    )
  })
})

describe('中文正文两端对齐契约', () => {
  it('只对段落、引用和列表项两端对齐，末行仍靠左', () => {
    const body = findRule(
      '.content > :where(p, blockquote), .content > :where(ul, ol) li',
    )
    expect(property(body, 'text-align')).toBe('justify')
    expect(property(body, 'text-align-last')).toBe('left')
    expect(property(body, 'text-justify')).toBe('inter-character')
    expect(property(body, 'line-break')).toBe('strict')
    expect(property(body, 'word-break')).toBe('normal')

    const headings = findRule('.content :where(h1, h2, h3)')
    expect(property(headings, 'text-align')).toBe('start')
    expect(property(headings, 'text-align-last')).toBe('auto')

    const coverSubtitle = findRule(
      '.page--first .content > h1:first-of-type + p',
    )
    expect(property(coverSubtitle, 'text-align')).toBe('start')
    expect(property(coverSubtitle, 'text-align-last')).toBe('auto')

    const editorCoverSubtitle = findRule(
      '.tiptap-editor .ProseMirror > h1:first-of-type + p',
      editorRules,
    )
    expect(property(editorCoverSubtitle, 'text-align')).toBe('start')
    expect(property(editorCoverSubtitle, 'text-align-last')).toBe('auto')
  })

  it('编辑区只为显式续段分页前的根级正文铺满末行', () => {
    const continuation = findRule(
      '.tiptap-editor .ProseMirror > p:has(+ hr.page-break[data-page-break-continuation="true"])',
      editorRules,
    )
    const coverSubtitleContinuation = findRule(
      '.tiptap-editor .ProseMirror > h1:first-of-type + p:has(+ hr.page-break[data-page-break-continuation="true"])',
      editorRules,
    )

    expect(property(continuation, 'text-align-last')).toBe('justify')
    expect(property(coverSubtitleContinuation, 'text-align-last')).toBe('auto')
    expect(continuation.selectorText).not.toContain('blockquote')
    expect(continuation.selectorText).not.toContain('li')
  })
})

describe('封面槽位 CSS 契约', () => {
  it('A · 上不改 .content 的默认文档流', () => {
    expect(() =>
      findRule('.page--first[data-cover-layout="stack-left"] .content'),
    ).toThrow('缺少画布规则')
    expect(() =>
      findRule('.page--first[data-cover-vertical="top"] .content'),
    ).toThrow('缺少画布规则')
  })

  it('中/下只在封面页用 flex 推叠，不碰内页', () => {
    const middle = findRule(
      '.page--first[data-cover-vertical="middle"] .content',
    )
    expect(property(middle, 'justify-content')).toBe('center')
    expect(
      property(
        findRule('.page--first[data-cover-vertical="bottom"] .content'),
        'justify-content',
      ),
    ).toBe('flex-end')
    expect(
      rules.some((rule) =>
        rule.selectorText.includes('[data-cover-') &&
        !rule.selectorText.includes('.page--first'),
      ),
    ).toBe(false)
  })

  it('居中海报把主副标题居中，并用真实伪元素画分隔条', () => {
    const title = findRule(
      '.page--first[data-cover-layout="poster-center"] .content > h1:first-of-type',
    )
    const subtitle = findRule(
      '.page--first[data-cover-layout="poster-center"] .content > h1:first-of-type + p',
    )
    const rule = findRule(
      '.page--first[data-cover-layout="poster-center"] .content > h1:first-of-type::after',
    )
    expect(property(title, 'text-align')).toBe('center')
    expect(property(title, 'text-align-last')).toBe('center')
    expect(property(title, '--dtl-text-align')).toBe('center')
    expect(property(title, 'width')).toBe('100%')
    expect(property(subtitle, 'text-align')).toBe('center')
    expect(property(subtitle, '--dtl-text-align')).toBe('center')
    expect(property(rule, 'content')).toBe('""')
    expect(property(rule, 'display')).toBe('block')
    // 物化后块内流式高度为零，in-flow 伪元素会被压进标题字形底下
    expect(property(rule, 'position')).toBe('absolute')
    expect(() =>
      findRule(
        '.page--first[data-cover-layout="poster-center"] .content',
      ),
    ).toThrow('缺少画布规则')
  })

  it('槽位覆盖规则必须排在公考主题副标题规则之后（特异性打平靠顺序胜出）', () => {
    const themeIndex = rules.findIndex((rule) =>
      rule.selectorText.includes(
        '.theme-public-exam-landscape.page--first',
      ) && rule.selectorText.includes('+ p'),
    )
    const slotIndex = rules.findIndex((rule) =>
      rule.selectorText.includes('[data-cover-layout="poster-center"]'),
    )
    expect(themeIndex).toBeGreaterThanOrEqual(0)
    expect(slotIndex).toBeGreaterThan(themeIndex)
  })

  it('小字在上只改呈现顺序，不交换文档节点', () => {
    const kicker = findRule(
      '.page--first[data-cover-layout="kicker-above"] .content > h1:first-of-type + p',
    )
    expect(property(kicker, 'order')).toBe('-1')
    // 眉题竖条画在盒外侧（margin-left 让位），不参与求解器行宽
    expect(property(kicker, 'margin-left')).toBe('20px')
    const bar = findRule(
      '.page--first[data-cover-layout="kicker-above"] .content > h1:first-of-type + p::before',
    )
    expect(property(bar, 'content')).toBe('""')
    expect(property(bar, 'position')).toBe('absolute')
    expect(property(bar, 'left')).toBe('-20px')
  })
})
