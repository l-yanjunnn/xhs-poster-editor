// 主题预设、叠色映射、字体下拉数据
// 从 editor.html 迁入，加上 TS 类型约束。

export type LogoStrategy = 'every' | 'first' | 'first-last' | 'none'
export type OverlayKey =
  | 'none'
  | 'light-30'
  | 'light-60'
  | 'dark-30'
  | 'dark-60'
  | 'dark-80'
export type DensityLevel = 'compact' | 'normal' | 'relaxed' | 'loose'
export type H1Width = '50%' | '66%' | '80%' | '100%'

export interface Theme {
  name: string
  bg: string // 素材 id，空 = 纯色背景
  logo: string
  logoStrategy: LogoStrategy
  overlay: OverlayKey
  h1Width: H1Width
  fontDisplay: string
  fontBody: string
  fontSize: number
  density: DensityLevel
}

export type ThemeKey = '' | 'theme-minimal-white' | 'theme-dark-night'

export const THEMES: Record<ThemeKey, Theme> = {
  '': {
    name: '宣纸（默认）',
    bg: 'builtin-bg-xuan',
    logo: 'builtin-logo-cat',
    logoStrategy: 'every',
    overlay: 'none',
    h1Width: '66%',
    fontDisplay: '"Noto Serif SC", "Source Han Serif SC", "Songti SC", serif',
    fontBody: '"PingFang SC", "Noto Sans SC", sans-serif',
    fontSize: 36,
    density: 'compact',
  },
  'theme-minimal-white': {
    name: '极简白',
    bg: '',
    logo: 'builtin-logo-cat',
    logoStrategy: 'every',
    overlay: 'none',
    h1Width: '66%',
    fontDisplay: '"Noto Sans SC", "Source Han Sans SC", "PingFang SC", sans-serif',
    fontBody: '"PingFang SC", "Noto Sans SC", sans-serif',
    fontSize: 40,
    density: 'normal',
  },
  'theme-dark-night': {
    name: '深夜黑',
    bg: '',
    logo: 'builtin-logo-cat',
    logoStrategy: 'every',
    overlay: 'dark-60',
    h1Width: '66%',
    fontDisplay: '"Noto Serif SC", "Source Han Serif SC", serif',
    fontBody: '"PingFang SC", "Noto Sans SC", sans-serif',
    fontSize: 40,
    density: 'normal',
  },
}

// 叠色：[color, opacity]
export const OVERLAY_MAP: Record<OverlayKey, [string, number]> = {
  none: ['transparent', 0],
  'light-30': ['#ffffff', 0.3],
  'light-60': ['#ffffff', 0.6],
  'dark-30': ['#000000', 0.3],
  'dark-60': ['#000000', 0.6],
  'dark-80': ['#000000', 0.8],
}

export const OVERLAY_OPTIONS: { value: OverlayKey; label: string }[] = [
  { value: 'none', label: '无' },
  { value: 'light-30', label: '浅膜 30%' },
  { value: 'light-60', label: '浅膜 60%' },
  { value: 'dark-30', label: '深膜 30%' },
  { value: 'dark-60', label: '深膜 60%' },
  { value: 'dark-80', label: '深膜 80%' },
]

export const LOGO_STRATEGY_OPTIONS: { value: LogoStrategy; label: string }[] = [
  { value: 'every', label: '每页都显示' },
  { value: 'first', label: '仅首页' },
  { value: 'first-last', label: '仅首尾页' },
  { value: 'none', label: '不显示' },
]

export const H1_WIDTH_OPTIONS: { value: H1Width; label: string }[] = [
  { value: '50%', label: '50%' },
  { value: '66%', label: '66% (默认)' },
  { value: '80%', label: '80%' },
  { value: '100%', label: '100% 全宽' },
]
