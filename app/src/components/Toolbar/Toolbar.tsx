import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  BUILTIN_THEMES,
  H1_WIDTH_OPTIONS,
  LOGO_STRATEGY_OPTIONS,
  OVERLAY_OPTIONS,
  type DensityLevel,
  type H1Width,
  type LogoStrategy,
  type OverlayKey,
  type Theme,
} from '@/lib/themes'
import { DENSITY_OPTIONS } from '@/lib/density'
import { FONT_SIZE_OPTIONS } from '@/lib/fontSize'
import {
  BODY_FONTS,
  DISPLAY_FONTS,
  groupFonts,
  type FontOption,
} from '@/lib/fontPresets'

interface Props {
  currentThemeId: string | null
  userThemes: Theme[]
  onTheme: (themeId: string) => void

  fontH1: string
  fontH2: string
  fontH3: string
  fontBody: string
  fontSize: number
  density: DensityLevel
  h1Width: H1Width
  overlay: OverlayKey
  logoStrategy: LogoStrategy
  userFontFamilies: string[]
  onFontH1: (v: string) => void
  onFontH2: (v: string) => void
  onFontH3: (v: string) => void
  onFontBody: (v: string) => void
  onFontSize: (v: number) => void
  onDensity: (v: DensityLevel) => void
  onH1Width: (v: H1Width) => void
  onOverlay: (v: OverlayKey) => void
  onLogoStrategy: (v: LogoStrategy) => void
  onOpenAssetLibrary: () => void
  onOpenFontLibrary: () => void
  onOpenThemeLibrary: () => void
  onExport: () => void
}

// 顶部全局工具栏。Select 用 Radix（shadcn）替代原生 select，规避 macOS Chrome
// 原生 select popup 字号过大、无法 CSS 控制的问题
export function Toolbar(p: Props) {
  return (
    <div className="flex flex-shrink-0 flex-wrap items-center gap-3 border-b border-neutral-800 bg-neutral-900 px-5 py-3 text-neutral-200">
      <Group label="主题">
        <Select
          value={p.currentThemeId ?? '__custom__'}
          onValueChange={(v) => {
            if (v !== '__custom__') p.onTheme(v)
          }}
        >
          <SelectTrigger className="min-w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {p.currentThemeId === null && (
              <SelectItem value="__custom__" disabled>
                （自定义）
              </SelectItem>
            )}
            <SelectGroup>
              <SelectLabel>内置</SelectLabel>
              {BUILTIN_THEMES.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectGroup>
            {p.userThemes.length > 0 && (
              <SelectGroup>
                <SelectLabel>我的</SelectLabel>
                {p.userThemes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
          </SelectContent>
        </Select>
      </Group>

      <Group label="叠色">
        <SimpleSelect
          value={p.overlay}
          onValueChange={(v) => p.onOverlay(v as OverlayKey)}
          options={OVERLAY_OPTIONS}
        />
      </Group>

      <Group label="H1">
        <FontSelect
          value={p.fontH1}
          onValueChange={p.onFontH1}
          fonts={DISPLAY_FONTS}
          userFontFamilies={p.userFontFamilies}
        />
        <IconButton onClick={p.onOpenFontLibrary} title="管理字体" />
      </Group>

      <Group label="H2">
        <FontSelect
          value={p.fontH2}
          onValueChange={p.onFontH2}
          fonts={DISPLAY_FONTS}
          userFontFamilies={p.userFontFamilies}
        />
        <IconButton onClick={p.onOpenFontLibrary} title="管理字体" />
      </Group>

      <Group label="H3">
        <FontSelect
          value={p.fontH3}
          onValueChange={p.onFontH3}
          fonts={DISPLAY_FONTS}
          userFontFamilies={p.userFontFamilies}
        />
        <IconButton onClick={p.onOpenFontLibrary} title="管理字体" />
      </Group>

      <Group label="正文">
        <FontSelect
          value={p.fontBody}
          onValueChange={p.onFontBody}
          fonts={BODY_FONTS}
          userFontFamilies={p.userFontFamilies}
        />
        <IconButton onClick={p.onOpenFontLibrary} title="管理字体" />
      </Group>

      <Group label="Logo 策略">
        <SimpleSelect
          value={p.logoStrategy}
          onValueChange={(v) => p.onLogoStrategy(v as LogoStrategy)}
          options={LOGO_STRATEGY_OPTIONS}
        />
      </Group>

      <Group label="H1 宽度">
        <SimpleSelect
          value={p.h1Width}
          onValueChange={(v) => p.onH1Width(v as H1Width)}
          options={H1_WIDTH_OPTIONS}
        />
      </Group>

      <Group label="字号">
        <SimpleSelect
          value={String(p.fontSize)}
          onValueChange={(v) => p.onFontSize(parseInt(v, 10))}
          options={FONT_SIZE_OPTIONS.map((o) => ({
            value: String(o.value),
            label: o.label,
          }))}
        />
      </Group>

      <Group label="间距">
        <SimpleSelect
          value={p.density}
          onValueChange={(v) => p.onDensity(v as DensityLevel)}
          options={DENSITY_OPTIONS}
        />
      </Group>

      <div className="ml-auto flex gap-2">
        <button
          onClick={p.onOpenThemeLibrary}
          className="cursor-pointer rounded border border-blue-700 bg-blue-900/40 px-3 py-1.5 text-[13px] text-blue-200 hover:bg-blue-800/50"
        >
          主题
        </button>
        <button
          onClick={p.onOpenAssetLibrary}
          className="cursor-pointer rounded border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-[13px] text-neutral-200 hover:bg-neutral-700"
        >
          素材库
        </button>
        <button
          onClick={p.onExport}
          className="cursor-pointer rounded border border-emerald-700 bg-emerald-900/40 px-3 py-1.5 text-[13px] text-emerald-200 hover:bg-emerald-800/50"
        >
          导出 PNG
        </button>
      </div>
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

function IconButton({
  onClick,
  title,
}: {
  onClick: () => void
  title: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className="cursor-pointer rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-[13px] text-neutral-300 hover:bg-neutral-700"
    >
      ⚙
    </button>
  )
}

// 平铺单组 options 的小封装
function SimpleSelect({
  value,
  onValueChange,
  options,
}: {
  value: string
  onValueChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="min-w-[120px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

// 字体下拉：内置分组（按 group）+ 用户上传字体
function FontSelect({
  value,
  onValueChange,
  fonts,
  userFontFamilies,
}: {
  value: string
  onValueChange: (v: string) => void
  fonts: FontOption[]
  userFontFamilies: string[]
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="min-w-[140px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {groupFonts(fonts).map((g) => (
          <SelectGroup key={g.group}>
            <SelectLabel>{g.group}</SelectLabel>
            {g.items.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
                {f.crossPlatform ? ' ✓' : ' ✗'}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
        {userFontFamilies.length > 0 && (
          <SelectGroup>
            <SelectLabel>我的字体</SelectLabel>
            {userFontFamilies.map((fam) => (
              <SelectItem key={fam} value={`"${fam}", sans-serif`}>
                {fam}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  )
}
