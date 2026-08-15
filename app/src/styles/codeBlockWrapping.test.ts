import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

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

function findRule(css: string, selector: string): StyleRuleLike {
  const rule = parseStyleRules(css).find(
    (candidate) => candidate.selectorText === selector,
  )
  if (!rule) throw new Error(`缺少样式规则：${selector}`)
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

describe('Code 块静态换行 CSS 契约', () => {
  const cases = [
    {
      file: 'src/styles/editor.css',
      selector: '.tiptap-editor pre',
    },
    {
      file: 'src/styles/canvas.css',
      selector: '.content pre',
    },
  ] as const

  it.each(cases)('$file 保留空白且必要时断开超长内容', ({ file, selector }) => {
    const rule = findRule(readFileSync(file, 'utf8'), selector)

    expect(property(rule, 'white-space')).toBe('pre-wrap')
    expect(property(rule, 'overflow-wrap')).toBe('anywhere')
    expect(property(rule, 'word-break')).toBe('normal')
    expect(property(rule, 'max-width')).toBe('100%')
  })
})
