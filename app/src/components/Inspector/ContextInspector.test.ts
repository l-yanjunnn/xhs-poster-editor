import {
  act,
  createElement,
  type ComponentProps,
} from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_THEME } from '@/lib/themes'
import { ContextInspector } from './ContextInspector'

type ReactActGlobal = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
;(globalThis as ReactActGlobal).IS_REACT_ACT_ENVIRONMENT = true

type InspectorProps = ComponentProps<typeof ContextInspector>

interface MountedInspector {
  host: HTMLDivElement
  root: Root
  props: InspectorProps
  rerender: (overrides: Partial<InspectorProps>) => Promise<void>
}

const mounted: MountedInspector[] = []

function createProps(
  overrides: Partial<InspectorProps> = {},
): InspectorProps {
  return {
    imageState: {
      active: false,
      imageId: null,
      width: null,
      align: 'center',
      src: null,
      assetId: null,
    },
    textSelectionState: { active: false, highlighted: false, opacity: 0.5 },
    recentActions: [],
    resourceIssues: [],
    resourceRetrying: false,
    resourceLoading: false,
    onRetryResources: vi.fn(),
    currentThemeId: DEFAULT_THEME.id,
    userThemes: [],
    onTheme: vi.fn(),
    fontH1: DEFAULT_THEME.fontH1,
    fontH2: DEFAULT_THEME.fontH2,
    fontH3: DEFAULT_THEME.fontH3,
    fontBody: DEFAULT_THEME.fontBody,
    h1Bold: DEFAULT_THEME.h1Bold,
    h2Bold: DEFAULT_THEME.h2Bold,
    h3Bold: DEFAULT_THEME.h3Bold,
    fontSize: DEFAULT_THEME.fontSize,
    density: DEFAULT_THEME.density,
    h1Width: DEFAULT_THEME.h1Width,
    overlay: DEFAULT_THEME.overlay,
    logoStrategy: DEFAULT_THEME.logoStrategy,
    coverTitleColor: '#6D136C',
    coverSubtitleColor: '#5A465F',
    userFontFamilies: [],
    onFontH1: vi.fn(),
    onFontH2: vi.fn(),
    onFontH3: vi.fn(),
    onFontBody: vi.fn(),
    onH1Bold: vi.fn(),
    onH2Bold: vi.fn(),
    onH3Bold: vi.fn(),
    onFontSize: vi.fn(),
    onDensity: vi.fn(),
    onH1Width: vi.fn(),
    onOverlay: vi.fn(),
    onLogoStrategy: vi.fn(),
    onCoverTitleColor: vi.fn(),
    onCoverSubtitleColor: vi.fn(),
    onRestoreCoverColors: vi.fn(),
    onOpenAssetLibrary: vi.fn(),
    onOpenFontLibrary: vi.fn(),
    onOpenThemeLibrary: vi.fn(),
    onImageAlign: vi.fn(),
    onImageWidth: vi.fn(),
    onReplaceImage: vi.fn(),
    onDeleteImage: vi.fn(),
    onHighlightOpacity: vi.fn(),
    onClearHighlight: vi.fn(),
    ...overrides,
  }
}

async function mountInspector(
  overrides: Partial<InspectorProps> = {},
): Promise<MountedInspector> {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const item: MountedInspector = {
    host,
    root,
    props: createProps(overrides),
    async rerender(nextOverrides) {
      item.props = { ...item.props, ...nextOverrides }
      await act(async () => {
        root.render(createElement(ContextInspector, item.props))
      })
    },
  }
  mounted.push(item)
  await item.rerender({})
  return item
}

afterEach(async () => {
  for (const item of mounted.splice(0)) {
    await act(async () => item.root.unmount())
    item.host.remove()
  }
})

function colorInput(host: HTMLElement, label: string): HTMLInputElement {
  const input = host.querySelector<HTMLInputElement>(
    `input[aria-label="${label}颜色"]`,
  )
  if (!input) throw new Error(`找不到 ${label} 颜色输入`)
  return input
}

async function changeInput(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set
  await act(async () => {
    valueSetter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function blurInput(input: HTMLInputElement) {
  await act(async () => {
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
  })
}

describe('ContextInspector cover colors', () => {
  it('keeps both semantic color inputs and restore action visible on the page card', async () => {
    const { host, props } = await mountInspector()

    expect(host.textContent).toContain('封面文字颜色')
    expect(colorInput(host, '主标题').value).toBe('#6D136C')
    expect(colorInput(host, '副标题').value).toBe('#5A465F')

    const restore = Array.from(host.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('恢复模板颜色'),
    )
    expect(restore).toBeDefined()
    await act(async () => restore?.click())
    expect(props.onRestoreCoverColors).toHaveBeenCalledTimes(1)
  })

  it('commits only on blur or Enter and normalizes lowercase input', async () => {
    const onTitle = vi.fn()
    const onSubtitle = vi.fn()
    const { host } = await mountInspector({
      onCoverTitleColor: onTitle,
      onCoverSubtitleColor: onSubtitle,
    })
    const title = colorInput(host, '主标题')
    const subtitle = colorInput(host, '副标题')

    await changeInput(title, '#abcdef')
    expect(onTitle).not.toHaveBeenCalled()
    await blurInput(title)
    expect(onTitle).toHaveBeenCalledOnce()
    expect(onTitle).toHaveBeenCalledWith('#ABCDEF')
    expect(title.value).toBe('#ABCDEF')

    await changeInput(subtitle, '#a0b1c2')
    expect(onSubtitle).not.toHaveBeenCalled()
    await act(async () => {
      subtitle.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }),
      )
    })
    expect(onSubtitle).toHaveBeenCalledOnce()
    expect(onSubtitle).toHaveBeenCalledWith('#A0B1C2')
    expect(subtitle.value).toBe('#A0B1C2')
  })

  it('shows a clear inline error and never submits invalid CSS values', async () => {
    const onTitle = vi.fn()
    const { host } = await mountInspector({ onCoverTitleColor: onTitle })
    const title = colorInput(host, '主标题')

    await changeInput(title, 'var(--x)')
    await blurInput(title)

    expect(onTitle).not.toHaveBeenCalled()
    expect(title.getAttribute('aria-invalid')).toBe('true')
    const errorId = title.getAttribute('aria-describedby')
    expect(errorId).toBeTruthy()
    expect(document.getElementById(errorId!)?.textContent).toContain(
      '6 位十六进制颜色',
    )
  })

  it('synchronizes local drafts and clears errors when external colors change', async () => {
    const item = await mountInspector()
    const title = colorInput(item.host, '主标题')

    await changeInput(title, '#123')
    await blurInput(title)
    expect(title.getAttribute('aria-invalid')).toBe('true')

    await item.rerender({
      coverTitleColor: '#112233',
      coverSubtitleColor: '#445566',
    })

    expect(colorInput(item.host, '主标题').value).toBe('#112233')
    expect(colorInput(item.host, '副标题').value).toBe('#445566')
    expect(colorInput(item.host, '主标题').hasAttribute('aria-invalid')).toBe(false)
  })
})
