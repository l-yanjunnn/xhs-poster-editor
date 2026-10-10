import { InspectorCard } from './InspectorCard'
import {
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import {
  AlertTriangle,
  AlignCenter,
  AlignLeft,
  AlignRight,
  Check,
  Copy,
  FileImage,
  FolderOpen,
  Highlighter,
  History,
  PanelsTopLeft,
  PanelRightClose,
  ImagePlus,
  MessageSquareText,
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
  OVERLAY_OPTIONS,
  type DensityLevel,
  type H1Width,
  type OverlayKey,
  type Theme,
} from '@/lib/themes'
import { DENSITY_OPTIONS } from '@/lib/density'
import { FONT_SIZE_OPTIONS } from '@/lib/fontSize'
import {
  COVER_TITLE_FONT_SIZE_OPTIONS,
  type CoverTitleFontSize,
} from '@/lib/coverTitle'
import {
  BODY_FONTS,
  DISPLAY_FONTS,
  SYSTEM_FONT_OPTION,
  SYSTEM_FONT_STACK,
  groupFonts,
  type FontOption,
} from '@/lib/fontPresets'
import {
  formatImageWidth,
  imageWidthToNumber,
  type ImageAlign,
} from '@/lib/imageModel'
import {
  highlightColorWithOpacity,
  normalizeHighlightColor,
  normalizeHighlightStyle,
  type TextHighlightStyle,
  type TextHighlightColor,
  TEXT_HIGHLIGHT_COLORS,
} from '@/lib/textHighlight'
import { normalizeHexColor } from '@/lib/hexColor'
import {
  COVER_LAYOUT_EXAMPLES,
  COVER_LAYOUT_OPTIONS,
  COVER_SUBTITLE_SPACING_OPTIONS,
  COVER_VERTICAL_OPTIONS,
  type CoverLayout,
  type CoverSubtitleSpacing,
  type CoverVertical,
} from '@/lib/coverSlots'

export interface RecentAction {
  id: string
  label: string
  time: number
}

export interface ResourceIssue {
  id: string
  label: string
  message: string
  backgroundRole?: 'cover' | 'inner'
}

interface Props {
  logoControls?: React.ReactNode
  pageLayoutControls?: React.ReactNode
  releaseCopy: string
  releaseCopySourceName: string | null
  onReleaseCopyChange: (value: string) => void
  imageState: ImageState
  textSelectionState: TextSelectionState
  recentActions: RecentAction[]
  resourceIssues: ResourceIssue[]
  resourceRetrying: boolean
  resourceLoading: boolean
  onRetryResources: (backgroundRole?: 'cover' | 'inner') => void

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
  coverTitleColor: string
  coverTitleFontSize?: CoverTitleFontSize
  coverTitleFontFamily?: string
  hasCoverTitle: boolean
  coverSubtitleColor: string
  coverLayout: CoverLayout
  coverVertical: CoverVertical
  coverSubtitleSpacing: CoverSubtitleSpacing
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
  onCoverTitleColor: (color: string) => void
  onCoverTitleFontSizeChange: (value: CoverTitleFontSize | undefined) => void
  onCoverTitleFontFamilyChange: (value: string | undefined) => void
  onCoverSubtitleColor: (color: string) => void
  onRestoreCoverColors: () => void
  onCoverLayout: (layout: CoverLayout) => void
  onCoverVertical: (vertical: CoverVertical) => void
  onCoverSubtitleSpacing: (spacing: CoverSubtitleSpacing) => void
  onOpenAssetLibrary: () => void
  onOpenFontLibrary: () => void
  onOpenThemeLibrary: () => void

  onImageAlign: (align: ImageAlign) => void
  onImageWidth: (width: string | null) => void
  onReplaceImage: () => void
  onDeleteImage: () => void
  onHighlightOpacity: (opacity: number) => void
  onHighlightStyle: (style: TextHighlightStyle) => void
  onHighlightColor: (color: TextHighlightColor) => void
  onClearHighlight: () => void
}

const INSPECTOR_CATEGORIES = [
  { id: 'text', label: '文字', title: '文字排版', description: '字体、字号与关键词强调', icon: Type },
  { id: 'page', label: '页面', title: '页面布局', description: '封面版式、页面位置与间距', icon: PanelsTopLeft },
  { id: 'appearance', label: '外观', title: '主题与外观', description: '主题、颜色与 Logo', icon: Palette },
  { id: 'image', label: '图片', title: '图片与素材', description: '选中图片后调整尺寸与对齐', icon: FileImage },
  { id: 'publish', label: '发布', title: '发布文案', description: '整理与复制配图文案', icon: MessageSquareText },
  { id: 'history', label: '记录', title: '最近操作', description: '本次会话的操作记录', icon: History },
] as const

type InspectorCategory = typeof INSPECTOR_CATEGORIES[number]['id']

export function ContextInspector(props: Props) {
  const [category, setCategory] = useState<InspectorCategory>('text')
  const [collapsed, setCollapsed] = useState(false)
  const panelId = useId()
  const categoryButtons = useRef<Array<HTMLButtonElement | null>>([])
  const current = INSPECTOR_CATEGORIES.find(item => item.id === category)!

  function openCategory(next: InspectorCategory) {
    setCategory(next)
    setCollapsed(false)
  }

  function collapsePanel() {
    setCollapsed(true)
    categoryButtons.current[INSPECTOR_CATEGORIES.findIndex(item => item.id === category)]?.focus()
  }

  function handleRailKey(event: ReactKeyboardEvent<HTMLButtonElement>, index: number) {
    const count = INSPECTOR_CATEGORIES.length
    const target = event.key === 'ArrowDown' ? (index + 1) % count
      : event.key === 'ArrowUp' ? (index + count - 1) % count
        : event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : null
    if (target === null) return
    event.preventDefault()
    categoryButtons.current[target]?.focus()
  }

  return (
    <aside
      className="context-inspector"
      aria-label="编辑工具"
      data-collapsed={collapsed}
      onKeyDown={event => {
        if (event.key === 'Escape' && !event.defaultPrevented) {
          event.preventDefault()
          event.stopPropagation()
          collapsePanel()
        }
      }}
    >
      <div className="inspector-drawer" id={panelId} hidden={collapsed}>
        <header className="inspector-drawer-heading">
          <div><h2>{current.title}</h2><p>{current.description}</p></div>
          <button type="button" onClick={collapsePanel} aria-label="收起工具面板" title="收起工具面板">
            <PanelRightClose aria-hidden="true" />
          </button>
        </header>
        {props.resourceIssues.length > 0 && category !== 'appearance' && (
          <button className="inspector-resource-alert" type="button" onClick={() => openCategory('appearance')}>
            <AlertTriangle aria-hidden="true" />{props.resourceIssues.length} 项资源未载入 · 查看
          </button>
        )}
        {props.resourceLoading && (
          <div className="resource-loading" role="status"><RefreshCw aria-hidden="true" className="is-spinning" />正在载入主题资源…</div>
        )}
        <div className="inspector-drawer-content" key={category} aria-label={`${current.label}设置`}>
          {category === 'text' && <>
            <CoverTitleFontSizeField value={props.coverTitleFontSize} hasCoverTitle={props.hasCoverTitle} onChange={props.onCoverTitleFontSizeChange}>
              <FontField
                label="封面主标题字体"
                value={props.coverTitleFontFamily ?? 'inherit'}
                fonts={DISPLAY_FONTS}
                userFontFamilies={props.userFontFamilies}
                inheritLabel="跟随全篇 H1 字体"
                onChange={value => props.onCoverTitleFontFamilyChange(value === 'inherit' ? undefined : value)}
              />
            </CoverTitleFontSizeField>
            {props.textSelectionState.active ? <TextInspector {...props} /> : (
              <div className="inspector-empty-hint"><Highlighter aria-hidden="true" /><span>请先选中标题或正文中的词，再添加关键词强调。</span></div>
            )}
            <TypographyInspector {...props} />
          </>}
          {category === 'page' && <>
            {props.pageLayoutControls}
            <InspectorCard title="封面版式" description="仅第 1 页；改变文字组合和垂直位置。" icon={<PanelsTopLeft />}>
              <CoverSlotFields layout={props.coverLayout} vertical={props.coverVertical} subtitleSpacing={props.coverSubtitleSpacing} onLayout={props.onCoverLayout} onVertical={props.onCoverVertical} onSubtitleSpacing={props.onCoverSubtitleSpacing} />
            </InspectorCard>
            <InspectorCard title="整篇排版" description="统一所有页面的排版规则。" icon={<Type />}>
              <Field label="排版间距"><SimpleSelect value={props.density} options={DENSITY_OPTIONS} onValueChange={value => props.onDensity(value as DensityLevel)} /></Field>
              <Field label="全篇 H1 宽度"><SimpleSelect value={props.h1Width} options={H1_WIDTH_OPTIONS} onValueChange={value => props.onH1Width(value as H1Width)} /></Field>
            </InspectorCard>
          </>}
          {category === 'appearance' && <>
            {props.resourceIssues.length > 0 && <ResourceIssues issues={props.resourceIssues} retrying={props.resourceRetrying} onRetry={props.onRetryResources} />}
            <AppearanceInspector {...props} />
            {props.logoControls}
          </>}
          {category === 'image' && <>
            {props.imageState.active ? <ImageInspector key={props.imageState.imageId} {...props} /> : (
              <div className="inspector-empty-hint"><FileImage aria-hidden="true" /><span>先在正文或预览中选中图片，即可调整尺寸、对齐或替换图片。</span></div>
            )}
            <button className="inspector-library-action" type="button" onClick={props.onOpenAssetLibrary}><FolderOpen aria-hidden="true" />打开素材库<span>插入图片或管理素材</span></button>
          </>}
          {category === 'publish' && <>
            <PublicationCopyCard value={props.releaseCopy} sourceName={props.releaseCopySourceName} onChange={props.onReleaseCopyChange} />
            <p className="inspector-section-note">图片成品通过右上角「导出 PNG」生成。</p>
          </>}
          {category === 'history' && <>
            <RecentActions actions={props.recentActions} />
            <p className="inspector-section-note">这里记录最近的操作。撤销与重做请使用顶栏按钮。</p>
          </>}
        </div>
      </div>
      {collapsed && <div className="inspector-collapsed-hint"><Type aria-hidden="true" /><strong>工具面板已收起</strong><span>点击右侧分类继续设置</span></div>}
      <nav className="inspector-rail" aria-label="工具分类">
        <span className="inspector-rail-caption" aria-hidden="true">工具</span>
        {INSPECTOR_CATEGORIES.map(({ id, label, icon: Icon }, index) => (
          <button
            key={id}
            ref={element => { categoryButtons.current[index] = element }}
            type="button"
            aria-label={label}
            aria-expanded={!collapsed && category === id}
            aria-controls={panelId}
            title={`${label} · 点击展开或收起`}
            onClick={() => { if (category === id && !collapsed) collapsePanel(); else openCategory(id) }}
            onKeyDown={event => handleRailKey(event, index)}
          >
            <Icon aria-hidden="true" /><span>{label}</span>
            {((id === 'image' && props.imageState.active) || (id === 'text' && props.textSelectionState.active)) && <i className="inspector-rail-dot" aria-label="当前有选区" />}
            {id === 'appearance' && props.resourceIssues.length > 0 && <i className="inspector-rail-dot is-warning" aria-label="有资源未载入" />}
          </button>
        ))}
      </nav>
    </aside>
  )
}

function PublicationCopyCard({
  value,
  sourceName,
  onChange,
}: {
  value: string
  sourceName: string | null
  onChange: (value: string) => void
}) {
  const [copied, setCopied] = useState(false)

  async function copyReleaseCopy() {
    if (!value.trim()) return
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = value
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      textarea.remove()
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1_600)
  }

  return (
    <section className="publication-copy-card" aria-labelledby="publication-copy-title">
      <div className="publication-copy-heading">
        <span className="publication-copy-icon" aria-hidden="true">
          <MessageSquareText />
        </span>
        <div>
          <h2 id="publication-copy-title">发布文案</h2>
          <p>独立于画布，与当前草稿一起保存。</p>
        </div>
        <button
          type="button"
          className="publication-copy-action"
          onClick={() => void copyReleaseCopy()}
          disabled={!value.trim()}
          aria-label="复制发布文案"
        >
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <textarea
        className="publication-copy-textarea"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        placeholder="导入专用结构文稿后，# 正文下的内容会放在这里。"
        aria-label="发布文案"
      />
      <div className="publication-copy-meta">
        <span>{sourceName ? `来自 ${sourceName}` : '当前草稿暂无独立发布文案'}</span>
        <span>{value.length} 字</span>
      </div>
    </section>
  )
}

function ResourceIssues({
  issues,
  retrying,
  onRetry,
}: {
  issues: ResourceIssue[]
  retrying: boolean
  onRetry: (backgroundRole?: 'cover' | 'inner') => void
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
            {issue.backgroundRole ? (
              <button
                type="button"
                className="resource-issue-retry"
                onClick={() => onRetry(issue.backgroundRole)}
                disabled={retrying}
                aria-label={`重新载入${issue.label}`}
              >
                <RefreshCw aria-hidden="true" />
                单独重试
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => onRetry()} disabled={retrying}>
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
  const style = normalizeHighlightStyle(props.textSelectionState.style)
  const color = normalizeHighlightColor(props.textSelectionState.color, style)
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
      title="关键词强调"
      description="支持标题和正文，只作用于当前选中文字，不影响后续输入。"
      icon={<Highlighter />}
    >
      <div className="highlight-style-options" role="group" aria-label="荧光笔样式">
        {([
          ['background', '整块底色'],
          ['underline', '划线荧光笔'],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-label={label}
            aria-pressed={!props.textSelectionState.mixedStyle && style === value}
            onClick={() => {
              setDraftOpacity(null)
              props.onHighlightStyle(value)
            }}
          >
            <span className="highlight-style-sample" aria-hidden="true">
              <span style={{
                background: value === 'underline'
                  ? `linear-gradient(transparent 65%, ${highlightColorWithOpacity(color, 0.5, value)} 65%, ${highlightColorWithOpacity(color, 0.5, value)} 93%, transparent 93%)`
                  : highlightColorWithOpacity(color, 0.25, value),
              }}>关键词</span>
            </span>
            <span>{label}</span>
          </button>
        ))}
      </div>
      {props.textSelectionState.mixedStyle && (
        <p className="m-0 text-[11px] leading-4 text-neutral-500">
          选区含多种强调样式；调整透明度会保留各自样式。
        </p>
      )}
      <Field label="强调颜色" value={props.textSelectionState.mixedColor ? '多种颜色' : color}>
        <div className="highlight-color-palette" role="group" aria-label="关键词强调色板">
          {TEXT_HIGHLIGHT_COLORS.map(swatch => (
            <button
              type="button"
              key={swatch.value}
              aria-label={`${swatch.label} ${swatch.value}`}
              aria-pressed={!props.textSelectionState.mixedColor && color === swatch.value}
              title={`${swatch.label} ${swatch.value}`}
              onClick={() => { setDraftOpacity(null); props.onHighlightColor(swatch.value) }}
            >
              <span style={{ backgroundColor: swatch.value }} aria-hidden="true">{!props.textSelectionState.mixedColor && color === swatch.value && <Check />}</span>
              {swatch.label}
            </button>
          ))}
        </div>
      </Field>
      <Field label="透明度" value={`${visibleOpacity}%`}>
        <input
          className="inspector-range inspector-range--highlight"
          style={{ accentColor: color }}
          type="range"
          min="0"
          max="100"
          step="1"
          value={visibleOpacity}
          aria-label="关键词强调透明度"
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
            ? '移除选区关键词强调'
            : `以 ${visibleOpacity}% 透明度应用到当前选区`
        }
      >
        {props.textSelectionState.highlighted ? (
          <RotateCcw aria-hidden="true" />
        ) : (
          <Highlighter aria-hidden="true" />
        )}
        {props.textSelectionState.highlighted
          ? '移除关键词强调'
          : `应用 ${visibleOpacity}% 关键词强调`}
      </button>
    </InspectorCard>
  )
}

function AppearanceInspector(props: Props) {
  return <InspectorCard title="主题与颜色" description="主题作用于整篇；文字颜色仅影响封面。" icon={<Palette />}>
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

        <button className="inspector-library-action" type="button" onClick={props.onOpenThemeLibrary}><Palette aria-hidden="true" />打开主题库<span>套用或管理整篇主题</span></button>
        <CoverColorFields
          titleColor={props.coverTitleColor}
          subtitleColor={props.coverSubtitleColor}
          onTitleColor={props.onCoverTitleColor}
          onSubtitleColor={props.onCoverSubtitleColor}
          onRestore={props.onRestoreCoverColors}
        />

        <Field label="叠色">
          <SimpleSelect
            value={props.overlay}
            options={OVERLAY_OPTIONS}
            onValueChange={(value) => props.onOverlay(value as OverlayKey)}
          />
        </Field>
  </InspectorCard>
}

function TypographyInspector(props: Props) {
  return <InspectorCard title="整篇字体" description="全篇基础样式；封面主标题可在上方单独选字体。" icon={<Type />}>
    <Field label="整体字号">
      <SimpleSelect value={String(props.fontSize)} options={FONT_SIZE_OPTIONS.map(option => ({value: String(option.value), label: option.label}))} onValueChange={value => props.onFontSize(Number(value))} />
    </Field>
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
          {[props.coverTitleFontFamily, props.fontH1, props.fontH2, props.fontH3, props.fontBody].includes(SYSTEM_FONT_STACK) && (
            <p className="font-local-note">{SYSTEM_FONT_OPTION.note}</p>
          )}

    <button className="inspector-library-action" type="button" onClick={props.onOpenFontLibrary}><Type aria-hidden="true" />打开字体库<span>管理已导入的字体</span></button>
  </InspectorCard>
}

function CoverSlotFields({
  layout,
  vertical,
  subtitleSpacing,
  onLayout,
  onVertical,
  onSubtitleSpacing,
}: {
  layout: CoverLayout
  vertical: CoverVertical
  subtitleSpacing: CoverSubtitleSpacing
  onLayout: (layout: CoverLayout) => void
  onVertical: (vertical: CoverVertical) => void
  onSubtitleSpacing: (spacing: CoverSubtitleSpacing) => void
}) {
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
      <legend className="px-1 text-xs font-semibold text-neutral-700">
        封面版式
      </legend>
      <div className="cover-layout-options" role="group" aria-label="封面版式">
        {COVER_LAYOUT_OPTIONS.map((option) => {
          const example = COVER_LAYOUT_EXAMPLES[option.value]
          return (
            <button
              key={option.value}
              type="button"
              className={layout === option.value ? 'is-active' : undefined}
              aria-pressed={layout === option.value}
              onClick={() => onLayout(option.value)}
            >
              <img src={example.previewSrc} alt="" />
              <strong>{option.label}</strong>
            </button>
          )
        })}
      </div>
      <div className="inspector-field">
        <div className="inspector-field-label">垂直位置</div>
        <div className="segmented-control" role="group" aria-label="垂直位置">
          {COVER_VERTICAL_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={vertical === option.value ? 'is-active' : undefined}
              aria-pressed={vertical === option.value}
              onClick={() => onVertical(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="inspector-field">
        <div className="inspector-field-label">副标题字距</div>
        <div className="segmented-control" role="group" aria-label="副标题字距">
          {COVER_SUBTITLE_SPACING_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={
                subtitleSpacing === option.value ? 'is-active' : undefined
              }
              aria-pressed={subtitleSpacing === option.value}
              onClick={() => onSubtitleSpacing(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="m-0 text-[11px] leading-4 text-neutral-500">
          实验能力 · 只影响封面副标题
        </p>
      </div>
    </fieldset>
  )
}

function CoverTitleFontSizeField({
  value,
  hasCoverTitle,
  onChange,
  children,
}: {
  value?: CoverTitleFontSize
  hasCoverTitle: boolean
  onChange: (value: CoverTitleFontSize | undefined) => void
  children?: React.ReactNode
}) {
  const labelId = useId()
  const hintId = useId()

  return (
    <section className="cover-title-size-card inspector-field" aria-labelledby={labelId}>
      <div className="cover-title-size-heading">
        <h2 id={labelId}>封面主标题字号</h2>
        <span>仅第 1 页</span>
      </div>
      <div
        className="width-presets cover-title-size-options"
        role="group"
        aria-labelledby={labelId}
        aria-describedby={hintId}
      >
        <button
          type="button"
          className={value === undefined ? 'is-active' : undefined}
          aria-pressed={value === undefined}
          onClick={() => onChange(undefined)}
        >
          跟随原规则
        </button>
        {COVER_TITLE_FONT_SIZE_OPTIONS.map((size) => (
          <button
            key={size}
            type="button"
            className={value === size ? 'is-active' : undefined}
            aria-pressed={value === size}
            disabled={!hasCoverTitle}
            onClick={() => onChange(size)}
          >
            {size} px
          </button>
        ))}
      </div>
      <p id={hintId} className="m-0 text-[11px] leading-4 text-neutral-500">
        {hasCoverTitle
          ? '只影响封面第一个主标题（H1），无需先选中文字。'
          : '请先在第一页添加主标题（H1），再设置独立字号。'}
      </p>
      {children}
    </section>
  )
}

function CoverColorFields({
  titleColor,
  subtitleColor,
  onTitleColor,
  onSubtitleColor,
  onRestore,
}: {
  titleColor: string
  subtitleColor: string
  onTitleColor: (color: string) => void
  onSubtitleColor: (color: string) => void
  onRestore: () => void
}) {
  const [resetNonce, setResetNonce] = useState(0)

  function restoreColors() {
    setResetNonce((value) => value + 1)
    onRestore()
  }

  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
      <legend className="px-1 text-xs font-semibold text-neutral-700">
        封面文字颜色
      </legend>
      <HexColorInput
        key={`title-${titleColor}-${resetNonce}`}
        label="主标题"
        value={titleColor}
        onCommit={onTitleColor}
      />
      <HexColorInput
        key={`subtitle-${subtitleColor}-${resetNonce}`}
        label="副标题"
        value={subtitleColor}
        onCommit={onSubtitleColor}
      />
      <button
        type="button"
        className="inspector-reset-action w-full"
        onClick={restoreColors}
      >
        <RotateCcw aria-hidden="true" />
        恢复模板颜色
      </button>
    </fieldset>
  )
}

function HexColorInput({
  label,
  value,
  onCommit,
}: {
  label: string
  value: string
  onCommit: (color: string) => void
}) {
  const inputId = useId()
  const errorId = useId()
  const [draft, setDraft] = useState(value)
  const [error, setError] = useState<string | null>(null)

  function commit(rawValue: string) {
    const normalized = normalizeHexColor(rawValue)
    if (!normalized) {
      setError('请输入 # 加 6 位十六进制颜色，例如 #6D136C')
      return
    }

    setDraft(normalized)
    setError(null)
    if (normalized !== value) onCommit(normalized)
  }

  const previewColor =
    normalizeHexColor(draft) ?? normalizeHexColor(value) ?? '#000000'

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={inputId} className="text-[11px] font-semibold text-neutral-600">
        {label}
      </label>
      <div className="flex min-w-0 items-center gap-2">
        <span
          className="h-9 w-9 flex-none rounded-lg border-4 border-white shadow-[0_0_0_1px_#e4e7ec]"
          style={{ backgroundColor: previewColor }}
          aria-hidden="true"
        />
        <input
          id={inputId}
          className={`h-9 min-w-0 flex-1 rounded-lg border bg-white px-3 font-mono text-xs uppercase text-neutral-800 outline-none transition focus:ring-2 ${
            error
              ? 'border-red-300 focus:border-red-400 focus:ring-red-100'
              : 'border-neutral-300 focus:border-blue-400 focus:ring-blue-100'
          }`}
          type="text"
          value={draft}
          maxLength={7}
          spellCheck={false}
          autoCapitalize="characters"
          aria-label={`${label}颜色`}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => {
            setDraft(event.target.value)
            setError(null)
          }}
          onBlur={(event) => commit(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            commit(event.currentTarget.value)
          }}
        />
      </div>
      {error ? (
        <p id={errorId} role="alert" className="m-0 text-[10px] leading-4 text-red-600">
          {error}
        </p>
      ) : null}
    </div>
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
  inheritLabel,
}: {
  label: string
  value: string
  fonts: FontOption[]
  userFontFamilies: string[]
  bold?: boolean
  onBold?: () => void
  onChange: (value: string) => void
  inheritLabel?: string
}) {
  return (
    <div className="font-field">
      <span>{label}</span>
      <div>
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className="min-w-0 flex-1" aria-label={label}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {inheritLabel && <SelectItem value="inherit">{inheritLabel}</SelectItem>}
            {groupFonts(fonts).map((group) => (
              <SelectGroup key={group.group}>
                <SelectLabel>{group.group}</SelectLabel>
                {group.items.map((font) => (
                  <SelectItem key={font.value} value={font.value}>
                    {font.label} {font.note ? '· 随设备' : font.crossPlatform ? '✓' : '✗'}
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
