import { Editor } from '@tiptap/react'
import { describe, expect, it } from 'vitest'
import { createEditorExtensions } from '@/components/Editor/editorExtensions'
import { createNoWrapH1Layout, resolveNoWrapH1Layout } from './noWrapH1Layout'
import { SYSTEM_FONT_STACK } from './fontPresets'

const input = {
  fontFamily: 'sans-serif', fontSizePx: 90, fontWeight: 700,
  h1Width: '66%', themeClass: '', coverLayout: 'stack-left' as const,
  innerVerticalDefault: 'middle' as const, logoLayoutReserved: true,
}

describe('H1 no-wrap role measurements', () => {
  it('uses the cover font only for the first top-level H1 and follows the global font when absent', () => {
    const editor = new Editor({ extensions: createEditorExtensions(), content:
      '<blockquote><h1>嵌套</h1></blockquote><h1>普通人<br>可以完整。</h1><h1>同页其他</h1><hr><h1>内页</h1>' })
    try {
      for (const coverTitleFontFamily of [SYSTEM_FONT_STACK, undefined, '  ']) {
        const layout = createNoWrapH1Layout({ ...input, fontFamily: 'serif', coverTitleFontFamily })
        const families: string[] = []
        editor.state.doc.descendants((node, position) => {
          if (node.type.name === 'heading') {
            families.push(resolveNoWrapH1Layout(editor.state.doc, position, layout).metrics.fontFamily)
          }
        })
        expect(families).toEqual(['serif', coverTitleFontFamily === SYSTEM_FONT_STACK ? SYSTEM_FONT_STACK : 'serif', 'serif', 'serif'])
      }
      expect(editor.getHTML()).toContain('普通人<br>可以完整。')
    } finally {
      editor.destroy()
    }
  })

  it('keeps explicit cover pixels equal across layouts and restores kicker multiplication only when following', () => {
    for (const coverLayout of ['stack-left', 'poster-center', 'kicker-above'] as const) {
      const layout = createNoWrapH1Layout({ ...input, coverLayout, coverTitleFontSize: 126 })
      expect(layout.coverTitle?.fontSizePx).toBe(126)
      expect(layout.innerPage?.fontSizePx).toBe(90)
      expect(layout.coverTitle?.maxWidthPx).toBeCloseTo(coverLayout === 'poster-center' ? 920 : 607.2)
      expect(layout.coverTitle?.letterSpacingPx).toBe(coverLayout === 'kicker-above' ? 1.26 : -0.5)
    }
    const following = createNoWrapH1Layout({ ...input, coverLayout: 'kicker-above' })
    expect(following.coverTitle?.fontSizePx).toBeCloseTo(104.4)
    expect(following.coverTitle?.letterSpacingPx).toBeCloseTo(1.044)
  })

  it('uses public-exam cover and inner paddings separately', () => {
    const layout = createNoWrapH1Layout({ ...input, themeClass: 'theme-public-exam-landscape', coverTitleFontSize: 144 })
    expect(layout.coverTitle?.maxWidthPx).toBeCloseTo(554.4)
    expect(layout.coverTitle?.letterSpacingPx).toBe(1.44)
    expect(layout.innerPage?.maxWidthPx).toBeCloseTo(586.08)
    expect(layout.innerPage?.letterSpacingPx).toBe(-0.5)
  })

  it('only assigns the first top-level cover H1 its special metrics', () => {
    const editor = new Editor({ extensions: createEditorExtensions(), content:
      '<blockquote><h1>嵌套</h1></blockquote><p>引言</p><h1>封面</h1><h1>其他</h1><hr><h1>内页</h1>' })
    const layout = createNoWrapH1Layout({ ...input, coverTitleFontSize: 144 })
    const results: Array<{ text: string; size: number; cover: boolean }> = []
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'heading') {
        const resolved = resolveNoWrapH1Layout(editor.state.doc, pos, layout)
        results.push({ text: node.textContent, size: resolved.metrics.fontSizePx, cover: resolved.isCoverTitle })
      }
    })
    expect(results).toEqual([
      { text: '嵌套', size: 90, cover: false },
      { text: '封面', size: 144, cover: true },
      { text: '其他', size: 90, cover: false },
      { text: '内页', size: 90, cover: false },
    ])
    editor.destroy()
  })

  it('respects page-level top/center and logo reservation overrides', () => {
    const editor = new Editor({ extensions: createEditorExtensions(), content:
      '<p>无封面标题</p><hr data-page-vertical="top"><h1>顶部</h1><h1>后续</h1><hr data-page-vertical="top" data-logo-layout-reserved="false"><h1>无占位</h1><hr data-page-vertical="middle"><h1>居中</h1>' })
    const layout = createNoWrapH1Layout({ ...input, h1Width: '100%', coverTitleFontSize: 144 })
    const widths: number[] = []
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'heading') {
        const resolved = resolveNoWrapH1Layout(editor.state.doc, pos, layout)
        widths.push(resolved.metrics.maxWidthPx)
        expect(resolved.isCoverTitle).toBe(false)
        expect(resolved.metrics.fontSizePx).toBe(90)
      }
    })
    expect(widths).toEqual([796, 920, 920, 920])
    editor.destroy()
  })
})
