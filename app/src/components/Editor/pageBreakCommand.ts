import type { Editor } from '@tiptap/react'
import { Fragment, type Node as ProseMirrorNode } from '@tiptap/pm/model'
import { closeHistory } from '@tiptap/pm/history'
import {
  NodeSelection,
  Selection,
  TextSelection,
  type Transaction,
} from '@tiptap/pm/state'

function isList(node: ProseMirrorNode): boolean {
  return node.type.name === 'bulletList' || node.type.name === 'orderedList'
}

function isEmptyListItem(node: ProseMirrorNode): boolean {
  if (node.textContent.trim()) return false
  let hasVisibleAtom = false
  node.descendants((child) => {
    if (
      child.type.name === 'image' ||
      child.type.name === 'divider' ||
      child.type.name === 'hardBreak'
    ) {
      hasVisibleAtom = true
      return false
    }
    return true
  })
  return !hasVisibleAtom
}

function createListSegment(
  list: ProseMirrorNode,
  items: ProseMirrorNode[],
  startOffset: number,
): ProseMirrorNode | null {
  if (items.length === 0) return null
  const attrs = { ...list.attrs }
  if (list.type.name === 'orderedList') {
    const originalStart =
      typeof list.attrs.start === 'number' ? list.attrs.start : 1
    attrs.start = originalStart + startOffset
  }
  return list.type.create(attrs, Fragment.fromArray(items), list.marks)
}

function placeSelectionAfterBreak(
  transaction: Transaction,
  afterBreak: number,
): void {
  const paragraph = transaction.doc.type.schema.nodes.paragraph
  const $after = transaction.doc.resolve(afterBreak)
  const crossesAnotherBreak = $after.nodeAfter?.type.name === 'horizontalRule'
  const forward = crossesAnotherBreak
    ? null
    : Selection.findFrom($after, 1, true)

  if (forward) {
    transaction.setSelection(forward)
    return
  }
  if (!paragraph) {
    transaction.setSelection(Selection.near($after, 1))
    return
  }
  transaction.insert(afterBreak, paragraph.create())
  transaction.setSelection(TextSelection.create(transaction.doc, afterBreak + 1))
}

function insertAfterRootBlock(editor: Editor, rootDepth: number): boolean {
  const { state, view } = editor
  const pageBreak = state.schema.nodes.horizontalRule
  if (!pageBreak) return false

  const insertAt = state.selection.$from.after(rootDepth)
  const transaction = state.tr.insert(insertAt, pageBreak.create())
  placeSelectionAfterBreak(transaction, insertAt + 1)
  view.dispatch(closeHistory(transaction).scrollIntoView())
  return true
}

function insertAroundRootList(editor: Editor): boolean {
  const { state, view } = editor
  const { selection } = state
  const { $from } = selection
  if ($from.depth < 2) return false

  const list = $from.node(1)
  if (!isList(list)) return false
  const itemIndex = $from.index(1)
  if (itemIndex < 0 || itemIndex >= list.childCount) return false
  const item = list.child(itemIndex)
  if (item.type.name !== 'listItem') return false

  const firstChild = item.firstChild
  const atItemStart =
    selection.empty &&
    Boolean(firstChild?.isTextblock) &&
    $from.parent === firstChild &&
    $from.parentOffset === 0
  const consumeEmptyItem = isEmptyListItem(item)
  const splitBeforeIndex = consumeEmptyItem || atItemStart
    ? itemIndex
    : itemIndex + 1

  const prefixItems: ProseMirrorNode[] = []
  const suffixItems: ProseMirrorNode[] = []
  for (let index = 0; index < list.childCount; index += 1) {
    if (consumeEmptyItem && index === itemIndex) continue
    const target = index < splitBeforeIndex ? prefixItems : suffixItems
    target.push(list.child(index))
  }

  const prefix = createListSegment(list, prefixItems, 0)
  const suffix = createListSegment(list, suffixItems, prefixItems.length)
  const pageBreak = state.schema.nodes.horizontalRule
  if (!pageBreak) return false
  const replacement = [prefix, pageBreak.create(), suffix].filter(
    (node): node is ProseMirrorNode => Boolean(node),
  )
  const from = $from.before(1)
  const to = from + list.nodeSize
  const transaction = state.tr.replaceWith(
    from,
    to,
    Fragment.fromArray(replacement),
  )
  const prefixSize = prefix?.nodeSize ?? 0
  const afterBreak = from + prefixSize + 1
  placeSelectionAfterBreak(transaction, afterBreak)
  view.dispatch(closeHistory(transaction).scrollIntoView())
  return true
}

/**
 * 插入只允许位于 doc 根部的分页。列表按当前最外层列表项的安全边界拆段，
 * blockquote 整块留在前页；普通段落/标题/codeBlock 仍按光标位置切分。
 */
export function insertRootPageBreak(editor: Editor): boolean {
  if (editor.isDestroyed) return false
  editor.view.focus()
  const { selection } = editor.state
  const { $from } = selection

  if (
    $from.depth >= 2 &&
    isList($from.node(1)) &&
    $from.node(2).type.name === 'listItem'
  ) {
    return insertAroundRootList(editor)
  }

  if ($from.depth >= 1 && $from.node(1).type.name === 'blockquote') {
    return insertAfterRootBlock(editor, 1)
  }

  const pageBreak = editor.state.schema.nodes.horizontalRule
  if (!pageBreak) return false
  const transaction = editor.state.tr
  if (selection instanceof NodeSelection) {
    transaction.insert(selection.to, pageBreak.create())
    placeSelectionAfterBreak(transaction, selection.to + 1)
  } else {
    transaction.replaceSelectionWith(pageBreak.create())
    const forward = Selection.findFrom(
      transaction.doc.resolve(transaction.selection.from),
      1,
      true,
    )
    if (forward) transaction.setSelection(forward)
  }
  editor.view.dispatch(closeHistory(transaction).scrollIntoView())
  return true
}
