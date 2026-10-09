import { act, createElement, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCompactWorkspace, WorkspaceNavigation } from './WorkspaceNavigation'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mounted: Array<{ host: HTMLDivElement; root: Root }> = []

async function mount(element: ReactElement) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  mounted.push({ host, root })
  await act(async () => root.render(element))
  return { host, root }
}

afterEach(async () => {
  for (const { host, root } of mounted.splice(0)) {
    await act(async () => root.unmount())
    host.remove()
  }
  vi.unstubAllGlobals()
})

function CompactProbe() {
  return createElement('output', null, useCompactWorkspace() ? 'compact' : 'wide')
}

function mockViewport(initialMatches: boolean) {
  let matches = initialMatches
  const listeners = new Set<() => void>()
  const media = {
    get matches() { return matches },
    addEventListener: vi.fn((_event: string, listener: () => void) => listeners.add(listener)),
    removeEventListener: vi.fn((_event: string, listener: () => void) => listeners.delete(listener)),
  }
  const matchMedia = vi.fn(() => media)
  vi.stubGlobal('matchMedia', matchMedia)
  return {
    media,
    matchMedia,
    listeners,
    setMatches(value: boolean) {
      matches = value
      for (const listener of listeners) listener()
    },
  }
}

describe('WorkspaceNavigation', () => {
  it('exposes three native panel buttons with controlled state and correct targets', async () => {
    const onPanelChange = vi.fn()
    const { host, root } = await mount(createElement(WorkspaceNavigation, {
      activePanel: 'canvas', onPanelChange,
    }))
    const navigation = host.querySelector('nav[aria-label="工作区域"]')!
    const buttons = Array.from(navigation.querySelectorAll<HTMLButtonElement>('button'))
    expect(buttons.map(button => button.textContent)).toEqual(['正文', '预览', '字号与设置'])
    expect(buttons.map(button => button.getAttribute('aria-controls'))).toEqual([
      'workspace-editor', 'workspace-canvas', 'workspace-inspector',
    ])
    expect(buttons.every(button => button.type === 'button' && !button.hasAttribute('role'))).toBe(true)
    expect(buttons.map(button => button.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false'])
    expect(onPanelChange).not.toHaveBeenCalled()

    for (const button of buttons) await act(async () => button.click())
    expect(onPanelChange.mock.calls).toEqual([['editor'], ['canvas'], ['inspector']])
    // The parent controls the active panel; clicking does not silently change it.
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true')
    await act(async () => root.render(createElement(WorkspaceNavigation, {
      activePanel: 'inspector', onPanelChange,
    })))
    expect(buttons.map(button => button.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true'])
  })

  it('does not move focus when the parent changes the active panel', async () => {
    const { host, root } = await mount(createElement('div', null,
      createElement('input', { 'aria-label': '当前输入' }),
      createElement(WorkspaceNavigation, { activePanel: 'editor', onPanelChange: vi.fn() }),
    ))
    const input = host.querySelector('input')!
    input.focus()
    await act(async () => root.render(createElement('div', null,
      createElement('input', { 'aria-label': '当前输入' }),
      createElement(WorkspaceNavigation, { activePanel: 'inspector', onPanelChange: vi.fn() }),
    )))
    expect(document.activeElement).toBe(input)
  })
})

describe('useCompactWorkspace', () => {
  it('uses the initial media match and updates in both directions without duplicate subscriptions', async () => {
    const viewport = mockViewport(true)
    const { host, root } = await mount(createElement(CompactProbe))
    expect(host.textContent).toBe('compact')
    expect(viewport.matchMedia).toHaveBeenCalledWith('(max-width: 1279px)')
    expect(viewport.media.addEventListener).toHaveBeenCalledOnce()
    expect(viewport.listeners.size).toBe(1)

    await act(async () => viewport.setMatches(false))
    expect(host.textContent).toBe('wide')
    await act(async () => viewport.setMatches(true))
    expect(host.textContent).toBe('compact')
    await act(async () => root.render(createElement(CompactProbe)))
    expect(viewport.media.addEventListener).toHaveBeenCalledOnce()
  })

  it('removes the same change listener when unmounted', async () => {
    const viewport = mockViewport(false)
    const { root } = await mount(createElement(CompactProbe))
    const listener = viewport.media.addEventListener.mock.calls[0][1]
    await act(async () => root.render(null))
    expect(viewport.media.removeEventListener).toHaveBeenCalledOnce()
    expect(viewport.media.removeEventListener).toHaveBeenCalledWith('change', listener)
    expect(viewport.listeners.size).toBe(0)
  })

  it('safely renders a wide fallback without matchMedia', async () => {
    vi.stubGlobal('matchMedia', undefined)
    const { host } = await mount(createElement(CompactProbe))
    expect(host.textContent).toBe('wide')
  })

  it('renders safely on the server without window', () => {
    vi.stubGlobal('window', undefined)
    try {
      expect(renderToString(createElement(CompactProbe))).toBe('<output>wide</output>')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
