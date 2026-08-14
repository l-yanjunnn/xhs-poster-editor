// 主题数据模型 + 内置主题 + 共享映射表
// 主题里只存 assetId（不存 blob URL），apply 时再 resolve，避免 session 间失效

import {
  DEFAULT_COVER_LAYOUT,
  DEFAULT_COVER_VERTICAL,
  normalizeCoverLayout,
  normalizeCoverVertical,
  type CoverLayout,
  type CoverVertical,
} from './coverSlots'
import { normalizeHexColor } from './hexColor'

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
export type ThemeKey =
  | ''
  | 'theme-minimal-white'
  | 'theme-dark-night'
  | 'theme-public-exam-landscape'

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
  bgAssetId: string // 默认/内页背景；builtin/user asset id；'' = 纯色背景
  coverBgAssetId: string // 首页 override；'' = 纯色背景
  logoAssetId: string
  coverTitleColor: string
  coverSubtitleColor: string
  coverLayout: CoverLayout
  coverVertical: CoverVertical

  // 正文（可选）— null = 仅样式；object = 含 Tiptap doc JSON
  contentJSON: object | null
}

// 字体 stack 必须与 fontPresets 选项 value 严格对齐，否则 select 找不到匹配会回退首项
const DISPLAY_SERIF = '"Noto Serif SC", "Source Han Serif SC", "Songti SC", serif'
const DISPLAY_SANS = '"Noto Sans SC", "Source Han Sans SC", "PingFang SC", sans-serif'

export interface CoverTextColors {
  title: string
  subtitle: string
}

const COVER_TEXT_COLOR_DEFAULTS: Record<ThemeKey, CoverTextColors> = {
  '': { title: '#1A1A1A', subtitle: '#1A1A1A' },
  'theme-minimal-white': { title: '#111111', subtitle: '#111111' },
  'theme-dark-night': { title: '#F0F0F0', subtitle: '#F0F0F0' },
  'theme-public-exam-landscape': {
    title: '#6D136C',
    subtitle: '#5A465F',
  },
}

export function getThemeCoverTextColors(themeClass: ThemeKey): CoverTextColors {
  return { ...COVER_TEXT_COLOR_DEFAULTS[themeClass] }
}

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
    coverBgAssetId: 'builtin-bg-xuan',
    logoAssetId: 'builtin-logo-cat',
    coverTitleColor: '#1A1A1A',
    coverSubtitleColor: '#1A1A1A',
    coverLayout: DEFAULT_COVER_LAYOUT,
    coverVertical: DEFAULT_COVER_VERTICAL,
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
    coverBgAssetId: '',
    logoAssetId: 'builtin-logo-cat',
    coverTitleColor: '#111111',
    coverSubtitleColor: '#111111',
    coverLayout: DEFAULT_COVER_LAYOUT,
    coverVertical: DEFAULT_COVER_VERTICAL,
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
    coverBgAssetId: '',
    logoAssetId: 'builtin-logo-cat',
    coverTitleColor: '#F0F0F0',
    coverSubtitleColor: '#F0F0F0',
    coverLayout: DEFAULT_COVER_LAYOUT,
    coverVertical: DEFAULT_COVER_VERTICAL,
    contentJSON: null,
  },
  {
    id: 'builtin-public-exam-landscape',
    name: '公考·山水卷',
    isBuiltin: true,
    createdAt: 0,
    themeClass: 'theme-public-exam-landscape',
    overlay: 'none',
    h1Width: '80%',
    fontH1: DISPLAY_SERIF,
    fontH2: DISPLAY_SERIF,
    fontH3: DISPLAY_SANS,
    fontBody: DISPLAY_SANS,
    h1Bold: true,
    h2Bold: true,
    h3Bold: true,
    fontSize: 40,
    density: 'normal',
    logoStrategy: 'none',
    bgAssetId: 'builtin-bg-public-exam-landscape-inner-v1',
    coverBgAssetId: 'builtin-bg-public-exam-landscape-cover-v1',
    logoAssetId: '',
    coverTitleColor: '#6D136C',
    coverSubtitleColor: '#5A465F',
    coverLayout: DEFAULT_COVER_LAYOUT,
    coverVertical: DEFAULT_COVER_VERTICAL,
    contentJSON: null,
  },
]

const VALID_THEME_CLASSES = new Set<ThemeKey>([
  '',
  'theme-minimal-white',
  'theme-dark-night',
  'theme-public-exam-landscape',
])
const VALID_OVERLAYS = new Set<OverlayKey>([
  'none',
  'light-30',
  'light-60',
  'dark-30',
  'dark-60',
  'dark-80',
])
const VALID_H1_WIDTHS = new Set<H1Width>(['50%', '66%', '80%', '100%'])
const VALID_DENSITIES = new Set<DensityLevel>([
  'compact',
  'normal',
  'relaxed',
  'loose',
])
const VALID_LOGO_STRATEGIES = new Set<LogoStrategy>([
  'every',
  'first',
  'first-last',
  'none',
])

/**
 * Upgrade a stored V1 theme into the complete runtime Theme shape.
 * Invalid V2 colors fall back to the theme's original visual color instead of
 * leaking arbitrary CSS into the preview.
 */
export function normalizeTheme(value: unknown): Theme | null {
  if (!value || typeof value !== 'object') return null

  const theme = value as Partial<Record<keyof Theme, unknown>>
  if (
    typeof theme.id !== 'string' ||
    typeof theme.name !== 'string' ||
    typeof theme.isBuiltin !== 'boolean' ||
    typeof theme.createdAt !== 'number' ||
    !Number.isFinite(theme.createdAt) ||
    typeof theme.themeClass !== 'string' ||
    !VALID_THEME_CLASSES.has(theme.themeClass as ThemeKey) ||
    typeof theme.overlay !== 'string' ||
    !VALID_OVERLAYS.has(theme.overlay as OverlayKey) ||
    typeof theme.h1Width !== 'string' ||
    !VALID_H1_WIDTHS.has(theme.h1Width as H1Width) ||
    typeof theme.fontH1 !== 'string' ||
    typeof theme.fontH2 !== 'string' ||
    typeof theme.fontH3 !== 'string' ||
    typeof theme.fontBody !== 'string' ||
    typeof theme.h1Bold !== 'boolean' ||
    typeof theme.h2Bold !== 'boolean' ||
    typeof theme.h3Bold !== 'boolean' ||
    typeof theme.fontSize !== 'number' ||
    !Number.isFinite(theme.fontSize) ||
    typeof theme.density !== 'string' ||
    !VALID_DENSITIES.has(theme.density as DensityLevel) ||
    typeof theme.logoStrategy !== 'string' ||
    !VALID_LOGO_STRATEGIES.has(theme.logoStrategy as LogoStrategy) ||
    typeof theme.bgAssetId !== 'string' ||
    typeof theme.logoAssetId !== 'string' ||
    (theme.contentJSON !== null && typeof theme.contentJSON !== 'object')
  ) {
    return null
  }

  const themeClass = theme.themeClass as ThemeKey
  const fallbackColors = COVER_TEXT_COLOR_DEFAULTS[themeClass]

  return {
    id: theme.id,
    name: theme.name,
    isBuiltin: theme.isBuiltin,
    createdAt: theme.createdAt,
    themeClass,
    overlay: theme.overlay as OverlayKey,
    h1Width: theme.h1Width as H1Width,
    fontH1: theme.fontH1,
    fontH2: theme.fontH2,
    fontH3: theme.fontH3,
    fontBody: theme.fontBody,
    h1Bold: theme.h1Bold,
    h2Bold: theme.h2Bold,
    h3Bold: theme.h3Bold,
    // documentStore 的 parseDocumentStyleV1 要求 12–120，越界即抛；
    // 主题层必须 clamp 到同一区间，否则坏主题应用后自动保存会永久失败。
    fontSize: Math.min(120, Math.max(12, theme.fontSize)),
    density: theme.density as DensityLevel,
    logoStrategy: theme.logoStrategy as LogoStrategy,
    bgAssetId: theme.bgAssetId,
    coverBgAssetId:
      typeof theme.coverBgAssetId === 'string'
        ? theme.coverBgAssetId
        : theme.bgAssetId,
    logoAssetId: theme.logoAssetId,
    coverTitleColor:
      normalizeHexColor(theme.coverTitleColor) ?? fallbackColors.title,
    coverSubtitleColor:
      normalizeHexColor(theme.coverSubtitleColor) ?? fallbackColors.subtitle,
    coverLayout: normalizeCoverLayout(theme.coverLayout),
    coverVertical: normalizeCoverVertical(theme.coverVertical),
    contentJSON: theme.contentJSON as object | null,
  }
}

// App 启动加载的默认主题
export const DEFAULT_THEME = BUILTIN_THEMES[0]

export const PUBLIC_EXAM_THEME = BUILTIN_THEMES.find(
  (theme) => theme.id === 'builtin-public-exam-landscape',
)!

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
