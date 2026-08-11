export interface GlobalHistoryShortcutContext {
  blocked: boolean
  dialogOpen: boolean
  gestureActive: boolean
  undo: () => boolean
  redo: () => boolean
}

type HistoryAction = 'undo' | 'redo'

const POPUP_SELECTOR = [
  '[aria-modal="true"]',
  '[role="dialog"]',
  '[role="listbox"]',
  '[role="menu"]',
].join(',')

function isEditableOrPopupTarget(event: KeyboardEvent): boolean {
  const path = event.composedPath()
  const candidates = path.length > 0 ? path : [event.target]

  return candidates.some((candidate) => {
    if (!(candidate instanceof Element)) return false
    if (
      candidate instanceof HTMLInputElement ||
      candidate instanceof HTMLTextAreaElement ||
      candidate instanceof HTMLSelectElement
    ) {
      return true
    }
    const editable = candidate.getAttribute('contenteditable')
    if (editable !== null && editable.toLowerCase() !== 'false') return true
    return candidate.matches(POPUP_SELECTOR)
  })
}

function historyActionForEvent(event: KeyboardEvent): HistoryAction | null {
  if (
    event.defaultPrevented ||
    event.isComposing ||
    event.keyCode === 229 ||
    event.altKey ||
    event.metaKey === event.ctrlKey
  ) {
    return null
  }

  const key = event.key.toLowerCase()
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo'
  if (key === 'y' && event.ctrlKey && !event.metaKey && !event.shiftKey) {
    return 'redo'
  }
  return null
}

/**
 * 只在编辑器已失焦的安全区域补齐历史快捷键。
 * ProseMirror、表单输入和弹层仍保留自己的键盘语义。
 */
export function handleGlobalHistoryShortcut(
  event: KeyboardEvent,
  context: GlobalHistoryShortcutContext,
): boolean {
  if (
    context.blocked ||
    context.dialogOpen ||
    context.gestureActive ||
    isEditableOrPopupTarget(event)
  ) {
    return false
  }

  const action = historyActionForEvent(event)
  if (!action || !context[action]()) return false
  event.preventDefault()
  return true
}
