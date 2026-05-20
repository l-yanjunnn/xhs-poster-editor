// 字号联动：以正文 40px 为基准，其他字号按比例缩放
export const FS_RATIOS: Record<string, number> = {
  '--fs-h1': 90 / 40,
  '--fs-h2': 56 / 40,
  '--fs-h3': 44 / 40,
  '--fs-body': 1,
  '--fs-quote': 1,
  '--fs-code': 34 / 40,
}

export const FONT_SIZE_OPTIONS: { value: number; label: string }[] = [
  { value: 32, label: '小 32px' },
  { value: 36, label: '较小 36px' },
  { value: 40, label: '标准 40px (约22字/行)' },
  { value: 44, label: '较大 44px' },
  { value: 48, label: '大 48px' },
]

// 把正文 px 应用到一组 CSS 变量上。返回 { 变量名: '40px' } 形式，便于在 React 里用 style 注入。
export function computeFontSizeVars(bodyPx: number): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, ratio] of Object.entries(FS_RATIOS)) {
    out[k] = `${Math.round(bodyPx * ratio)}px`
  }
  return out
}
