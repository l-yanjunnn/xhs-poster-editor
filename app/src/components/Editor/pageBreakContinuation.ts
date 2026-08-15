import { Extension } from '@tiptap/react'
import type { ResolvedPos } from '@tiptap/pm/model'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import type { EditorState, Transaction } from '@tiptap/pm/state'

interface ContinuationSplitCandidate {
  /** 右侧新段落的根节点起始位置，也是分页应插入的边界。 */
  boundary: number
}

const CREATE_CANDIDATE_META = 'pageBreakContinuationSplit'
const continuationSplitCandidateKey =
  new PluginKey<ContinuationSplitCandidate | null>(
    'pageBreakContinuationSplitCandidate',
  )

/** 与编辑区/画布的“首个 H1 紧邻 P = 封面副标题”语义一致。 */
function isCoverSubtitleParagraph(position: ResolvedPos): boolean {
  const index = position.index(0)
  if (index <= 0) return false
  const root = position.node(0)
  const previous = root.child(index - 1)
  if (
    previous.type.name !== 'heading' ||
    previous.attrs.level !== 1
  ) {
    return false
  }
  for (let cursor = 0; cursor < index - 1; cursor += 1) {
    const sibling = root.child(cursor)
    if (sibling.type.name === 'heading' && sibling.attrs.level === 1) {
      return false
    }
  }
  return true
}

export function isRootContinuationParagraphPosition(
  position: ResolvedPos,
): boolean {
  return (
    position.depth === 1 &&
    position.parent.type.name === 'paragraph' &&
    !isCoverSubtitleParagraph(position)
  )
}

function candidateFromSplitTransaction(
  transaction: Transaction,
  oldState: EditorState,
  newState: EditorState,
): ContinuationSplitCandidate | null {
  if (
    transaction.getMeta(CREATE_CANDIDATE_META) !== true ||
    !transaction.docChanged
  ) {
    return null
  }
  const oldSelection = oldState.selection
  const newSelection = newState.selection
  if (
    !(oldSelection instanceof TextSelection) ||
    !(newSelection instanceof TextSelection) ||
    !oldSelection.empty ||
    !newSelection.empty
  ) {
    return null
  }
  const oldFrom = oldSelection.$from
  if (
    !isRootContinuationParagraphPosition(oldFrom) ||
    oldFrom.parentOffset <= 0 ||
    oldFrom.parentOffset >= oldFrom.parent.content.size
  ) {
    return null
  }
  const newFrom = newSelection.$from
  if (
    newFrom.depth !== 1 ||
    newFrom.parent.type.name !== 'paragraph' ||
    newFrom.parentOffset !== 0
  ) {
    return null
  }
  const rightIndex = newFrom.index(0)
  const oldIndex = oldFrom.index(0)
  if (
    rightIndex !== oldIndex + 1 ||
    newState.doc.childCount !== oldState.doc.childCount + 1
  ) {
    return null
  }
  for (let index = 0; index < oldIndex; index += 1) {
    if (!oldState.doc.child(index).eq(newState.doc.child(index))) return null
  }
  for (let index = oldIndex + 1; index < oldState.doc.childCount; index += 1) {
    if (!oldState.doc.child(index).eq(newState.doc.child(index + 1))) return null
  }
  const original = oldState.doc.child(oldIndex)
  const left = newState.doc.child(oldIndex)
  const right = newState.doc.child(rightIndex)
  if (
    original.type.name !== 'paragraph' ||
    left.type !== original.type ||
    right.type !== original.type ||
    !left.sameMarkup(original) ||
    !right.sameMarkup(original) ||
    !left.content.append(right.content).eq(original.content)
  ) {
    return null
  }
  return { boundary: newFrom.before(1) }
}

/**
 * Enter 仍执行 Tiptap 原生 splitBlock，但只在根级正文段落中部的
 * 那一次交易上留下候选 meta。Plugin 同时核对该交易确实把
 * 一个根级正文段原子拆成了文本完整的左右两段；meta 和
 * 结构核对缺一不可。任何后续交易都使候选失效，
 * 因此选区移走再移回、输入或其他操作都不会被 DOM 相邻关系误判。
 */
export const PageBreakContinuation = Extension.create({
  name: 'pageBreakContinuation',
  priority: 1_100,

  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const { selection } = this.editor.state
        const { $from } = selection
        if (
          !selection.empty ||
          !isRootContinuationParagraphPosition($from) ||
          $from.parentOffset <= 0 ||
          $from.parentOffset >= $from.parent.content.size
        ) {
          return false
        }
        return this.editor
          .chain()
          .command(({ tr }) => {
            tr.setMeta(CREATE_CANDIDATE_META, true)
            return true
          })
          .splitBlock()
          .run()
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<ContinuationSplitCandidate | null>({
        key: continuationSplitCandidateKey,
        state: {
          init: () => null,
          apply: (transaction, _candidate, oldState, newState) =>
            candidateFromSplitTransaction(transaction, oldState, newState),
        },
      }),
    ]
  },
})

export function hasContinuationSplitCandidate(state: EditorState): boolean {
  const candidate = continuationSplitCandidateKey.getState(state)
  if (!candidate) return false
  const selection = state.selection
  if (!(selection instanceof TextSelection) || !selection.empty) return false
  const { $from } = selection
  return (
    $from.depth === 1 &&
    $from.parent.type.name === 'paragraph' &&
    $from.parentOffset === 0 &&
    $from.before(1) === candidate.boundary
  )
}
