import { useInsertionEffect } from 'react'

import { DENSITY_MAP } from './density'
import { computeFontSizeVars } from './fontSize'
import { OVERLAY_MAP, type DensityLevel, type OverlayKey } from './themes'

export interface ThemeCssVarsInput {
  fontH1: string
  fontH2: string
  fontH3: string
  fontBody: string
  h1Bold: boolean
  h2Bold: boolean
  h3Bold: boolean
  fontSize: number
  density: DensityLevel
  h1Width: string
  overlay: OverlayKey
  coverTitleColor: string
  coverSubtitleColor: string
}

/**
 * 把主题/排版 state 注入 :root 的 CSS 变量。预览与导出共用这一组变量
 * （导出 onclone 会拷贝 :root 的 inline CSS vars），不要在别处二次注入。
 *
 * （M7 拆分第二步：逻辑自 App.tsx 原样抽出，行为零变化。）
 */
export function useThemeCssVars(input: ThemeCssVarsInput): void {
  const {
    fontH1,
    fontH2,
    fontH3,
    fontBody,
    h1Bold,
    h2Bold,
    h3Bold,
    fontSize,
    density,
    h1Width,
    overlay,
    coverTitleColor,
    coverSubtitleColor,
  } = input

  useInsertionEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--font-h1', fontH1)
    root.style.setProperty('--font-h2', fontH2)
    root.style.setProperty('--font-h3', fontH3)
    root.style.setProperty('--font-body', fontBody)
    root.style.setProperty('--fw-h1', h1Bold ? '700' : '400')
    root.style.setProperty('--fw-h2', h2Bold ? '700' : '400')
    root.style.setProperty('--fw-h3', h3Bold ? '700' : '400')
    root.style.setProperty('--h1-max-width', h1Width)
    root.style.setProperty('--c-cover-title', coverTitleColor)
    root.style.setProperty('--c-cover-subtitle', coverSubtitleColor)

    for (const [k, v] of Object.entries(computeFontSizeVars(fontSize))) {
      root.style.setProperty(k, v)
    }
    for (const [k, v] of Object.entries(DENSITY_MAP[density])) {
      root.style.setProperty(k, v)
    }

    const [color, opacity] = OVERLAY_MAP[overlay]
    root.style.setProperty('--c-overlay-color', color)
    root.style.setProperty('--c-overlay-opacity', String(opacity))
  }, [
    fontH1,
    fontH2,
    fontH3,
    fontBody,
    h1Bold,
    h2Bold,
    h3Bold,
    fontSize,
    density,
    h1Width,
    overlay,
    coverTitleColor,
    coverSubtitleColor,
  ])
}
