import type { DensityLevel } from './themes'

// 间距密度：4 档预设。CSS 变量名沿用 editor.html 约定。
export const DENSITY_MAP: Record<DensityLevel, Record<string, string>> = {
  compact: {
    '--gap-paragraph': '20px',
    '--gap-h1-after': '40px',
    '--gap-h2-before': '48px',
    '--gap-h2-after': '18px',
    '--gap-h3-before': '30px',
    '--gap-h3-after': '12px',
    '--gap-block': '22px',
  },
  normal: {
    '--gap-paragraph': '32px',
    '--gap-h1-after': '64px',
    '--gap-h2-before': '72px',
    '--gap-h2-after': '28px',
    '--gap-h3-before': '48px',
    '--gap-h3-after': '20px',
    '--gap-block': '36px',
  },
  relaxed: {
    '--gap-paragraph': '44px',
    '--gap-h1-after': '88px',
    '--gap-h2-before': '100px',
    '--gap-h2-after': '40px',
    '--gap-h3-before': '64px',
    '--gap-h3-after': '28px',
    '--gap-block': '48px',
  },
  loose: {
    '--gap-paragraph': '60px',
    '--gap-h1-after': '120px',
    '--gap-h2-before': '140px',
    '--gap-h2-after': '56px',
    '--gap-h3-before': '88px',
    '--gap-h3-after': '40px',
    '--gap-block': '64px',
  },
}

export const DENSITY_OPTIONS: { value: DensityLevel; label: string }[] = [
  { value: 'compact', label: '紧凑' },
  { value: 'normal', label: '标准' },
  { value: 'relaxed', label: '宽松' },
  { value: 'loose', label: '超宽松' },
]
