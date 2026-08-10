import {
  useEditor,
  useEditorState,
  EditorContent,
  Node,
  type Editor,
} from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { NoWrapPhrase } from './NoWrapPhrase'
import {
  canKeepPhraseTogether,
  normalizeChineseBoldBoundaryWhitespaceHtml,
  normalizeEditorContent,
  NO_WRAP_PHRASE_MAX_LENGTH,
} from '@/lib/textReliability'
import '@/styles/editor.css'

// 分隔线：渲染成 <hr class="divider">，与 horizontalRule（分页符，class="page-break"）区分。
// Why 单独建节点而不是给 hr 加 attribute：splitPages 按 hr.page-break 切页，
// 让分隔线走另一个节点类型最干净，schema 上不会冲突。
// parseHTML priority=1000 让 hr.divider 优先匹配 Divider 而不是默认的 horizontalRule
const Divider = Node.create({
  name: 'divider',
  group: 'block',
  parseHTML() {
    return [{ tag: 'hr.divider', priority: 1000 }]
  },
  renderHTML() {
    return ['hr', { class: 'divider' }]
  },
})

// 扩展 Image，加 width attribute 走 inline style（百分比，画布按宽度自适应）
// 默认 null = 原大小（CSS max-width:100% 兜底，不会溢出）
const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        renderHTML: (attrs) => {
          if (!attrs.width) return {}
          return { style: `width: ${attrs.width}` }
        },
        parseHTML: (element) =>
          (element as HTMLElement).style.width || null,
      },
      // Why: 素材库图片的 src 是 session-bound blob URL，主题「包含正文」序列化后
      // 刷新即失效。存 assetId，applyTheme 时按 id 从 IndexedDB 重新 resolve src
      //（与背景/Logo 的「只存 assetId」设计对齐）
      assetId: {
        default: null,
        renderHTML: (attrs) =>
          attrs.assetId ? { 'data-asset-id': attrs.assetId } : {},
        parseHTML: (element) =>
          (element as HTMLElement).getAttribute('data-asset-id'),
      },
    }
  },
})

// 上抛给 App 的图片状态，Toolbar 拿来渲染下拉
export interface ImageState {
  active: boolean
  width: string | null
}

export interface NoWrapH1Layout {
  fontFamily: string
  fontSizePx: number
  fontWeight: number
  maxWidthPx: number
}

// 暴露给 App 的命令式 API：apply 主题时需要外部 setContent，保存主题时需要 getJSON；
// 插入图片需要让 App 持有的素材库回调能把 src 喂回编辑器；
// setImageWidth 给顶部 Toolbar 的「图片宽度」下拉用
export interface EditorHandle {
  setContent: (content: object | string) => void
  getJSON: () => object | null
  insertImage: (src: string, assetId?: string) => void
  setImageWidth: (width: string | null) => void
}

interface Props {
  onUpdate?: (html: string) => void
  initialContent?: string
  // 编辑器内点「插入图片」时通知 App 打开素材库到 image tab
  onInsertImageClick?: () => void
  // selection 变化或图片属性变化时上抛，Toolbar 据此显示当前图片宽度
  onImageStateChange?: (state: ImageState) => void
  noWrapH1Layout?: NoWrapH1Layout
}

const DEFAULT_CONTENT = `
<h1>小红书长图排版工具</h1>
<p>使用指南 · 给非技术朋友的开箱即用工具</p>
<hr class="divider">
<p>写文字 → 选样式 → 一键导出 PNG，三步搞定小红书图文长图。</p>
<blockquote>编辑器左侧打字，右侧实时看 9:15（3:5）画布效果。所见即所得，不用懂代码。</blockquote>
<p>五页教程，跟着右滑划完，你就上手了。</p>

<hr class="page-break">

<h1>顶部工具栏</h1>
<p>全局样式控制，决定整篇长图的视觉基调。</p>
<h2>核心选项</h2>
<ul>
  <li><strong>主题</strong>：雅致 / 极简白 / 深夜黑，一键切换整体配色和字体</li>
  <li><strong>字体</strong>：H1/H2/H3/正文 各自独立可选，覆盖思源宋/黑、ZCOOL 等</li>
  <li><strong>字号</strong>：5 档联动，整体放大缩小</li>
  <li><strong>间距</strong>：紧凑 / 标准 / 宽松 / 极宽</li>
  <li><strong>Logo 策略</strong>：每页 / 仅首页 / 首尾 / 不显示</li>
</ul>
<hr class="divider">
<p>右上「主题」按钮可保存当前样式快照，下次直接调用。</p>

<hr class="page-break">

<h1>编辑器排版</h1>
<p>左侧工具栏控制段落级别的排版，光标所在的块会被切换样式。</p>
<h2>支持的块</h2>
<ul>
  <li><strong>H1 / H2 / H3</strong>：三级标题，各有独立字体和字重</li>
  <li><strong>正文 / 引用 / 代码块</strong>：基础文本块</li>
  <li><strong>有序 / 无序列表</strong>：嵌套自如</li>
</ul>
<h3>两种横线</h3>
<p>「— 分隔线 —」插入淡淡虚线装饰；</p>
<p>「↓ 插入分页 ↓」把内容切到下一页。</p>
<p>选中 1–12 个字符后点「短语不拆」，机构名或关键词就不会从中间换行。</p>
<blockquote>分页符在编辑器内显示为蓝色虚线 + 「↓ 分页 ↓」标签，不会出现在导出图里。</blockquote>

<hr class="page-break">

<h1>素材、草稿与裁切</h1>
<p>右上按钮覆盖资源管理、保存与最终产出。</p>
<h3>裁切参考</h3>
<p>查看首图发布后会被中心裁切的 3:4 可见区。上下变暗和橙线只在预览出现，不进入 PNG。</p>
<h3>草稿</h3>
<p>正文、样式、背景和 Logo 自动保存；也可另存、切换或删除草稿。</p>
<h3>素材库 / 主题</h3>
<p>素材库存背景、Logo 和插图；主题只保存可复用样式，不再冒充正文草稿。</p>

<hr class="page-break">

<h3>导出 PNG</h3>
<ul>
  <li>单页 → 直接下载 PNG，多页 → 自动打 zip</li>
  <li>文件名默认取首个 H1，同名再次导出自动加 -2 / -3 序号</li>
</ul>
<blockquote>导出尺寸 2160 × 3600，真实 9:15（3:5），scale 2 高清。</blockquote>
<p>开始写你自己的内容吧 ✦</p>
`

export const EditorPane = forwardRef<EditorHandle, Props>(function EditorPane(
  {
    onUpdate,
    initialContent,
    onInsertImageClick,
    onImageStateChange,
    noWrapH1Layout,
  },
  ref,
) {
  const noWrapH1LayoutRef = useRef(noWrapH1Layout)

  const editor = useEditor({
    extensions: [
      // 所有 hr 都视为分页符：注入 class="page-break"
      // 画布层（splitIntoPages）按 hr.page-break 切割成多页
      // Underline 不用单独注册：Tiptap v3 StarterKit 已内置（重复注册会告警且互相覆盖）
      StarterKit.configure({
        horizontalRule: { HTMLAttributes: { class: 'page-break' } },
      }),
      Divider,
      NoWrapPhrase,
      // inline=false 让图片成为 block 节点，方便和段落/标题对齐流式排版
      ResizableImage.configure({ inline: false, allowBase64: true }),
    ],
    content: normalizeEditorContent(initialContent ?? DEFAULT_CONTENT),
    editorProps: {
      // 富文本粘贴是异常空格的主要来源。只清理可判定的中文粗体边界，
      // 不对纯文本、英文、URL 或 code/pre 做激进重写。
      transformPastedHTML: normalizeChineseBoldBoundaryWhitespaceHtml,
    },
    onUpdate: ({ editor }) => {
      onUpdate?.(editor.getHTML())
      // 改属性（如调宽度）也走 onUpdate，需同步上抛
      reportImageState(editor)
    },
    onSelectionUpdate: ({ editor }) => reportImageState(editor),
    onTransaction: ({ editor }) => {
      // undo、setContent、草稿恢复或外部 HTML 都可能绕过工具栏校验。
      // 每次文档 transaction 后都重新建立 nowrap 不变量。
      queueMicrotask(() => {
        if (!editor.isDestroyed) {
          removeUnsafeNoWrapMarks(editor, noWrapH1LayoutRef.current)
        }
      })
    },
  })

  function reportImageState(ed: Editor) {
    onImageStateChange?.({
      active: ed.isActive('image'),
      width: (ed.getAttributes('image').width as string | null) || null,
    })
  }

  useImperativeHandle(
    ref,
    () => ({
      setContent: (c) => {
        editor?.commands.setContent(normalizeEditorContent(c) as never)
      },
      getJSON: () => editor?.getJSON() ?? null,
      insertImage: (src, assetId) => {
        // setImage 的类型签名不含自定义 attrs，走 insertContent 直接给节点 JSON
        editor
          ?.chain()
          .focus()
          .insertContent({ type: 'image', attrs: { src, assetId: assetId ?? null } })
          .run()
      },
      setImageWidth: (width) => {
        editor?.chain().focus().updateAttributes('image', { width }).run()
      },
    }),
    [editor],
  )

  // 首次挂载触发一次回调，保证预览不为空
  useEffect(() => {
    if (editor) onUpdate?.(editor.getHTML())
  }, [editor, onUpdate])

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
    <div className="flex h-full flex-col bg-[#fafaf8]">
      <EditorToolbar
        editor={editor}
        onInsertImageClick={onInsertImageClick}
        noWrapH1Layout={noWrapH1Layout}
      />
      <div className="flex-1 overflow-y-auto px-10 py-8">
        <EditorContent editor={editor} className="tiptap-editor" />
      </div>
    </div>
  )
})

interface EditorToolbarButtonProps {
  label: string
  onClick: () => void
  active?: boolean
  disabled?: boolean
  title?: string
}

// 保持在 EditorToolbar 组件外，避免每次 selection/render 都创建新组件类型。
function Btn({
  label,
  onClick,
  active,
  disabled,
  title,
}: EditorToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={
        'rounded border px-2.5 py-1.5 text-[13px] text-neutral-700 disabled:cursor-not-allowed disabled:opacity-45 ' +
        (active
          ? 'border-blue-500 bg-blue-50'
          : 'border-neutral-300 bg-white hover:border-blue-400 hover:bg-blue-50')
      }
    >
      {label}
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
    <div className="flex flex-shrink-0 flex-wrap gap-1 border-b border-neutral-300 bg-neutral-100 px-4 py-2">
      <Btn
        label="H1"
        active={editor.isActive('heading', { level: 1 })}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 1 }).run()
        }
      />
      <Btn
        label="H2"
        active={editor.isActive('heading', { level: 2 })}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 2 }).run()
        }
      />
      <Btn
        label="H3"
        active={editor.isActive('heading', { level: 3 })}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 3 }).run()
        }
      />
      <Btn
        label="正文"
        active={editor.isActive('paragraph')}
        onClick={() => editor.chain().focus().setParagraph().run()}
      />
      <span className="mx-1 w-px self-stretch bg-neutral-300" />
      <Btn
        label="引用"
        active={editor.isActive('blockquote')}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      />
      <Btn
        label="代码块"
        active={editor.isActive('codeBlock')}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      />
      <Btn
        label="无序列表"
        active={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <Btn
        label="有序列表"
        active={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />
      <Btn
        label="— 分隔线 —"
        onClick={() =>
          editor.chain().focus().insertContent({ type: 'divider' }).run()
        }
      />
      <Btn
        label="↓ 插入分页 ↓"
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
      />
      {onInsertImageClick && (
        <Btn label="🖼 插入图片" onClick={onInsertImageClick} />
      )}
      <span className="mx-1 w-px self-stretch bg-neutral-300" />
      <Btn
        label="加粗"
        active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <Btn
        label="下划线"
        active={editor.isActive('underline')}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      />
      <Btn
        label="短语不拆"
        active={noWrapActive}
        disabled={!canToggleNoWrap}
        title={
          !phraseWithinLimit
            ? `与相邻不拆短语合并后超过 ${NO_WRAP_PHRASE_MAX_LENGTH} 个字符，请缩短选择`
            : phraseFitsH1
            ? `选中 1–${NO_WRAP_PHRASE_MAX_LENGTH} 个字符后使用，避免整段溢出`
            : '当前 H1 宽度容不下这段文字，请缩短关键词或调宽 H1'
        }
        onClick={toggleNoWrapPhrase}
      />
      <Btn label="撤销" onClick={() => editor.chain().focus().undo().run()} />
      <Btn label="重做" onClick={() => editor.chain().focus().redo().run()} />
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
