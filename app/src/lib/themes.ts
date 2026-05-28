// 主题数据模型 + 内置主题 + 共享映射表
// 主题里只存 assetId（不存 blob URL），apply 时再 resolve，避免 session 间失效

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
// 决定 .page div 的色彩 CSS class
export type ThemeKey = '' | 'theme-minimal-white' | 'theme-dark-night'

// 用户可保存复用的完整样式快照
export interface Theme {
  id: string
  name: string
  isBuiltin: boolean
  createdAt: number

  // 样式
  themeClass: ThemeKey
  overlay: OverlayKey
  h1Width: H1Width
  fontH1: string
  fontH2: string
  fontH3: string
  fontBody: string
  // 标题加粗二态：true → 700，false → 400。后续要精细字重再升级成下拉
  h1Bold: boolean
  h2Bold: boolean
  h3Bold: boolean
  fontSize: number
  density: DensityLevel
  logoStrategy: LogoStrategy
  bgAssetId: string // builtin/user asset id；'' = 纯色背景
  logoAssetId: string

  // 正文（可选）— null = 仅样式；object = 含 Tiptap doc JSON
  contentJSON: object | null
}

// 字体 stack 必须与 fontPresets 选项 value 严格对齐，否则 select 找不到匹配会回退首项
const DISPLAY_SERIF = '"Noto Serif SC", "Source Han Serif SC", "Songti SC", serif'
const DISPLAY_SANS = '"Noto Sans SC", "Source Han Sans SC", "PingFang SC", sans-serif'

export const BUILTIN_THEMES: Theme[] = [
  {
    id: 'builtin-elegant',
    name: '雅致',
    isBuiltin: true,
    createdAt: 0,
    themeClass: '',
    overlay: 'none',
    h1Width: '66%',
    fontH1: DISPLAY_SERIF,
    fontH2: DISPLAY_SERIF,
    fontH3: DISPLAY_SANS,
    fontBody: DISPLAY_SANS,
    h1Bold: true,
    h2Bold: true,
    h3Bold: true,
    fontSize: 40,
    density: 'normal',
    logoStrategy: 'every',
    bgAssetId: 'builtin-bg-xuan',
    logoAssetId: 'builtin-logo-cat',
    contentJSON: null,
  },
  {
    id: 'builtin-minimal-white',
    name: '极简白',
    isBuiltin: true,
    createdAt: 0,
    themeClass: 'theme-minimal-white',
    overlay: 'none',
    h1Width: '66%',
    fontH1: DISPLAY_SANS,
    fontH2: DISPLAY_SANS,
    fontH3: DISPLAY_SANS,
    fontBody: DISPLAY_SANS,
    h1Bold: true,
    h2Bold: true,
    h3Bold: true,
    fontSize: 40,
    density: 'normal',
    logoStrategy: 'every',
    bgAssetId: '',
    logoAssetId: 'builtin-logo-cat',
    contentJSON: null,
  },
  {
    id: 'builtin-dark-night',
    name: '深夜黑',
    isBuiltin: true,
    createdAt: 0,
    themeClass: 'theme-dark-night',
    overlay: 'dark-60',
    h1Width: '66%',
    fontH1: DISPLAY_SERIF,
    fontH2: DISPLAY_SERIF,
    fontH3: DISPLAY_SANS,
    fontBody: DISPLAY_SANS,
    h1Bold: true,
    h2Bold: true,
    h3Bold: true,
    fontSize: 40,
    density: 'normal',
    logoStrategy: 'every',
    bgAssetId: '',
    logoAssetId: 'builtin-logo-cat',
    contentJSON: null,
  },
]

// App 启动加载的默认主题
export const DEFAULT_THEME = BUILTIN_THEMES[0]

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
