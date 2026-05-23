import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { forwardRef, useEffect, useImperativeHandle } from 'react'
import '@/styles/editor.css'

// 暴露给 App 的命令式 API：apply 主题时需要外部 setContent，保存主题时需要 getJSON
export interface EditorHandle {
  setContent: (content: object | string) => void
  getJSON: () => object | null
}

interface Props {
  onUpdate?: (html: string) => void
  initialContent?: string
}

const DEFAULT_CONTENT = `
<h1>小红书风格长图</h1>
<p>这是一段正文示例。左边是 Tiptap 编辑器，右边是 9:16 画布预览。</p>
<h2>二级标题</h2>
<p>切换顶部主题、字号、间距、字体，右边画布会实时更新。</p>
<hr class="page-break">
<h1>第二页</h1>
<p>点击工具栏的「↓ 插入分页 ↓」按钮即可在当前位置切出新一页。</p>
<h3>三级标题</h3>
<blockquote>引用块的样式来自 editor.html 的同名 token。</blockquote>
<ul>
  <li>列表项 1</li>
  <li>列表项 2</li>
</ul>
`

export const EditorPane = forwardRef<EditorHandle, Props>(function EditorPane(
  { onUpdate, initialContent },
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
    ],
    content: initialContent ?? DEFAULT_CONTENT,
    onUpdate: ({ editor }) => onUpdate?.(editor.getHTML()),
  })

  useImperativeHandle(
    ref,
    () => ({
      setContent: (c) => {
        editor?.commands.setContent(c as never)
      },
      getJSON: () => editor?.getJSON() ?? null,
    }),
    [editor],
  )

  // 首次挂载触发一次回调，保证预览不为空
  useEffect(() => {
    if (editor) onUpdate?.(editor.getHTML())
  }, [editor, onUpdate])

  return (
    <div className="flex h-full flex-col bg-[#fafaf8]">
      <EditorToolbar editor={editor} />
      <div className="flex-1 overflow-y-auto px-10 py-8">
        <EditorContent editor={editor} className="tiptap-editor" />
      </div>
    </div>
  )
})

function EditorToolbar({ editor }: { editor: Editor | null }) {
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
        label="↓ 插入分页 ↓"
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
      />
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
