import { useId, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import {
  AlertTriangle,
  AlignCenter,
  AlignLeft,
  AlignRight,
  FileImage,
  FolderOpen,
  Highlighter,
  ImagePlus,
  Palette,
  RotateCcw,
  RefreshCw,
  Trash2,
  Type,
} from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type {
  ImageState,
  TextSelectionState,
} from '@/components/Editor/Editor'
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
import {
  formatImageWidth,
  imageWidthToNumber,
  type ImageAlign,
} from '@/lib/imageModel'
import { TEXT_HIGHLIGHT_COLOR } from '@/lib/textHighlight'

export interface RecentAction {
  id: string
  label: string
  time: number
}

export interface ResourceIssue {
  id: string
  label: string
  message: string
}

interface Props {
  imageState: ImageState
  textSelectionState: TextSelectionState
  recentActions: RecentAction[]
  resourceIssues: ResourceIssue[]
  resourceRetrying: boolean
  resourceLoading: boolean
  onRetryResources: () => void

  currentThemeId: string | null
  userThemes: Theme[]
  onTheme: (themeId: string) => void
  fontH1: string
  fontH2: string
  fontH3: string
  fontBody: string
  h1Bold: boolean
  h2Bold: boolean
  h3Bold: boolean
  fontSize: number
  density: DensityLevel
  h1Width: H1Width
  overlay: OverlayKey
  logoStrategy: LogoStrategy
  userFontFamilies: string[]
  onFontH1: (value: string) => void
  onFontH2: (value: string) => void
  onFontH3: (value: string) => void
  onFontBody: (value: string) => void
  onH1Bold: (value: boolean) => void
  onH2Bold: (value: boolean) => void
  onH3Bold: (value: boolean) => void
  onFontSize: (value: number) => void
  onDensity: (value: DensityLevel) => void
  onH1Width: (value: H1Width) => void
  onOverlay: (value: OverlayKey) => void
  onLogoStrategy: (value: LogoStrategy) => void
  onOpenAssetLibrary: () => void
  onOpenFontLibrary: () => void
  onOpenThemeLibrary: () => void

  onImageAlign: (align: ImageAlign) => void
  onImageWidth: (width: string | null) => void
  onReplaceImage: () => void
  onDeleteImage: () => void
  onHighlightOpacity: (opacity: number) => void
  onClearHighlight: () => void
}

export function ContextInspector(props: Props) {
  const context = props.imageState.active
    ? 'image'
    : props.textSelectionState.active
      ? 'text'
      : 'page'

  return (
    <aside className="context-inspector" aria-label="当前对象属性">
      <div className="inspector-context-label">
        <span>当前对象</span>
        <strong>
          {context === 'image' ? '图片' : context === 'text' ? '文字选区' : '页面与主题'}
        </strong>
      </div>

      {context === 'image' ? (
        <ImageInspector
          key={props.imageState.imageId}
          {...props}
        />
      ) : context === 'text' ? (
        <TextInspector {...props} />
      ) : (
        <PageInspector {...props} />
      )}

      {props.resourceIssues.length > 0 ? (
        <ResourceIssues
          issues={props.resourceIssues}
          retrying={props.resourceRetrying}
          onRetry={props.onRetryResources}
        />
      ) : null}

      {props.resourceLoading ? (
        <div className="resource-loading" role="status">
          <RefreshCw aria-hidden="true" className="is-spinning" />
          正在载入主题资源…
        </div>
      ) : null}

      <RecentActions actions={props.recentActions} />
    </aside>
  )
}

function ResourceIssues({
  issues,
  retrying,
  onRetry,
}: {
  issues: ResourceIssue[]
  retrying: boolean
  onRetry: () => void
}) {
  return (
    <section className="resource-issues" aria-labelledby="resource-issues-title">
      <div className="resource-issues-heading">
        <span aria-hidden="true"><AlertTriangle /></span>
        <div>
          <h2 id="resource-issues-title">部分资源未载入</h2>
          <p>其余内容仍可编辑，可在原位重试。</p>
        </div>
      </div>
      <ul>
        {issues.map((issue) => (
          <li key={issue.id}>
            <strong>{issue.label}</strong>
            <span>{issue.message}</span>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onRetry} disabled={retrying}>
        <RefreshCw aria-hidden="true" className={retrying ? 'is-spinning' : ''} />
        {retrying ? '正在重试…' : '重新载入资源'}
      </button>
    </section>
  )
}

function ImageInspector(props: Props) {
  const persistedWidth = imageWidthToNumber(props.imageState.width, 100)
  const [draftWidth, setDraftWidth] = useState<number | null>(null)
  const visibleWidth = draftWidth ?? persistedWidth
  const alignmentOptions = [
    ['left', '左对齐', <AlignLeft key="left" />],
    ['center', '居中', <AlignCenter key="center" />],
    ['right', '右对齐', <AlignRight key="right" />],
  ] as const

  function commitWidth() {
    if (draftWidth === null) return
    const next = formatImageWidth(draftWidth)
    setDraftWidth(null)
    if (next !== props.imageState.width) props.onImageWidth(next)
  }

  function handleAlignKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ) {
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % alignmentOptions.length
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex =
        (currentIndex - 1 + alignmentOptions.length) % alignmentOptions.length
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = alignmentOptions.length - 1
    }
    if (nextIndex === null) return

    event.preventDefault()
    const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
      '[role="radio"]',
    )
    buttons?.[nextIndex]?.focus()
    props.onImageAlign(alignmentOptions[nextIndex][0])
  }

  return (
    <InspectorCard
      title="图片"
      description="尺寸与对齐会写入草稿，导出时保持一致。"
      icon={<FileImage />}
    >
      <Field label="对齐方式">
        <div className="segmented-control" role="radiogroup" aria-label="图片对齐方式">
          {alignmentOptions.map(([value, label, icon], index) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={props.imageState.align === value}
              tabIndex={props.imageState.align === value ? 0 : -1}
              className={props.imageState.align === value ? 'is-active' : ''}
              onClick={() => props.onImageAlign(value)}
              onKeyDown={(event) => handleAlignKeyDown(event, index)}
            >
              {icon}
              <span>{label}</span>
            </button>
          ))}
        </div>
      </Field>

      <Field
        label="宽度"
        value={props.imageState.width ? `${Math.round(visibleWidth)}%` : '原大小'}
      >
        <input
          className="inspector-range"
          type="range"
          min="10"
          max="100"
          step="1"
          value={visibleWidth}
          aria-label="图片宽度百分比"
          onChange={(event) => setDraftWidth(Number(event.target.value))}
          onPointerUp={commitWidth}
          onKeyUp={commitWidth}
          onBlur={commitWidth}
        />
        <div className="width-presets" aria-label="常用宽度">
          {[33, 50, 66, 75, 100].map((value) => (
            <button
              type="button"
              key={value}
              className={Math.round(persistedWidth) === value ? 'is-active' : ''}
              onClick={() => props.onImageWidth(`${value}%`)}
            >
              {value}%
            </button>
          ))}
        </div>
      </Field>

      <div className="inspector-action-stack">
        <button type="button" onClick={props.onReplaceImage}>
          <ImagePlus aria-hidden="true" />
          替换图片
        </button>
        <button
          type="button"
          className="is-danger"
          onClick={props.onDeleteImage}
        >
          <Trash2 aria-hidden="true" />
          删除图片
        </button>
      </div>
    </InspectorCard>
  )
}

function TextInspector(props: Props) {
  const persistedOpacity = Math.round(props.textSelectionState.opacity * 100)
  const [draftOpacity, setDraftOpacity] = useState<number | null>(null)
  const visibleOpacity = draftOpacity ?? persistedOpacity

  function commitOpacity() {
    if (draftOpacity === null) return
    const nextOpacity = draftOpacity
    setDraftOpacity(null)
    if (
      !props.textSelectionState.highlighted ||
      nextOpacity !== persistedOpacity
    ) {
      props.onHighlightOpacity(nextOpacity / 100)
    }
  }

  return (
    <InspectorCard
      title="正文荧光笔"
      description="只作用于当前选中文字，不影响后续输入。"
      icon={<Highlighter />}
    >
      <div className="highlight-swatch-row">
        <span
          className="highlight-swatch"
          style={{ backgroundColor: TEXT_HIGHLIGHT_COLOR }}
          aria-hidden="true"
        />
        <div>
          <strong>固定基色</strong>
          <span>{TEXT_HIGHLIGHT_COLOR}</span>
        </div>
      </div>
      <Field label="透明度" value={`${visibleOpacity}%`}>
        <input
          className="inspector-range inspector-range--highlight"
          type="range"
          min="0"
          max="100"
          step="1"
          value={visibleOpacity}
          aria-label="荧光笔透明度"
          onChange={(event) => setDraftOpacity(Number(event.target.value))}
          onPointerUp={commitOpacity}
          onKeyUp={commitOpacity}
          onBlur={commitOpacity}
        />
      </Field>
      <button
        type="button"
        className="inspector-reset-action"
        onClick={
          props.textSelectionState.highlighted
            ? props.onClearHighlight
            : () => props.onHighlightOpacity(visibleOpacity / 100)
        }
        title={
          props.textSelectionState.highlighted
            ? '移除选区荧光笔'
            : `以 ${visibleOpacity}% 透明度应用到当前选区`
        }
      >
        {props.textSelectionState.highlighted ? (
          <RotateCcw aria-hidden="true" />
        ) : (
          <Highlighter aria-hidden="true" />
        )}
        {props.textSelectionState.highlighted
          ? '移除荧光笔'
          : `应用 ${visibleOpacity}% 荧光笔`}
      </button>
    </InspectorCard>
  )
}

function PageInspector(props: Props) {
  return (
    <>
      <InspectorCard
        title="页面与主题"
        description="这些设置影响整篇长图。"
        icon={<Palette />}
      >
        <Field label="主题">
          <Select
            value={props.currentThemeId ?? '__custom__'}
            onValueChange={(value) => {
              if (value !== '__custom__') props.onTheme(value)
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {props.currentThemeId === null && (
                <SelectItem value="__custom__" disabled>
                  自定义样式
                </SelectItem>
              )}
              <SelectGroup>
                <SelectLabel>内置主题</SelectLabel>
                {BUILTIN_THEMES.map((theme) => (
                  <SelectItem key={theme.id} value={theme.id}>
                    {theme.name}
                  </SelectItem>
                ))}
              </SelectGroup>
              {props.userThemes.length > 0 && (
                <SelectGroup>
                  <SelectLabel>我的主题</SelectLabel>
                  {props.userThemes.map((theme) => (
                    <SelectItem key={theme.id} value={theme.id}>
                      {theme.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
            </SelectContent>
          </Select>
        </Field>

        <div className="inspector-quick-actions">
          <button type="button" onClick={props.onOpenThemeLibrary}>
            <Palette aria-hidden="true" />
            主题库
          </button>
          <button type="button" onClick={props.onOpenAssetLibrary}>
            <FolderOpen aria-hidden="true" />
            素材库
          </button>
          <button type="button" onClick={props.onOpenFontLibrary}>
            <Type aria-hidden="true" />
            字体库
          </button>
        </div>

        <Field label="叠色">
          <SimpleSelect
            value={props.overlay}
            options={OVERLAY_OPTIONS}
            onValueChange={(value) => props.onOverlay(value as OverlayKey)}
          />
        </Field>
        <Field label="整体字号">
          <SimpleSelect
            value={String(props.fontSize)}
            options={FONT_SIZE_OPTIONS.map((option) => ({
              value: String(option.value),
              label: option.label,
            }))}
            onValueChange={(value) => props.onFontSize(Number(value))}
          />
        </Field>
        <Field label="排版间距">
          <SimpleSelect
            value={props.density}
            options={DENSITY_OPTIONS}
            onValueChange={(value) => props.onDensity(value as DensityLevel)}
          />
        </Field>
        <Field label="H1 宽度">
          <SimpleSelect
            value={props.h1Width}
            options={H1_WIDTH_OPTIONS}
            onValueChange={(value) => props.onH1Width(value as H1Width)}
          />
        </Field>
        <Field label="Logo 策略">
          <SimpleSelect
            value={props.logoStrategy}
            options={LOGO_STRATEGY_OPTIONS}
            onValueChange={(value) =>
              props.onLogoStrategy(value as LogoStrategy)
            }
          />
        </Field>
      </InspectorCard>

      <details className="inspector-details">
        <summary>高级字体设置</summary>
        <div className="inspector-details-body">
          <FontField
            label="H1 全局样式"
            value={props.fontH1}
            fonts={DISPLAY_FONTS}
            userFontFamilies={props.userFontFamilies}
            bold={props.h1Bold}
            onBold={() => props.onH1Bold(!props.h1Bold)}
            onChange={props.onFontH1}
          />
          <FontField
            label="H2 全局样式"
            value={props.fontH2}
            fonts={DISPLAY_FONTS}
            userFontFamilies={props.userFontFamilies}
            bold={props.h2Bold}
            onBold={() => props.onH2Bold(!props.h2Bold)}
            onChange={props.onFontH2}
          />
          <FontField
            label="H3 全局样式"
            value={props.fontH3}
            fonts={DISPLAY_FONTS}
            userFontFamilies={props.userFontFamilies}
            bold={props.h3Bold}
            onBold={() => props.onH3Bold(!props.h3Bold)}
            onChange={props.onFontH3}
          />
          <FontField
            label="正文全局样式"
            value={props.fontBody}
            fonts={BODY_FONTS}
            userFontFamilies={props.userFontFamilies}
            onChange={props.onFontBody}
          />
        </div>
      </details>

      <div className="inspector-empty-hint">
        <Highlighter aria-hidden="true" />
        <span>请先选中文字，再调整荧光笔。</span>
      </div>
    </>
  )
}

function RecentActions({ actions }: { actions: RecentAction[] }) {
  return (
    <section className="recent-actions" aria-labelledby="recent-actions-title">
      <div className="recent-actions-heading">
        <h2 id="recent-actions-title">最近操作</h2>
        <span>本会话</span>
      </div>
      {actions.length === 0 ? (
        <p className="recent-actions-empty">选图、调整或高亮后，这里会记录最近 5 步。</p>
      ) : (
        <ol>
          {actions.map((action) => (
            <li key={action.id}>
              <span className="recent-action-dot" aria-hidden="true" />
              <strong>{action.label}</strong>
              <time dateTime={new Date(action.time).toISOString()}>
                {new Intl.DateTimeFormat('zh-CN', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: false,
                }).format(action.time)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function InspectorCard({
  title,
  description,
  icon,
  children,
}: {
  title: string
  description: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="inspector-card">
      <div className="inspector-card-heading">
        <span className="inspector-card-icon" aria-hidden="true">
          {icon}
        </span>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      <div className="inspector-card-body">{children}</div>
    </section>
  )
}

function Field({
  label,
  value,
  children,
}: {
  label: string
  value?: string
  children: React.ReactNode
}) {
  const labelId = useId()

  return (
    <div
      className="inspector-field"
      role="group"
      aria-labelledby={labelId}
    >
      <span className="inspector-field-label">
        <span id={labelId}>{label}</span>
        {value && <output>{value}</output>}
      </span>
      {children}
    </div>
  )
}

function SimpleSelect({
  value,
  options,
  onValueChange,
}: {
  value: string
  options: Array<{ value: string; label: string }> | readonly { value: string; label: string }[]
  onValueChange: (value: string) => void
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function FontField({
  label,
  value,
  fonts,
  userFontFamilies,
  bold,
  onBold,
  onChange,
}: {
  label: string
  value: string
  fonts: FontOption[]
  userFontFamilies: string[]
  bold?: boolean
  onBold?: () => void
  onChange: (value: string) => void
}) {
  return (
    <div className="font-field">
      <span>{label}</span>
      <div>
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className="min-w-0 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {groupFonts(fonts).map((group) => (
              <SelectGroup key={group.group}>
                <SelectLabel>{group.group}</SelectLabel>
                {group.items.map((font) => (
                  <SelectItem key={font.value} value={font.value}>
                    {font.label} {font.crossPlatform ? '✓' : '✗'}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
            {userFontFamilies.length > 0 && (
              <SelectGroup>
                <SelectLabel>我的字体</SelectLabel>
                {userFontFamilies.map((family) => (
                  <SelectItem key={family} value={`"${family}", sans-serif`}>
                    {family}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
          </SelectContent>
        </Select>
        {onBold && (
          <button
            type="button"
            className={`font-bold-toggle ${bold ? 'is-active' : ''}`}
            aria-pressed={bold}
            onClick={onBold}
          >
            B
          </button>
        )}
      </div>
    </div>
  )
}
