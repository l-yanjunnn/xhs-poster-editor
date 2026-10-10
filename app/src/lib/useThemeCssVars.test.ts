import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { SYSTEM_FONT_STACK } from './fontPresets'
import { useThemeCssVars, type ThemeCssVarsInput } from './useThemeCssVars'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function Variables({ value }: { value: ThemeCssVarsInput }) {
  useThemeCssVars(value)
  return null
}

describe('cover font CSS variables', () => {
  it('clears a cover override on legacy theme restoration without changing the inner H1 font', async () => {
    const previousStyle = document.documentElement.style.cssText
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const value: ThemeCssVarsInput = {
      fontH1: '"Noto Serif SC", serif', fontH2: 'serif', fontH3: 'sans-serif', fontBody: 'sans-serif',
      h1Bold: true, h2Bold: true, h3Bold: true, fontSize: 40,
      density: 'normal', h1Width: '66%', overlay: 'none',
      coverTitleColor: '#1A1A1A', coverSubtitleColor: '#1A1A1A',
    }
    try {
      await act(async () => root.render(createElement(Variables, {
        value: { ...value, coverTitleFontFamily: SYSTEM_FONT_STACK },
      })))
      expect(document.documentElement.style.getPropertyValue('--font-cover-title')).toBe(SYSTEM_FONT_STACK)
      expect(document.documentElement.style.getPropertyValue('--font-h1')).toBe(value.fontH1)
      await act(async () => root.render(createElement(Variables, { value })))
      expect(document.documentElement.style.getPropertyValue('--font-cover-title')).toBe('')
      expect(document.documentElement.style.getPropertyValue('--font-h1')).toBe(value.fontH1)
    } finally {
      await act(async () => root.unmount())
      host.remove()
      document.documentElement.style.cssText = previousStyle
    }
  })
})
