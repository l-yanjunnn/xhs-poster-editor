import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const canvasCss = readFileSync('src/styles/canvas.css', 'utf8')

interface StyleRuleLike {
  selectorText: string
  declarations: string
}

function normalizeSelector(selector: string): string {
  return selector.replace(/\s+/g, ' ').trim()
}

const normalizedCss = canvasCss
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\s+/g, ' ')
const rules: StyleRuleLike[] = Array.from(
  normalizedCss.matchAll(/([^{}]+)\{([^{}]*)\}/g),
  (match) => ({
    selectorText: normalizeSelector(match[1]),
    declarations: match[2],
  }),
)

function findRule(selector: string): StyleRuleLike {
  const rule = rules.find(
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
    expect(property(cover, '--page-padding-top')).toBe('340px')
    expect(property(cover, '--page-padding-bottom')).toBe('620px')
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
    expect(property(innerPageTag, 'top')).toBe('112px')
    expect(property(innerPageTag, 'right')).toBe('96px')
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
      'translateY(var(--optical-list-marker-shift-y, 0))',
    )
  })
})
