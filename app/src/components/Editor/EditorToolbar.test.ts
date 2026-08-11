import type { Editor } from '@tiptap/react'
import { TextSelection } from '@tiptap/pm/state'
import { act, createElement, createRef, type RefObject } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { splitIntoPages } from '@/lib/splitPages'
import {
  EditorPane,
  type EditorHandle,
  type NoWrapH1Layout,
} from './Editor'

type ReactActGlobal = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
;(globalThis as ReactActGlobal).IS_REACT_ACT_ENVIRONMENT = true

interface MountedEditor {
  host: HTMLDivElement
  root: Root
  handle: RefObject<EditorHandle | null>
  editor: Editor
}

const mounted: MountedEditor[] = []

async function mountEditor(options?: {
  initialContent?: string
  onInsertImageClick?: () => void
  noWrapH1Layout?: NoWrapH1Layout
}): Promise<MountedEditor> {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const handle = createRef<EditorHandle>()
  await act(async () => {
    root.render(createElement(EditorPane, { ref: handle, ...options }))
  })
  const editor = (window as unknown as { __editor: Editor }).__editor
  const result = { host, root, handle, editor }
  mounted.push(result)
  return result
}

afterEach(async () => {
  for (const item of mounted.splice(0)) {
    await act(async () => item.root.unmount())
    item.host.remove()
  }
})

function toolbarButton(host: HTMLElement, name: string): HTMLButtonElement {
  const button = Array.from(host.querySelectorAll('button')).find((candidate) => {
    const accessibleName =
      candidate.getAttribute('aria-label') ?? candidate.textContent?.trim()
    return accessibleName === name
  })
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`找不到工具栏按钮：${name}`)
  }
  return button
}

function setTextSelection(editor: Editor, from: number, to = from): void {
  editor.view.dispatch(
    editor.state.tr.setSelection(TextSelection.create(editor.state.doc, from, to)),
  )
}

describe('two-row editor toolbar', () => {
  it('keeps every tool directly visible with stable groups and toggle semantics', async () => {
    const { host } = await mountEditor({ onInsertImageClick: vi.fn() })
    const toolbar = host.querySelector('[aria-label="正文排版工具"]')
    expect(toolbar).not.toBeNull()
    expect(
      Array.from(toolbar!.querySelectorAll('[role="group"]')).map((group) =>
        group.getAttribute('aria-label'),
      ),
    ).toEqual(['文字格式', '结构插入'])

    const names = Array.from(toolbar!.querySelectorAll('button')).map(
      (button) => button.getAttribute('aria-label') ?? button.textContent?.trim(),
    )
    expect(names).toEqual([
      '段落样式',
      '代码块',
      '加粗',
      '斜体',
      '下划线',
      '无序列表',
      '有序列表',
      '引用',
      '插入分隔线',
      '插入分页',
      '插入图片',
      '短语不拆',
    ])
    expect(host.querySelector('[aria-label="更多结构工具"]')).toBeNull()

    for (const name of [
      '代码块',
      '加粗',
      '斜体',
      '下划线',
      '无序列表',
      '有序列表',
      '引用',
      '短语不拆',
    ]) {
      expect(toolbarButton(host, name).hasAttribute('aria-pressed')).toBe(true)
    }
    for (const name of ['插入分隔线', '插入分页', '插入图片']) {
      expect(toolbarButton(host, name).hasAttribute('aria-pressed')).toBe(false)
    }
  })

  it('keeps the unavailable no-wrap action focusable and explains the reason', async () => {
    const { host, handle } = await mountEditor({ initialContent: '<p>正文</p>' })
    const button = toolbarButton(host, '短语不拆')
    const before = handle.current?.getJSON()

    expect(button.disabled).toBe(false)
    expect(button.getAttribute('aria-disabled')).toBe('true')
    const hintId = button.getAttribute('aria-describedby')
    expect(hintId).toBeTruthy()
    expect(document.getElementById(hintId!)?.textContent).toContain('请先选中 1–12 个字符')
    button.focus()
    expect(document.activeElement).toBe(button)
    await act(async () => button.click())
    expect(handle.current?.getJSON()).toEqual(before)
  })

  it('exposes valid, overlong and H1-width states without moving the control', async () => {
    const layout: NoWrapH1Layout = {
      fontFamily: 'sans-serif',
      fontSizePx: 90,
      fontWeight: 700,
      maxWidthPx: 1,
    }
    const { host, editor, handle } = await mountEditor({
      initialContent: '<p>十二字内</p>',
      noWrapH1Layout: layout,
    })
    const button = toolbarButton(host, '短语不拆')

    await act(async () => setTextSelection(editor, 1, 5))
    expect(button.getAttribute('aria-disabled')).toBeNull()
    await act(async () => button.click())
    expect(editor.isActive('noWrapPhrase')).toBe(true)
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(document.getElementById(button.getAttribute('aria-describedby')!)?.textContent).toContain('再次点击可解除')
    await act(async () => button.click())
    expect(editor.isActive('noWrapPhrase')).toBe(false)

    await act(async () => {
      handle.current?.setContent('<p>一二三四五六七八九十十一十二十三</p>', {
        resetHistory: true,
      })
    })
    await act(async () => setTextSelection(editor, 1, 15))
    expect(button.getAttribute('aria-disabled')).toBe('true')
    expect(document.getElementById(button.getAttribute('aria-describedby')!)?.textContent).toContain('请选择 1–12 个字符')

    await act(async () => {
      handle.current?.setContent('<h1>一级标题</h1>', { resetHistory: true })
    })
    await act(async () => setTextSelection(editor, 1, 5))
    expect(button.getAttribute('aria-disabled')).toBe('true')
    expect(document.getElementById(button.getAttribute('aria-describedby')!)?.textContent).toContain('一级标题宽度不足')
  })

  it('wires direct divider, page-break, code and image actions to production behavior', async () => {
    const onInsertImageClick = vi.fn()
    const { host, editor, handle } = await mountEditor({
      initialContent: '<p>开始</p>',
      onInsertImageClick,
    })

    await act(async () => toolbarButton(host, '插入分隔线').click())
    expect(rootTypes(editor)).toContain('divider')
    expect(splitIntoPages(editor.getHTML())).toHaveLength(1)

    await act(async () => {
      handle.current?.setContent(
        '<ul><li><p>第一项</p></li><li><p>第二项</p></li><li><p>第三项</p></li></ul>',
        { resetHistory: true },
      )
    })
    let secondPos = -1
    editor.state.doc.descendants((node, pos) => {
      if (secondPos < 0 && node.isText && node.text?.includes('第二项')) {
        secondPos = pos + 1
        return false
      }
      return true
    })
    await act(async () => setTextSelection(editor, secondPos))
    await act(async () => toolbarButton(host, '插入分页').click())
    expect(splitIntoPages(editor.getHTML())).toHaveLength(2)
    expect(rootTypes(editor)).toEqual([
      'bulletList',
      'horizontalRule',
      'bulletList',
      'paragraph',
    ])

    await act(async () => {
      handle.current?.setContent('<p>代码内容</p>', { resetHistory: true })
    })
    await act(async () => setTextSelection(editor, 2))
    await act(async () => toolbarButton(host, '代码块').click())
    expect(editor.isActive('codeBlock')).toBe(true)
    expect(toolbarButton(host, '代码块').getAttribute('aria-pressed')).toBe('true')

    await act(async () => toolbarButton(host, '插入图片').click())
    expect(onInsertImageClick).toHaveBeenCalledTimes(1)
  })
})

function rootTypes(editor: Editor): string[] {
  return editor.getJSON().content?.map((node) => node.type) ?? []
}
