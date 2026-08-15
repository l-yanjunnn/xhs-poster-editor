import type { Editor } from '@tiptap/react'
import {
  DOMParser as ProseMirrorDOMParser,
  Fragment,
  Slice,
  type Node as ProseMirrorNode,
} from '@tiptap/pm/model'
import { closeHistory } from '@tiptap/pm/history'
import {
  NodeSelection,
  Selection,
  TextSelection,
  type Transaction,
} from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { normalizePageBreakHtml } from '@/lib/pageBreak'
import { normalizeChineseBoldBoundaryWhitespaceHtml } from '@/lib/textReliability'
import { stripPastedImageIds } from './contentNormalization'
import {
  hasContinuationSplitCandidate,
  isRootContinuationParagraphPosition,
} from './pageBreakContinuation'

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
  const directParagraphContinuation =
    selection.empty &&
    isRootContinuationParagraphPosition($from) &&
    $from.parentOffset > 0 &&
    $from.parentOffset < $from.parent.content.size
  const continuation =
    directParagraphContinuation || hasContinuationSplitCandidate(editor.state)
  const pageBreakNode = pageBreak.create({ continuation })
  const transaction = editor.state.tr
  if (selection instanceof NodeSelection) {
    transaction.insert(selection.to, pageBreakNode)
    placeSelectionAfterBreak(transaction, selection.to + 1)
  } else {
    transaction.replaceSelectionWith(pageBreakNode)
    if (transaction.selection instanceof TextSelection) {
      const forward = Selection.findFrom(
        transaction.doc.resolve(transaction.selection.from),
        1,
        true,
      )
      if (forward) transaction.setSelection(forward)
    } else {
      placeSelectionAfterBreak(transaction, transaction.selection.to)
    }
  }
  editor.view.dispatch(closeHistory(transaction).scrollIntoView())
  return true
}

function fragmentNodes(fragment: Fragment): ProseMirrorNode[] {
  return Array.from({ length: fragment.childCount }, (_, index) =>
    fragment.child(index),
  )
}

function selectAfterPastedContent(
  transaction: Transaction,
  end: number,
  lastNode: ProseMirrorNode | undefined,
): void {
  if (lastNode?.type.name === 'horizontalRule') {
    placeSelectionAfterBreak(transaction, end)
    return
  }
  const backward = Selection.findFrom(transaction.doc.resolve(end), -1, true)
  const forward = Selection.findFrom(transaction.doc.resolve(end), 1, true)
  if (backward ?? forward) transaction.setSelection((backward ?? forward)!)
}

/** 含分页的粘贴必须在根边界接管，不能交给默认 fitter 拼入当前 li。 */
function insertRootPasteFragment(view: EditorView, content: Fragment): boolean {
  const { state } = view
  const { selection } = state
  const { $from } = selection
  const insertedNodes = fragmentNodes(content)
  if (insertedNodes.length === 0) return false

  if (
    $from.depth >= 2 &&
    isList($from.node(1)) &&
    $from.node(2).type.name === 'listItem'
  ) {
    const list = $from.node(1)
    const itemIndex = $from.index(1)
    const item = list.child(itemIndex)
    const firstChild = item.firstChild
    const atItemStart =
      selection.empty &&
      Boolean(firstChild?.isTextblock) &&
      $from.parent === firstChild &&
      $from.parentOffset === 0
    const consumeEmptyItem = isEmptyListItem(item)
    const splitBeforeIndex =
      consumeEmptyItem || atItemStart ? itemIndex : itemIndex + 1
    const prefixItems: ProseMirrorNode[] = []
    const suffixItems: ProseMirrorNode[] = []
    for (let index = 0; index < list.childCount; index += 1) {
      if (consumeEmptyItem && index === itemIndex) continue
      const target = index < splitBeforeIndex ? prefixItems : suffixItems
      target.push(list.child(index))
    }
    const prefix = createListSegment(list, prefixItems, 0)
    const suffix = createListSegment(list, suffixItems, prefixItems.length)
    const replacement = [prefix, ...insertedNodes, suffix].filter(
      (node): node is ProseMirrorNode => Boolean(node),
    )
    const from = $from.before(1)
    const transaction = state.tr.replaceWith(
      from,
      from + list.nodeSize,
      Fragment.fromArray(replacement),
    )
    const insertedEnd = from + (prefix?.nodeSize ?? 0) + content.size
    selectAfterPastedContent(
      transaction,
      insertedEnd,
      insertedNodes.at(-1),
    )
    view.dispatch(closeHistory(transaction).scrollIntoView())
    return true
  }

  if ($from.depth >= 1 && $from.node(1).type.name === 'blockquote') {
    const insertAt = $from.after(1)
    const transaction = state.tr.insert(insertAt, content)
    selectAfterPastedContent(
      transaction,
      insertAt + content.size,
      insertedNodes.at(-1),
    )
    view.dispatch(closeHistory(transaction).scrollIntoView())
    return true
  }

  const transaction = state.tr.replaceSelection(new Slice(content, 0, 0))
  view.dispatch(closeHistory(transaction).scrollIntoView())
  return true
}

export function handlePageBreakPaste(
  view: EditorView,
  event: ClipboardEvent,
): boolean {
  const html = event.clipboardData?.getData('text/html') ?? ''
  if (!html) return false
  const probe = document.createElement('div')
  probe.innerHTML = html
  if (!probe.querySelector('hr:not(.divider)')) return false

  const normalizedHtml = normalizePageBreakHtml(
    normalizeChineseBoldBoundaryWhitespaceHtml(html),
  )
  const container = document.createElement('div')
  container.innerHTML = normalizedHtml
  const pastedDocument = ProseMirrorDOMParser.fromSchema(
    view.state.schema,
  ).parse(container)
  const pastedSlice = stripPastedImageIds(
    new Slice(pastedDocument.content, 0, 0),
  )
  event.preventDefault()
  return insertRootPasteFragment(view, pastedSlice.content)
}
