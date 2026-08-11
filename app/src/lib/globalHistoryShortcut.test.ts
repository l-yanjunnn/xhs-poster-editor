import { describe, expect, it, vi } from 'vitest'
import { handleGlobalHistoryShortcut } from './globalHistoryShortcut'

interface DispatchOptions {
  blocked?: boolean
  dialogOpen?: boolean
  gestureActive?: boolean
  undoResult?: boolean
  redoResult?: boolean
}

function dispatchShortcut(
  target: HTMLElement,
  init: KeyboardEventInit,
  options: DispatchOptions = {},
) {
  const undo = vi.fn(() => options.undoResult ?? true)
  const redo = vi.fn(() => options.redoResult ?? true)
  let handled = false
  target.addEventListener(
    'keydown',
    (event) => {
      handled = handleGlobalHistoryShortcut(event, {
        blocked: options.blocked ?? false,
        dialogOpen: options.dialogOpen ?? false,
        gestureActive: options.gestureActive ?? false,
        undo,
        redo,
      })
    },
    { once: true },
  )
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ...init,
  })
  target.dispatchEvent(event)
  return { event, handled, undo, redo }
}

describe('global history shortcut routing', () => {
  it.each([
    [{ key: 'z', metaKey: true }, 'undo'],
    [{ key: 'Z', ctrlKey: true }, 'undo'],
    [{ key: 'z', metaKey: true, shiftKey: true }, 'redo'],
    [{ key: 'Z', ctrlKey: true, shiftKey: true }, 'redo'],
    [{ key: 'y', ctrlKey: true }, 'redo'],
  ] as const)('routes %o to %s outside the editor', (init, action) => {
    const target = document.createElement('button')
    document.body.append(target)
    const result = dispatchShortcut(target, init)

    expect(result[action]).toHaveBeenCalledTimes(1)
    expect(result.handled).toBe(true)
    expect(result.event.defaultPrevented).toBe(true)
    target.remove()
  })

  it('does not claim Meta+Y or shortcuts with Alt', () => {
    const target = document.createElement('button')
    const metaY = dispatchShortcut(target, { key: 'y', metaKey: true })
    const altUndo = dispatchShortcut(target, {
      key: 'z',
      metaKey: true,
      altKey: true,
    })

    expect(metaY.handled).toBe(false)
    expect(altUndo.handled).toBe(false)
    expect(metaY.event.defaultPrevented).toBe(false)
    expect(altUndo.event.defaultPrevented).toBe(false)
  })

  it.each([
    ['input', () => document.createElement('input')],
    ['textarea', () => document.createElement('textarea')],
    ['select', () => document.createElement('select')],
    [
      'contenteditable',
      () => {
        const editor = document.createElement('div')
        editor.setAttribute('contenteditable', 'true')
        const child = document.createElement('span')
        editor.append(child)
        return child
      },
    ],
  ])('leaves undo to %s', (_label, makeTarget) => {
    const target = makeTarget()
    const container = document.createElement('div')
    container.append(target.parentElement ?? target)
    document.body.append(container)
    const result = dispatchShortcut(target, { key: 'z', metaKey: true })

    expect(result.handled).toBe(false)
    expect(result.undo).not.toHaveBeenCalled()
    expect(result.event.defaultPrevented).toBe(false)
    container.remove()
  })

  it('leaves shortcuts inside an open popup to that popup', () => {
    const popup = document.createElement('div')
    popup.setAttribute('role', 'listbox')
    const target = document.createElement('button')
    popup.append(target)
    document.body.append(popup)

    const result = dispatchShortcut(target, { key: 'z', metaKey: true })
    expect(result.handled).toBe(false)
    expect(result.undo).not.toHaveBeenCalled()
    popup.remove()
  })

  it.each([
    ['IME composition', { isComposing: true } as KeyboardEventInit, {}],
    ['legacy IME key', { keyCode: 229 } as KeyboardEventInit, {}],
    ['dialog', {}, { dialogOpen: true }],
    ['read-only state', {}, { blocked: true }],
    ['canvas gesture', {}, { gestureActive: true }],
  ])('does not intercept %s', (_label, extraInit, options) => {
    const target = document.createElement('button')
    const result = dispatchShortcut(
      target,
      { key: 'z', metaKey: true, ...extraInit },
      options,
    )
    expect(result.handled).toBe(false)
    expect(result.undo).not.toHaveBeenCalled()
    expect(result.event.defaultPrevented).toBe(false)
  })

  it('prevents the browser default only when the editor command succeeds', () => {
    const target = document.createElement('button')
    const undo = dispatchShortcut(
      target,
      { key: 'z', metaKey: true },
      { undoResult: false },
    )
    const redo = dispatchShortcut(
      target,
      { key: 'z', metaKey: true, shiftKey: true },
      { redoResult: false },
    )

    expect(undo.undo).toHaveBeenCalledTimes(1)
    expect(redo.redo).toHaveBeenCalledTimes(1)
    expect(undo.handled).toBe(false)
    expect(redo.handled).toBe(false)
    expect(undo.event.defaultPrevented).toBe(false)
    expect(redo.event.defaultPrevented).toBe(false)
  })

  it('respects an event already handled by another keymap', () => {
    const undo = vi.fn(() => true)
    const event = new KeyboardEvent('keydown', {
      key: 'z',
      metaKey: true,
      cancelable: true,
    })
    event.preventDefault()

    expect(
      handleGlobalHistoryShortcut(event, {
        blocked: false,
        dialogOpen: false,
        gestureActive: false,
        undo,
        redo: vi.fn(() => true),
      }),
    ).toBe(false)
    expect(undo).not.toHaveBeenCalled()
  })
})
