import { useEditor, EditorContent, Node, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Image from '@tiptap/extension-image'
import { forwardRef, useEffect, useImperativeHandle } from 'react'
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
    }
  },
})

// 上抛给 App 的图片状态，Toolbar 拿来渲染下拉
export interface ImageState {
  active: boolean
  width: string | null
}

// 暴露给 App 的命令式 API：apply 主题时需要外部 setContent，保存主题时需要 getJSON；
// 插入图片需要让 App 持有的素材库回调能把 src 喂回编辑器；
// setImageWidth 给顶部 Toolbar 的「图片宽度」下拉用
export interface EditorHandle {
  setContent: (content: object | string) => void
  getJSON: () => object | null
  insertImage: (src: string) => void
  setImageWidth: (width: string | null) => void
}

interface Props {
  onUpdate?: (html: string) => void
  initialContent?: string
  // 编辑器内点「插入图片」时通知 App 打开素材库到 image tab
  onInsertImageClick?: () => void
  // selection 变化或图片属性变化时上抛，Toolbar 据此显示当前图片宽度
  onImageStateChange?: (state: ImageState) => void
}

const DEFAULT_CONTENT = `
<h1>小红书长图排版工具</h1>
<p>使用指南 · 给非技术朋友的开箱即用工具</p>
<hr class="divider">
<p>写文字 → 选样式 → 一键导出 PNG，三步搞定小红书图文长图。</p>
<blockquote>编辑器左侧打字，右侧实时看 9:16 画布效果。所见即所得，不用懂代码。</blockquote>
<p>四页教程，跟着右滑划完，你就上手了。</p>

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
<blockquote>分页符在编辑器内显示为蓝色虚线 + 「↓ 分页 ↓」标签，不会出现在导出图里。</blockquote>

<hr class="page-break">

<h1>素材与导出</h1>
<p>右上四个蓝/绿按钮，覆盖资源管理和最终产出。</p>
<h3>参考线</h3>
<p>蓝色按钮，开关首图 4:3 安全区辅助线。仅预览显示，导出 PNG 自动剥离。</p>
<h3>素材库</h3>
<p>管理背景图、Logo、插入图片。支持拖拽上传 + IndexedDB 持久化。</p>
<h3>主题库</h3>
<p>保存当前样式快照（可选含正文），跨会话复用。</p>

<hr class="page-break">

<h3>导出 PNG</h3>
<ul>
  <li>单页 → 直接下载 PNG，多页 → 自动打 zip</li>
  <li>文件名默认取首个 H1，同名再次导出自动加 -2 / -3 序号</li>
</ul>
<blockquote>导出尺寸 2160 × 3840，scale 2 高清，发小红书后裁切清晰。</blockquote>
<p>开始写你自己的内容吧 ✦</p>
`

export const EditorPane = forwardRef<EditorHandle, Props>(function EditorPane(
  { onUpdate, initialContent, onInsertImageClick, onImageStateChange },
  ref,
) {
  const editor = useEditor({
    extensions: [
      // 所有 hr 都视为分页符：注入 class="page-break"
      // 画布层（splitIntoPages）按 hr.page-break 切割成多页
      StarterKit.configure({
        horizontalRule: { HTMLAttributes: { class: 'page-break' } },
      }),
      Underline,
      Divider,
      // inline=false 让图片成为 block 节点，方便和段落/标题对齐流式排版
      ResizableImage.configure({ inline: false, allowBase64: true }),
    ],
    content: initialContent ?? DEFAULT_CONTENT,
    onUpdate: ({ editor }) => {
      onUpdate?.(editor.getHTML())
      // 改属性（如调宽度）也走 onUpdate，需同步上抛
      reportImageState(editor)
    },
    onSelectionUpdate: ({ editor }) => reportImageState(editor),
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
        editor?.commands.setContent(c as never)
      },
      getJSON: () => editor?.getJSON() ?? null,
      insertImage: (src) => {
        editor?.chain().focus().setImage({ src }).run()
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

  return (
    <div className="flex h-full flex-col bg-[#fafaf8]">
      <EditorToolbar editor={editor} onInsertImageClick={onInsertImageClick} />
      <div className="flex-1 overflow-y-auto px-10 py-8">
        <EditorContent editor={editor} className="tiptap-editor" />
      </div>
    </div>
  )
})

function EditorToolbar({
  editor,
  onInsertImageClick,
}: {
  editor: Editor | null
  onInsertImageClick?: () => void
}) {
  if (!editor) return null
  const Btn = ({
    label,
    onClick,
    active,
  }: {
    label: string
    onClick: () => void
    active?: boolean
  }) => (
    <button
      type="button"
      onClick={onClick}
      className={
        'rounded border px-2.5 py-1.5 text-[13px] text-neutral-700 ' +
        (active
          ? 'border-blue-500 bg-blue-50'
          : 'border-neutral-300 bg-white hover:border-blue-400 hover:bg-blue-50')
      }
    >
      {label}
    </button>
  )
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
      <Btn label="撤销" onClick={() => editor.chain().focus().undo().run()} />
      <Btn label="重做" onClick={() => editor.chain().focus().redo().run()} />
    </div>
  )
}

