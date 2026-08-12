import {
  useEditor,
  useEditorState,
  EditorContent,
  type Editor,
} from '@tiptap/react'
import {
  forwardRef,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
} from 'react'
import {
  Bold,
  Code2,
  ImagePlus,
  Italic,
  List,
  ListOrdered,
  Minus,
  PanelTopOpen,
  Quote,
  Underline,
  WrapText,
} from 'lucide-react'
import { closeHistory, history } from '@tiptap/pm/history'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import type { PosterImageAttributes } from './ImageExtension'
import {
  normalizeIncomingContent,
  stripPastedImageIds,
} from './contentNormalization'
import { createEditorExtensions } from './editorExtensions'
import { insertRootPageBreak } from './pageBreakCommand'
import {
  applyBlockType,
  type EditorBlockType,
} from './blockTypeCommand'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  canKeepPhraseTogether,
  normalizeChineseBoldBoundaryWhitespaceHtml,
  NO_WRAP_PHRASE_MAX_LENGTH,
} from '@/lib/textReliability'
import {
  createImageId,
  normalizeImageAlign,
  normalizeImageWidth,
  type ImageAlign,
} from '@/lib/imageModel'
import {
  normalizeHighlightOpacity,
  TEXT_HIGHLIGHT_COLOR,
  TEXT_HIGHLIGHT_DEFAULT_OPACITY,
} from '@/lib/textHighlight'
import { normalizePageBreakHtml } from '@/lib/pageBreak'
import '@/styles/editor.css'

// 上抛给 App 的选区状态，中央画布和右侧检查器共用。
export interface ImageState {
  active: boolean
  imageId: string | null
  width: string | null
  align: ImageAlign
  src: string | null
  assetId: string | null
}

export interface TextSelectionState {
  active: boolean
  highlighted: boolean
  opacity: number
}

export interface HistoryState {
  canUndo: boolean
  canRedo: boolean
}

export interface NoWrapH1Layout {
  fontFamily: string
  fontSizePx: number
  fontWeight: number
  maxWidthPx: number
}

// 暴露给 App 的命令式 API：apply 主题时需要外部 setContent，保存主题时需要 getJSON；
// 插入图片需要让 App 持有的素材库回调能把 src 喂回编辑器；
// 图片属性命令同时供中央画布手势与右侧上下文检查器使用。
export interface EditorHandle {
  setContent: (
    content: object | string,
    options?: { resetHistory?: boolean },
  ) => void
  getJSON: () => object | null
  insertImage: (src: string, assetId?: string) => void
  setImageWidth: (width: string | null) => void
  selectImageById: (imageId: string) => boolean
  commitImageAttributes: (
    imageId: string,
    patch: Partial<Pick<PosterImageAttributes, 'width' | 'align' | 'src' | 'assetId'>>,
  ) => boolean
  deleteImageById: (imageId: string) => boolean
  clearSelection: () => boolean
  setTextHighlight: (opacity: number) => boolean
  clearTextHighlight: () => boolean
  syncImageSources: (
    updates: Array<{ imageId: string; src: string }>,
  ) => boolean
  undo: () => boolean
  redo: () => boolean
  // v1.8 滚动联动：协调层需要左栏滚动容器与 ProseMirror 根节点做几何测量。
  // 只读 DOM 引用，不承诺任何可变操作。
  getScrollAreaElement: () => HTMLElement | null
  getEditorRootElement: () => HTMLElement | null
}

interface Props {
  onUpdate?: (html: string) => void
  initialContent?: string
  // 编辑器内点「插入图片」时通知 App 打开素材库到 image tab
  onInsertImageClick?: () => void
  // selection 变化或图片属性变化时上抛，App 据此同步中央画布与右侧检查器。
  onImageStateChange?: (state: ImageState) => void
  onTextSelectionStateChange?: (state: TextSelectionState) => void
  onHistoryStateChange?: (state: HistoryState) => void
  noWrapH1Layout?: NoWrapH1Layout
}

const DEFAULT_CONTENT = `
<h1>小红书长图排版工具</h1>
<p>使用指南 · 给非技术朋友的开箱即用工具</p>
<hr class="divider">
<p>写正文 → 调对象 → 一键导出 PNG，三步搞定小红书图文长图。</p>
<blockquote>左侧写正文，中央看 9:15 成品，右侧只显示当前对象的设置。所见即所得，不用懂代码。</blockquote>
<p>这份五页教程会带你认识 V1.4 工作台。</p>

<hr class="page-break">

<h1>三栏工作台</h1>
<p>每一栏只负责一件事，找设置不用来回翻。</p>
<ul>
  <li><strong>左侧</strong>：输入正文、切换段落样式、插图和分页</li>
  <li><strong>中央</strong>：查看多页成品，并直接选择和调整图片</li>
  <li><strong>右侧</strong>：页面、文字或图片被选中时，只展示相关设置</li>
</ul>
<h2>顶部只放全局动作</h2>
<p>撤销 / 重做、草稿状态、裁切参考、排版参考、磁吸与导出都在顶部。导出是唯一紫色主按钮。</p>

<hr class="page-break">

<h1>文字排版</h1>
<p>左侧工具栏控制段落结构；右侧文字检查器处理当前选区。</p>
<h2>支持的块</h2>
<ul>
  <li><strong>H1 / H2 / H3</strong>：三级标题，各有独立字体和字重</li>
  <li><strong>正文 / 引用 / 代码块</strong>：基础文本块</li>
  <li><strong>有序 / 无序列表</strong>：嵌套自如</li>
</ul>
<p>选中 1–12 个字符后点「短语不拆」，机构名或关键词就不会从中间换行。</p>
<p>选中文字后可加固定紫色荧光笔，并把透明度从 0% 调到 100%；它不会影响后续输入。</p>
<blockquote>「— 分隔线 —」负责装饰；「↓ 插入分页 ↓」才会把后续内容切到下一页。</blockquote>

<hr class="page-break">

<h1>图片与参考线</h1>
<p>点击中央画布里的图片，会出现选框、四角手柄和顶部横向抓手。</p>
<ul>
  <li><strong>缩放</strong>：拖四角等比调整；也可在右侧输入宽度</li>
  <li><strong>对齐</strong>：拖顶部抓手或在右侧选择左 / 中 / 右</li>
  <li><strong>磁吸</strong>：自动吸附版心与常用宽度；按住 Option / Alt 临时关闭</li>
  <li><strong>取消</strong>：拖动中按 Esc，立即回到本次操作前</li>
</ul>
<blockquote>裁切参考、排版参考和磁吸彼此独立；选框、手柄与辅助线都不会进入 PNG。</blockquote>

<hr class="page-break">

<h1>草稿、资源与导出</h1>
<p>正文、样式、背景和 Logo 自动保存在当前浏览器；草稿库支持另存、切换和删除。</p>
<p>素材库存背景、Logo 和插图；主题只保存可复用样式。单个资源失败只会局部降级，可在右侧原位重试。</p>
<h3>导出 PNG</h3>
<ul>
  <li>单页 → 直接下载 PNG，多页 → 自动打 zip</li>
  <li>文件名默认取首个 H1，同名再次导出自动加 -2 / -3 序号</li>
  <li>导出前会检查图片和字体；失败时可重新检查或明确选择继续</li>
</ul>
<blockquote>导出尺寸 2160 × 3600，真实 9:15（3:5），scale 2 高清。</blockquote>
<p>开始写你自己的内容吧 ✦</p>
`

interface FoundImage {
  pos: number
  attrs: PosterImageAttributes
  nodeSize: number
}

// P2 性能：光标每移动一格都会触发 selectionUpdate/transaction 上报。
// 值未变时不回调 App（否则每次都是新对象字面量 → setState → 整棵
// App 树重渲染）。三个状态各自逐字段浅比较。
function sameImageState(a: ImageState, b: ImageState): boolean {
  return (
    a.active === b.active &&
    a.imageId === b.imageId &&
    a.width === b.width &&
    a.align === b.align &&
    a.src === b.src &&
    a.assetId === b.assetId
  )
}

function sameTextSelectionState(
  a: TextSelectionState,
  b: TextSelectionState,
): boolean {
  return (
    a.active === b.active &&
    a.highlighted === b.highlighted &&
    a.opacity === b.opacity
  )
}

function sameHistoryState(a: HistoryState, b: HistoryState): boolean {
  return a.canUndo === b.canUndo && a.canRedo === b.canRedo
}

function findImageById(editor: Editor, imageId: string): FoundImage | null {
  let found: FoundImage | null = null
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'image' || node.attrs.imageId !== imageId) return true
    found = {
      pos,
      attrs: node.attrs as PosterImageAttributes,
      nodeSize: node.nodeSize,
    }
    return false
  })
  return found
}

export const EditorPane = forwardRef<EditorHandle, Props>(function EditorPane(
  {
    onUpdate,
    initialContent,
    onInsertImageClick,
    onImageStateChange,
    onTextSelectionStateChange,
    onHistoryStateChange,
    noWrapH1Layout,
  },
  ref,
) {
  const noWrapH1LayoutRef = useRef(noWrapH1Layout)
  const scrollAreaRef = useRef<HTMLDivElement | null>(null)
  // 上次上报值：仅当逐字段比较发现变化时才回调 App（见 sameImageState 注释）。
  const lastReportedRef = useRef<{
    image: ImageState | null
    text: TextSelectionState | null
    history: HistoryState | null
  }>({ image: null, text: null, history: null })

  const reportEditorState = useCallback((ed: Editor) => {
    const last = lastReportedRef.current
    const imageActive = ed.isActive('image')
    const imageAttrs = imageActive
      ? (ed.getAttributes('image') as Partial<PosterImageAttributes>)
      : {}
    const nextImageState: ImageState = {
      active: imageActive,
      imageId:
        imageActive && typeof imageAttrs.imageId === 'string'
          ? imageAttrs.imageId
          : null,
      width: normalizeImageWidth(imageAttrs.width),
      align: normalizeImageAlign(imageAttrs.align),
      src:
        imageActive && typeof imageAttrs.src === 'string' ? imageAttrs.src : null,
      assetId:
        imageActive && typeof imageAttrs.assetId === 'string'
          ? imageAttrs.assetId
          : null,
    }
    if (!last.image || !sameImageState(last.image, nextImageState)) {
      last.image = nextImageState
      onImageStateChange?.(nextImageState)
    }

    const textSelection = ed.state.selection
    const textActive =
      textSelection instanceof TextSelection && !textSelection.empty
    const highlightAttrs = textActive
      ? (ed.getAttributes('textHighlight') as {
          opacity?: unknown
        })
      : {}
    const nextTextSelectionState: TextSelectionState = {
      active: textActive,
      highlighted: textActive && ed.isActive('textHighlight'),
      opacity: normalizeHighlightOpacity(
        highlightAttrs.opacity ?? TEXT_HIGHLIGHT_DEFAULT_OPACITY,
      ),
    }
    if (
      !last.text ||
      !sameTextSelectionState(last.text, nextTextSelectionState)
    ) {
      last.text = nextTextSelectionState
      onTextSelectionStateChange?.(nextTextSelectionState)
    }

    const nextHistoryState: HistoryState = {
      canUndo: ed.can().undo(),
      canRedo: ed.can().redo(),
    }
    if (!last.history || !sameHistoryState(last.history, nextHistoryState)) {
      last.history = nextHistoryState
      onHistoryStateChange?.(nextHistoryState)
    }
  }, [onHistoryStateChange, onImageStateChange, onTextSelectionStateChange])

  const editor = useEditor({
    extensions: createEditorExtensions(),
    content: normalizeIncomingContent(initialContent ?? DEFAULT_CONTENT),
    editorProps: {
      // 富文本粘贴是异常空格的主要来源。只清理可判定的中文粗体边界，
      // 不对纯文本、英文、URL 或 code/pre 做激进重写。
      transformPastedHTML: (html) =>
        normalizePageBreakHtml(normalizeChineseBoldBoundaryWhitespaceHtml(html)),
      transformPasted: stripPastedImageIds,
    },
    onUpdate: ({ editor }) => {
      onUpdate?.(editor.getHTML())
      // 改属性（如调宽度）也走 onUpdate，需同步上抛
      reportEditorState(editor)
    },
    onSelectionUpdate: ({ editor }) => reportEditorState(editor),
    onTransaction: ({ editor }) => {
      // undo、setContent、草稿恢复或外部 HTML 都可能绕过工具栏校验。
      // 每次文档 transaction 后都重新建立 nowrap 不变量。
      queueMicrotask(() => {
        if (!editor.isDestroyed) {
          removeUnsafeNoWrapMarks(editor, noWrapH1LayoutRef.current)
          reportEditorState(editor)
        }
      })
    },
  })

  function replaceContent(
    content: object | string,
    resetHistory: boolean,
  ): void {
    if (!editor) return
    const normalized = normalizeIncomingContent(content)
    if (!resetHistory) {
      editor.commands.setContent(normalized as never)
      return
    }

    // ProseMirror 的 setContent 本身会进 history，仅设 addToHistory=false
    // 也不会清除上一份草稿的 undo 栈。恢复/切换草稿时重建
    // history plugin，确保撤销绝不跨文档。
    editor.unregisterPlugin('history')
    editor.commands.setContent(normalized as never, { emitUpdate: false })
    editor.registerPlugin(history({ depth: 100, newGroupDelay: 500 }))
    onUpdate?.(editor.getHTML())
    queueMicrotask(() => {
      if (!editor.isDestroyed) reportEditorState(editor)
    })
  }

  function selectImageById(imageId: string): boolean {
    if (!editor) return false
    const target = findImageById(editor, imageId)
    if (!target) return false
    const transaction = editor.state.tr
      .setSelection(NodeSelection.create(editor.state.doc, target.pos))
      .setMeta('addToHistory', false)
    editor.view.dispatch(transaction)
    return true
  }

  function commitImageAttributes(
    imageId: string,
    patch: Partial<
      Pick<PosterImageAttributes, 'width' | 'align' | 'src' | 'assetId'>
    >,
  ): boolean {
    if (!editor) return false
    const target = findImageById(editor, imageId)
    if (!target) return false
    const current = target.attrs
    const next: Record<string, unknown> = {
      ...current,
      ...patch,
      width:
        'width' in patch ? normalizeImageWidth(patch.width) : current.width,
      align:
        'align' in patch ? normalizeImageAlign(patch.align) : current.align,
      height: null,
    }
    const changedAttributes = Object.entries(next).filter(
      ([key, value]) =>
        current[key as keyof PosterImageAttributes] !== value,
    )
    if (changedAttributes.length === 0) return false

    // 属性级 step 的 inverse 只恢复本次改动的属性。这样资源恢复在
    // 之后以 addToHistory=false 同步新 src 时，撤销 width/align 不会
    // 被整节点 setNodeMarkup 的旧快照带回过期 src。
    let transaction = editor.state.tr
    for (const [attribute, value] of changedAttributes) {
      transaction = transaction.setNodeAttribute(target.pos, attribute, value)
    }
    transaction = closeHistory(transaction)
    transaction.setSelection(NodeSelection.create(transaction.doc, target.pos))
    editor.view.dispatch(transaction)
    return true
  }

  function deleteImageById(imageId: string): boolean {
    if (!editor) return false
    const target = findImageById(editor, imageId)
    if (!target) return false
    const transaction = closeHistory(
      editor.state.tr.delete(target.pos, target.pos + target.nodeSize),
    )
    editor.view.dispatch(transaction)
    return true
  }

  function setTextHighlight(opacity: number): boolean {
    if (!editor) return false
    const { selection } = editor.state
    if (!(selection instanceof TextSelection) || selection.empty) return false
    const mark = editor.schema.marks.textHighlight
    if (!mark) return false
    const nextOpacity = normalizeHighlightOpacity(opacity)
    let sawText = false
    let alreadyApplied = true
    editor.state.doc.nodesBetween(selection.from, selection.to, (node) => {
      if (!node.isText) return true
      sawText = true
      const existing = node.marks.find((item) => item.type === mark)
      if (
        !existing ||
        existing.attrs.color !== TEXT_HIGHLIGHT_COLOR ||
        normalizeHighlightOpacity(existing.attrs.opacity) !== nextOpacity
      ) {
        alreadyApplied = false
      }
      return true
    })
    if (sawText && alreadyApplied) return false
    const transaction = closeHistory(
      editor.state.tr.addMark(
        selection.from,
        selection.to,
        mark.create({
          color: TEXT_HIGHLIGHT_COLOR,
          opacity: nextOpacity,
        }),
      ),
    )
    editor.view.dispatch(transaction)
    return true
  }

  function clearTextHighlight(): boolean {
    if (!editor) return false
    const { selection } = editor.state
    if (!(selection instanceof TextSelection) || selection.empty) return false
    const mark = editor.schema.marks.textHighlight
    if (!mark) return false
    if (!editor.state.doc.rangeHasMark(selection.from, selection.to, mark)) {
      return false
    }
    const transaction = closeHistory(
      editor.state.tr.removeMark(selection.from, selection.to, mark),
    )
    editor.view.dispatch(transaction)
    return true
  }

  useImperativeHandle(
    ref,
    () => ({
      setContent: (content, options) =>
        replaceContent(content, options?.resetHistory ?? false),
      getJSON: () => editor?.getJSON() ?? null,
      insertImage: (src, assetId) => {
        // setImage 的类型签名不含自定义 attrs，走 insertContent 直接给节点 JSON
        editor
          ?.chain()
          .focus()
          .insertContent({
            type: 'image',
            attrs: {
              src,
              assetId: assetId ?? null,
              imageId: createImageId(),
              width: null,
              height: null,
              align: 'left',
            },
          })
          .run()
      },
      setImageWidth: (width) => {
        const imageId = editor?.getAttributes('image').imageId
        if (typeof imageId === 'string') {
          commitImageAttributes(imageId, { width })
        }
      },
      selectImageById,
      commitImageAttributes,
      deleteImageById,
      clearSelection: () => {
        if (!editor) return false
        const position = Math.min(
          editor.state.selection.to,
          editor.state.doc.content.size,
        )
        const selection = TextSelection.near(editor.state.doc.resolve(position))
        editor.view.dispatch(
          editor.state.tr
            .setSelection(selection)
            .setMeta('addToHistory', false),
        )
        return true
      },
      setTextHighlight,
      clearTextHighlight,
      syncImageSources: (updates) => {
        if (!editor || updates.length === 0) return false
        const byId = new Map(updates.map((update) => [update.imageId, update.src]))
        let transaction = editor.state.tr
        let changed = false
        editor.state.doc.descendants((node, pos) => {
          if (node.type.name !== 'image') return true
          const src = byId.get(node.attrs.imageId)
          if (!src || src === node.attrs.src) return true
          transaction = transaction.setNodeAttribute(pos, 'src', src)
          changed = true
          return true
        })
        if (!changed) return false
        transaction.setMeta('addToHistory', false)
        editor.view.dispatch(transaction)
        return true
      },
      undo: () => editor?.commands.undo() ?? false,
      redo: () => editor?.commands.redo() ?? false,
      getScrollAreaElement: () => scrollAreaRef.current,
      getEditorRootElement: () => editor?.view.dom ?? null,
    }),
  )

  // 首次挂载触发一次回调，保证预览不为空
  useEffect(() => {
    if (editor) {
      onUpdate?.(editor.getHTML())
      reportEditorState(editor)
    }
  }, [editor, onUpdate, reportEditorState])

  // Dev 模式把 editor 挂到 window，方便控制台/E2E 测试调用 setContent 等命令
  useEffect(() => {
    if (import.meta.env.DEV && editor) {
      ;(window as unknown as { __editor: Editor }).__editor = editor
    }
  }, [editor])

  // H1 字号/字体/宽度之后可能被调大或调窄。若已有 nowrap 不再放得下，
  // 自动撤销该 mark，保留文字并恢复正常换行，绝不让内容被页面裁掉。
  useEffect(() => {
    noWrapH1LayoutRef.current = noWrapH1Layout
    if (editor) {
      removeUnsafeNoWrapMarks(editor, noWrapH1Layout)
    }
  }, [editor, noWrapH1Layout])

  return (
    <div className="editor-workspace">
      <div className="editor-panel-heading">
        <div>
          <strong>正文编辑</strong>
          <span>标题作用于整段；Enter 分段，Shift+Enter 只换行</span>
        </div>
      </div>
      <EditorToolbar
        editor={editor}
        onInsertImageClick={onInsertImageClick}
        noWrapH1Layout={noWrapH1Layout}
      />
      <div className="editor-scroll-area" ref={scrollAreaRef}>
        <EditorContent editor={editor} className="tiptap-editor" />
      </div>
    </div>
  )
})

interface EditorToolbarButtonProps {
  label: string
  onClick: () => void
  icon?: ReactNode
  active?: boolean
  disabled?: boolean
  ariaDisabled?: boolean
  ariaLabel?: string
  describedBy?: string
  title?: string
  compact?: boolean
}

// 保持在 EditorToolbar 组件外，避免每次 selection/render 都创建新组件类型。
function Btn({
  label,
  onClick,
  icon,
  active,
  disabled,
  ariaDisabled = false,
  ariaLabel,
  describedBy,
  title,
  compact = false,
}: EditorToolbarButtonProps) {
  return (
    <button
      type="button"
      onPointerDown={(event) => event.preventDefault()}
      onClick={() => {
        if (!ariaDisabled) onClick()
      }}
      disabled={disabled}
      title={title ?? label}
      aria-pressed={active ?? undefined}
      aria-disabled={ariaDisabled || undefined}
      aria-label={ariaLabel ?? (compact ? label : undefined)}
      aria-describedby={describedBy}
      className={`editor-toolbar-button${active ? ' is-active' : ''}${
        compact ? ' is-compact' : ''
      }`}
    >
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      <span className={compact ? 'sr-only' : undefined}>{label}</span>
    </button>
  )
}

function EditorToolbar({
  editor,
  onInsertImageClick,
  noWrapH1Layout,
}: {
  editor: Editor | null
  onInsertImageClick?: () => void
  noWrapH1Layout?: NoWrapH1Layout
}) {
  // Tiptap v3 默认不要求 useEditor 每个 transaction 重渲染 React。工具栏
  // 需要跟随 selection/mark 更新，否则「短语不拆」会一直停在初始禁用态。
  useEditorState({
    editor,
    selector: ({ transactionNumber }) => transactionNumber,
  })
  const noWrapHintId = useId()
  if (!editor) return null
  const activeEditor = editor
  const { from, to, empty } = editor.state.selection
  const selectedPhrase = empty ? '' : editor.state.doc.textBetween(from, to, '\n')
  const noWrapActive = editor.isActive('noWrapPhrase')
  const prospectivePhrase = noWrapActive
    ? selectedPhrase
    : getProspectiveNoWrapPhrase(editor, selectedPhrase)
  const phraseFitsH1 = doesSelectionFitCanvasH1(
    editor,
    prospectivePhrase,
    noWrapH1Layout,
  )
  const phraseWithinLimit = canKeepPhraseTogether(prospectivePhrase)
  const canToggleNoWrap =
    !empty &&
    (noWrapActive || (phraseWithinLimit && phraseFitsH1))
  const phraseLength = Array.from(prospectivePhrase.trim()).length
  const noWrapHint = empty
    ? `短语不拆：请先选中 1–${NO_WRAP_PHRASE_MAX_LENGTH} 个字符`
    : noWrapActive
      ? '短语不拆：已启用，再次点击可解除'
      : /[\r\n]/.test(prospectivePhrase)
        ? '短语不拆：选区不能跨段或换行'
        : phraseLength === 0 || phraseLength > NO_WRAP_PHRASE_MAX_LENGTH
          ? `短语不拆：请选择 1–${NO_WRAP_PHRASE_MAX_LENGTH} 个字符`
          : !phraseFitsH1
            ? '短语不拆：当前一级标题宽度不足'
            : '短语不拆：当前选区可以保持在同一行'
  const blockType = editor.isActive('heading', { level: 1 })
    ? 'h1'
    : editor.isActive('heading', { level: 2 })
      ? 'h2'
      : editor.isActive('heading', { level: 3 })
        ? 'h3'
        : editor.isActive('codeBlock')
          ? 'code'
          : 'paragraph'

  function setBlockType(value: string) {
    applyBlockType(activeEditor, value as EditorBlockType)
  }

  function toggleNoWrapPhrase() {
    const selection = activeEditor.state.selection
    if (selection.empty) return
    const text = activeEditor.state.doc.textBetween(
      selection.from,
      selection.to,
      '\n',
    )
    if (!activeEditor.isActive('noWrapPhrase')) {
      const mergedText = getProspectiveNoWrapPhrase(activeEditor, text)
      if (
        !canKeepPhraseTogether(mergedText) ||
        !doesSelectionFitCanvasH1(activeEditor, mergedText, noWrapH1Layout)
      ) {
        return
      }
    }
    activeEditor.chain().focus().toggleMark('noWrapPhrase').run()
  }

  return (
    <div className="editor-toolbar" role="group" aria-label="正文排版工具">
      <div className="editor-toolbar-frame">
        <div
          className="editor-toolbar-row editor-toolbar-format"
          role="group"
          aria-label="文字格式"
        >
          <Select value={blockType} onValueChange={setBlockType}>
            <SelectTrigger className="editor-block-select" aria-label="段落样式">
              <SelectValue>
                {blockType === 'paragraph' ? '正文' : blockType.toUpperCase()}
              </SelectValue>
            </SelectTrigger>
            <SelectContent
              onCloseAutoFocus={(event) => {
                event.preventDefault()
                queueMicrotask(() => activeEditor.commands.focus())
              }}
            >
              <SelectGroup>
                <SelectItem value="h1">H1 · 一级标题</SelectItem>
                <SelectItem value="h2">H2 · 二级标题</SelectItem>
                <SelectItem value="h3">H3 · 三级标题</SelectItem>
                <SelectItem value="paragraph">正文</SelectItem>
                <SelectItem value="code">代码块</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <span className="editor-toolbar-divider" aria-hidden="true" />
          <Btn
            label="代码块"
            compact
            icon={<Code2 />}
            active={editor.isActive('codeBlock')}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          />
          <Btn
            label="加粗"
            compact
            icon={<Bold />}
            active={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
          />
          <Btn
            label="斜体"
            compact
            icon={<Italic />}
            active={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          />
          <Btn
            label="下划线"
            compact
            icon={<Underline />}
            active={editor.isActive('underline')}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          />
          <span className="editor-toolbar-divider" aria-hidden="true" />
          <Btn
            label="无序列表"
            compact
            icon={<List />}
            active={editor.isActive('bulletList')}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          />
          <Btn
            label="有序列表"
            compact
            icon={<ListOrdered />}
            active={editor.isActive('orderedList')}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          />
          <Btn
            label="引用"
            compact
            icon={<Quote />}
            active={editor.isActive('blockquote')}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          />
        </div>
        <div
          className="editor-toolbar-row editor-toolbar-structure"
          role="group"
          aria-label="结构插入"
        >
          <Btn
            label="分隔线"
            ariaLabel="插入分隔线"
            icon={<Minus />}
            onClick={() =>
              editor.chain().focus().insertContent({ type: 'divider' }).run()
            }
          />
          <Btn
            label="分页"
            ariaLabel="插入分页"
            icon={<PanelTopOpen />}
            onClick={() => insertRootPageBreak(editor)}
          />
          <Btn
            label="图片"
            ariaLabel="插入图片"
            icon={<ImagePlus />}
            ariaDisabled={!onInsertImageClick}
            onClick={() => onInsertImageClick?.()}
          />
          <Btn
            label="短语不拆"
            icon={<WrapText />}
            active={noWrapActive}
            ariaDisabled={!canToggleNoWrap}
            describedBy={noWrapHintId}
            onClick={toggleNoWrapPhrase}
          />
        </div>
      </div>
      <div id={noWrapHintId} className="editor-toolbar-hint">
        {noWrapHint}
      </div>
    </div>
  )
}

let phraseMeasureCanvas: HTMLCanvasElement | null = null

function getProspectiveNoWrapPhrase(editor: Editor, selectedText: string): string {
  const { from, to, $from, $to } = editor.state.selection
  if (!$from.sameParent($to)) return selectedText
  const mark = editor.schema.marks.noWrapPhrase
  if (!mark) return selectedText

  let mergedFrom = from
  let mergedTo = to
  const parentStart = $from.start()
  const parentEnd = $from.end()
  while (
    mergedFrom > parentStart &&
    editor.state.doc.rangeHasMark(mergedFrom - 1, mergedFrom, mark)
  ) {
    mergedFrom -= 1
  }
  while (
    mergedTo < parentEnd &&
    editor.state.doc.rangeHasMark(mergedTo, mergedTo + 1, mark)
  ) {
    mergedTo += 1
  }
  return editor.state.doc.textBetween(mergedFrom, mergedTo, '\n')
}

function doesSelectionFitCanvasH1(
  editor: Editor,
  text: string,
  layout?: NoWrapH1Layout,
): boolean {
  const { $from, $to } = editor.state.selection
  const inH1 =
    $from.sameParent($to) &&
    $from.parent.type.name === 'heading' &&
    $from.parent.attrs.level === 1
  if (!inH1) return true
  if (!layout) return false

  return doesPhraseFitCanvasH1(text, layout)
}

function doesPhraseFitCanvasH1(text: string, layout: NoWrapH1Layout): boolean {
  phraseMeasureCanvas ??= document.createElement('canvas')
  const context = phraseMeasureCanvas.getContext('2d')
  if (!context) return false
  context.font = `${layout.fontWeight} ${layout.fontSizePx}px ${layout.fontFamily}`
  const glyphCount = Array.from(text.trim()).length
  // 画布 H1 的 letter-spacing 是 -0.5px；测量时保持同一规则。
  const measuredWidth =
    context.measureText(text.trim()).width - Math.max(0, glyphCount - 1) * 0.5
  return measuredWidth <= layout.maxWidthPx
}

function removeUnsafeNoWrapMarks(
  editor: Editor,
  layout?: NoWrapH1Layout,
): void {
  const mark = editor.schema.marks.noWrapPhrase
  if (!mark) return
  const removals: Array<{ from: number; to: number }> = []

  editor.state.doc.descendants((node, position) => {
    if (!node.isTextblock) return true
    const isH1 = node.type.name === 'heading' && node.attrs.level === 1

    let segmentStart: number | null = null
    let segmentEnd = 0
    let segmentText = ''
    const flush = () => {
      const invalidLength = !canKeepPhraseTogether(segmentText)
      const invalidH1Width =
        isH1 && (!layout || !doesPhraseFitCanvasH1(segmentText, layout))
      if (segmentStart !== null && (invalidLength || invalidH1Width)) {
        removals.push({ from: segmentStart, to: segmentEnd })
      }
      segmentStart = null
      segmentEnd = 0
      segmentText = ''
    }

    node.descendants((child, childPosition) => {
      if (!child.isText) {
        flush()
        return true
      }
      const hasNoWrap = child.marks.some((item) => item.type === mark)
      if (!hasNoWrap) {
        flush()
        return false
      }
      const absoluteStart = position + 1 + childPosition
      segmentStart ??= absoluteStart
      segmentEnd = absoluteStart + child.nodeSize
      segmentText += child.text ?? ''
      return false
    })
    flush()
    return false
  })

  if (removals.length === 0) return
  const transaction = editor.state.tr
  for (const { from, to } of removals) {
    transaction.removeMark(from, to, mark)
  }
  // 自动可靠性修正不是用户操作，不能被一次“撤销”重新带回来。
  transaction.setMeta('addToHistory', false)
  editor.view.dispatch(transaction)
}
