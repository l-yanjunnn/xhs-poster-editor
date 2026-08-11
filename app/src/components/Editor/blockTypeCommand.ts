import type { Editor } from '@tiptap/react'
import { Selection, TextSelection } from '@tiptap/pm/state'

export type EditorBlockType = 'h1' | 'h2' | 'h3' | 'paragraph' | 'code'

type NormalizedBlockSelection =
  | { kind: 'unchanged' }
  | { kind: 'invalid' }
  | { kind: 'selection'; selection: TextSelection }

function normalizedBlockSelection(editor: Editor): NormalizedBlockSelection {
  const selection = editor.state.selection
  if (!(selection instanceof TextSelection) || selection.empty) {
    return { kind: 'unchanged' }
  }

  let from = selection.from
  let to = selection.to
  const { $from, $to } = selection

  // 鼠标选区常把下一段的起点表示为“上一段末尾”。
  // 该空边界没有选中上一段文字，不应将它一起改成标题。
  if (
    $from.parent.isTextblock &&
    $from.parentOffset === $from.parent.content.size
  ) {
    const next = Selection.findFrom(
      editor.state.doc.resolve($from.after()),
      1,
      true,
    )
    if (next) from = next.from
  }

  // 对称排除只落在下一段开头、却没有选中其文字的终点。
  if ($to.parent.isTextblock && $to.parentOffset === 0) {
    const previous = Selection.findFrom(
      editor.state.doc.resolve($to.before()),
      -1,
      true,
    )
    if (previous) to = previous.to
  }

  if (from >= to) return { kind: 'invalid' }
  if (from === selection.from && to === selection.to) {
    return { kind: 'unchanged' }
  }
  const forward = selection.anchor <= selection.head
  return {
    kind: 'selection',
    selection: TextSelection.create(
      editor.state.doc,
      forward ? from : to,
      forward ? to : from,
    ),
  }
}

/** 对文字块应用段落/标题样式，并排除相邻段落的空选区边界。 */
export function applyBlockType(
  editor: Editor,
  blockType: EditorBlockType,
): boolean {
  return runBlockTypeCommand(editor, blockType, false)
}

/** 保留 Tiptap 原生标题快捷键的“再按一次恢复正文”语义。 */
export function toggleBlockType(
  editor: Editor,
  blockType: Extract<EditorBlockType, 'h1' | 'h2' | 'h3'>,
): boolean {
  return runBlockTypeCommand(editor, blockType, true)
}

function runBlockTypeCommand(
  editor: Editor,
  blockType: EditorBlockType,
  toggleHeading: boolean,
): boolean {
  const normalized = normalizedBlockSelection(editor)
  if (normalized.kind === 'invalid') return false

  const chain = editor.chain().focus()
  if (normalized.kind === 'selection') {
    const { selection } = normalized
    chain.setTextSelection({
      from: selection.anchor,
      to: selection.head,
    })
  }

  if (blockType === 'h1') {
    return (toggleHeading
      ? chain.toggleHeading({ level: 1 })
      : chain.setHeading({ level: 1 })
    ).run()
  }
  if (blockType === 'h2') {
    return (toggleHeading
      ? chain.toggleHeading({ level: 2 })
      : chain.setHeading({ level: 2 })
    ).run()
  }
  if (blockType === 'h3') {
    return (toggleHeading
      ? chain.toggleHeading({ level: 3 })
      : chain.setHeading({ level: 3 })
    ).run()
  }
  if (blockType === 'code') return chain.setCodeBlock().run()
  return chain.setParagraph().run()
}
