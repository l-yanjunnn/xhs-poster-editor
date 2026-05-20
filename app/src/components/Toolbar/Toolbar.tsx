import {
  H1_WIDTH_OPTIONS,
  LOGO_STRATEGY_OPTIONS,
  OVERLAY_OPTIONS,
  THEMES,
  type DensityLevel,
  type H1Width,
  type LogoStrategy,
  type OverlayKey,
  type ThemeKey,
} from '@/lib/themes'
import { DENSITY_OPTIONS } from '@/lib/density'
import { FONT_SIZE_OPTIONS } from '@/lib/fontSize'
import { BODY_FONTS, DISPLAY_FONTS, groupFonts } from '@/lib/fontPresets'

interface Props {
  theme: ThemeKey
  fontDisplay: string
  fontBody: string
  fontSize: number
  density: DensityLevel
  h1Width: H1Width
  overlay: OverlayKey
  logoStrategy: LogoStrategy
  onTheme: (v: ThemeKey) => void
  onFontDisplay: (v: string) => void
  onFontBody: (v: string) => void
  onFontSize: (v: number) => void
  onDensity: (v: DensityLevel) => void
  onH1Width: (v: H1Width) => void
  onOverlay: (v: OverlayKey) => void
  onLogoStrategy: (v: LogoStrategy) => void
}

// 顶部全局工具栏。Step 2 先用原生 <select> 把功能跑通，Step 后再升级到 shadcn Select。
export function Toolbar(p: Props) {
  return (
    <div className="flex flex-shrink-0 flex-wrap items-center gap-3 border-b border-neutral-800 bg-neutral-900 px-5 py-3 text-neutral-200">
      <Group label="主题">
        <Select value={p.theme} onChange={(v) => p.onTheme(v as ThemeKey)}>
          {(Object.keys(THEMES) as ThemeKey[]).map((k) => (
            <option key={k} value={k}>
              {THEMES[k].name}
            </option>
          ))}
        </Select>
      </Group>

      <Group label="叠色">
        <Select
          value={p.overlay}
          onChange={(v) => p.onOverlay(v as OverlayKey)}
        >
          {OVERLAY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Group>

      <Group label="大标题">
        <Select value={p.fontDisplay} onChange={p.onFontDisplay}>
          {groupFonts(DISPLAY_FONTS).map((g) => (
            <optgroup key={g.group} label={g.group}>
              {g.items.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                  {f.crossPlatform ? ' ✓' : ' ✗'}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </Group>

      <Group label="正文">
        <Select value={p.fontBody} onChange={p.onFontBody}>
          {groupFonts(BODY_FONTS).map((g) => (
            <optgroup key={g.group} label={g.group}>
              {g.items.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                  {f.crossPlatform ? ' ✓' : ' ✗'}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </Group>

      <Group label="Logo 策略">
        <Select
          value={p.logoStrategy}
          onChange={(v) => p.onLogoStrategy(v as LogoStrategy)}
        >
          {LOGO_STRATEGY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Group>

      <Group label="H1 宽度">
        <Select
          value={p.h1Width}
          onChange={(v) => p.onH1Width(v as H1Width)}
        >
          {H1_WIDTH_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Group>

      <Group label="字号">
        <Select
          value={String(p.fontSize)}
          onChange={(v) => p.onFontSize(parseInt(v, 10))}
        >
          {FONT_SIZE_OPTIONS.map((o) => (
            <option key={o.value} value={String(o.value)}>
              {o.label}
            </option>
          ))}
        </Select>
      </Group>

      <Group label="间距">
        <Select
          value={p.density}
          onChange={(v) => p.onDensity(v as DensityLevel)}
        >
          {DENSITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Group>
    </div>
  )
}

function Group({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2 border-r border-neutral-700 pr-3 last:border-r-0">
      <span className="text-xs text-neutral-400">{label}</span>
      {children}
    </div>
  )
}

function Select({
  value,
  onChange,
  children,
}: {
  value: string
  onChange: (v: string) => void
  children: React.ReactNode
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="cursor-pointer rounded border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-[13px] hover:bg-neutral-700"
    >
      {children}
    </select>
  )
}
