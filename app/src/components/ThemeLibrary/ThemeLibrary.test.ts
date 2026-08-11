import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ThemeLibrary } from './ThemeLibrary'

vi.mock('@/components/ThemePreview/ThemePreview', () => ({
  ThemePreview: () => null,
}))

type ReactActGlobal = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
;(globalThis as ReactActGlobal).IS_REACT_ACT_ENVIRONMENT = true

const mounted: Array<{ host: HTMLDivElement; root: Root }> = []

afterEach(async () => {
  for (const item of mounted.splice(0)) {
    await act(async () => item.root.unmount())
    item.host.remove()
  }
})

describe('ThemeLibrary background role badge', () => {
  it('仅给 Cover / Inner 底图不同的主题显示「首图 + 内页」', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    mounted.push({ host, root })

    await act(async () => {
      root.render(
        createElement(ThemeLibrary, {
          open: true,
          onOpenChange: vi.fn(),
          userThemes: [],
          currentThemeId: null,
          onApply: vi.fn(),
          onSaveCurrent: vi.fn(async () => undefined),
          onReload: vi.fn(async () => undefined),
        }),
      )
    })

    const dialog = document.body.querySelector('[data-slot="dialog-content"]')
    const badges = dialog?.querySelectorAll(
      '[data-page-backgrounds="cover-inner"]',
    )
    expect(badges).toHaveLength(1)
    expect(badges?.[0].textContent).toBe('首图 + 内页')
    expect(
      dialog
        ?.querySelector('[data-theme-id="builtin-public-exam-landscape"]')
        ?.textContent,
    ).toContain('首图 + 内页')
    expect(
      dialog
        ?.querySelector('[data-theme-id="builtin-elegant"]')
        ?.querySelector('[data-page-backgrounds]'),
    ).toBeNull()
  })
})
