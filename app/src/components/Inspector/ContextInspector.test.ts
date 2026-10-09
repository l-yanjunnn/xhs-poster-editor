import {
  act,
  createElement,
  type ComponentProps,
} from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_THEME } from '@/lib/themes'
import { SYSTEM_FONT_OPTION, SYSTEM_FONT_STACK } from '@/lib/fontPresets'
import { TEXT_HIGHLIGHT_COLORS } from '@/lib/textHighlight'
import { ContextInspector } from './ContextInspector'

type ReactActGlobal = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
;(globalThis as ReactActGlobal).IS_REACT_ACT_ENVIRONMENT = true

type InspectorProps = ComponentProps<typeof ContextInspector>
type CategoryLabel = '文字' | '页面' | '外观' | '图片' | '发布' | '记录'

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
    releaseCopy: '',
    releaseCopySourceName: null,
    onReleaseCopyChange: vi.fn(),
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
    coverTitleColor: '#6D136C',
    hasCoverTitle: true,
    coverSubtitleColor: '#5A465F',
    coverLayout: DEFAULT_THEME.coverLayout,
    coverVertical: DEFAULT_THEME.coverVertical,
    coverSubtitleSpacing: DEFAULT_THEME.coverSubtitleSpacing,
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
    onCoverTitleColor: vi.fn(),
    onCoverTitleFontSizeChange: vi.fn(),
    onCoverSubtitleColor: vi.fn(),
    onRestoreCoverColors: vi.fn(),
    onCoverLayout: vi.fn(),
    onCoverVertical: vi.fn(),
    onCoverSubtitleSpacing: vi.fn(),
    onOpenAssetLibrary: vi.fn(),
    onOpenFontLibrary: vi.fn(),
    onOpenThemeLibrary: vi.fn(),
    onImageAlign: vi.fn(),
    onImageWidth: vi.fn(),
    onReplaceImage: vi.fn(),
    onDeleteImage: vi.fn(),
    onHighlightOpacity: vi.fn(),
    onHighlightStyle: vi.fn(),
    onHighlightColor: vi.fn(),
    onClearHighlight: vi.fn(),
    ...overrides,
  }
}

describe('ContextInspector publication copy', () => {
  it('在任何对象上下文都保留独立发布文案卡片', async () => {
    const onReleaseCopyChange = vi.fn()
    const item = await mountInspector({
      releaseCopy: '一段发布文案\n#申论',
      releaseCopySourceName: '测试文稿.md',
      onReleaseCopyChange,
    }, '发布')

    const textarea = item.host.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="发布文案"]',
    )
    expect(textarea?.value).toBe('一段发布文案\n#申论')
    expect(item.host.textContent).toContain('来自 测试文稿.md')

    await changeInput(textarea!, '修改后的发布文案')
    expect(onReleaseCopyChange).toHaveBeenCalledWith('修改后的发布文案')

    await item.rerender({
      imageState: {
        active: true,
        imageId: 'image-1',
        width: '50%',
        align: 'center',
        src: 'blob:image',
        assetId: 'asset-1',
      },
    })
    expect(
      item.host.querySelector('textarea[aria-label="发布文案"]'),
    ).not.toBeNull()
  })
})

async function mountInspector(
  overrides: Partial<InspectorProps> = {},
  initialCategory: CategoryLabel = '文字',
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
  await openCategory(item, initialCategory)
  return item
}

function categoryButton(host: HTMLElement, label: CategoryLabel): HTMLButtonElement {
  const button = host.querySelector<HTMLButtonElement>(`.inspector-rail button[aria-label="${label}"]`)
  if (!button) throw new Error(`找不到 ${label} 分类`)
  return button
}

async function openCategory(item: MountedInspector, label: CategoryLabel) {
  const button = categoryButton(item.host, label)
  if (button.getAttribute('aria-expanded') !== 'true') {
    await act(async () => button.click())
  }
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

async function changeInput(
  input: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  const prototype =
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype
  const valueSetter = Object.getOwnPropertyDescriptor(
    prototype,
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

describe('ContextInspector category navigation', () => {
  it('starts in text with six named native controls and moves keyboard focus without changing category', async () => {
    const item = await mountInspector()
    const buttons = Array.from(item.host.querySelectorAll<HTMLButtonElement>('.inspector-rail button'))
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual(['文字', '页面', '外观', '图片', '发布', '记录'])
    expect(buttons.every((button) => button.type === 'button' && !button.hasAttribute('role'))).toBe(true)
    expect(buttons.map((button) => button.getAttribute('aria-expanded'))).toEqual(['true', 'false', 'false', 'false', 'false', 'false'])
    const panel = item.host.querySelector<HTMLElement>('.inspector-drawer')!
    expect(buttons.every((button) => button.getAttribute('aria-controls') === panel.id)).toBe(true)
    expect(panel.hidden).toBe(false)
    expect(item.host.querySelectorAll('.font-field')).toHaveLength(4)

    await act(async () => {
      buttons[0].focus()
      buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
    })
    expect(document.activeElement).toBe(buttons[1])
    expect(buttons[0].getAttribute('aria-expanded')).toBe('true')
    await act(async () => buttons[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true })))
    expect(document.activeElement).toBe(buttons[5])
    await act(async () => buttons[5].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true })))
    expect(document.activeElement).toBe(buttons[0])
  })

  it('keeps a manually chosen category through text, image, history and cleared-selection updates', async () => {
    const item = await mountInspector({}, '页面')
    const pageControls = item.host.querySelector('[aria-label="封面版式"]')!
    for (const overrides of [
      { textSelectionState: { active: true, highlighted: false, opacity: 0.25 } },
      { imageState: { active: true, imageId: 'image-1', width: '50%', align: 'center' as const, src: 'blob:image', assetId: 'asset-1' } },
      { recentActions: [{ id: 'undo', label: '撤销关键词强调', time: 1 }] },
      { textSelectionState: createProps().textSelectionState, imageState: createProps().imageState },
    ]) {
      await item.rerender(overrides)
      expect(categoryButton(item.host, '页面').getAttribute('aria-expanded')).toBe('true')
      expect(item.host.querySelector('[aria-label="封面版式"]')).toBe(pageControls)
    }
    for (const [name, callback] of Object.entries(item.props)) {
      if (name.startsWith('on') && typeof callback === 'function') expect(callback).not.toHaveBeenCalled()
    }
  })

  it('collapses and reopens the selected category without remounting or changing controlled values', async () => {
    const item = await mountInspector({ coverTitleFontSize: 126 })
    const text = categoryButton(item.host, '文字')
    const drawer = item.host.querySelector<HTMLElement>('.inspector-drawer')!
    const control = item.host.querySelector('.cover-title-size-options')!
    await act(async () => text.click())
    expect(drawer.hidden).toBe(true)
    expect(text.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(text)
    expect(item.host.textContent).toContain('工具面板已收起')
    await item.rerender({ coverTitleFontSize: 144 })
    expect(drawer.hidden).toBe(true)
    await openCategory(item, '文字')
    expect(drawer.hidden).toBe(false)
    expect(item.host.querySelector('.cover-title-size-options')).toBe(control)
    expect(control.querySelector('[aria-pressed="true"]')?.textContent).toBe('144 px')

    await act(async () => item.host.querySelector<HTMLButtonElement>('button[aria-label="收起工具面板"]')!.click())
    expect(drawer.hidden).toBe(true)
    await openCategory(item, '记录')
    expect(drawer.hidden).toBe(false)
    expect(categoryButton(item.host, '记录').getAttribute('aria-expanded')).toBe('true')
    expect(item.host.querySelector('.recent-actions')).not.toBeNull()
    expect(item.host.textContent).toContain('撤销与重做请使用顶栏按钮')
    expect(item.props.onCoverTitleFontSizeChange).not.toHaveBeenCalled()
  })

  it('handles Escape inside the drawer without bubbling and restores focus to the active category', async () => {
    const item = await mountInspector({ releaseCopy: '发布内容' }, '发布')
    const textarea = item.host.querySelector<HTMLTextAreaElement>('textarea[aria-label="发布文案"]')!
    const globalKeydown = vi.fn()
    window.addEventListener('keydown', globalKeydown)
    try {
      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
      await act(async () => {
        textarea.focus()
        textarea.dispatchEvent(event)
      })
      expect(event.defaultPrevented).toBe(true)
      expect(globalKeydown).not.toHaveBeenCalled()
      expect(item.host.querySelector<HTMLElement>('.inspector-drawer')!.hidden).toBe(true)
      expect(document.activeElement).toBe(categoryButton(item.host, '发布'))
      expect(item.props.onReleaseCopyChange).not.toHaveBeenCalled()

      await openCategory(item, '发布')
      const handledByChild = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
      handledByChild.preventDefault()
      await act(async () => textarea.dispatchEvent(handledByChild))
      expect(item.host.querySelector<HTMLElement>('.inspector-drawer')!.hidden).toBe(false)
    } finally {
      window.removeEventListener('keydown', globalKeydown)
    }
  })

  it('commits a pending color once when focus moves to a category button before changing panels', async () => {
    const item = await mountInspector({}, '外观')
    const title = colorInput(item.host, '主标题')
    await act(async () => title.focus())
    await changeInput(title, '#abcdef')
    expect(item.props.onCoverTitleColor).not.toHaveBeenCalled()
    await act(async () => categoryButton(item.host, '文字').focus())
    await openCategory(item, '文字')
    expect(item.props.onCoverTitleColor).toHaveBeenCalledOnce()
    expect(item.props.onCoverTitleColor).toHaveBeenCalledWith('#ABCDEF')
  })

  it('keeps resource warnings discoverable across categories and opens their appearance details', async () => {
    const item = await mountInspector({
      resourceIssues: [{ id: 'background:cover:missing', label: '首图背景', message: '素材丢失', backgroundRole: 'cover' }],
      resourceLoading: true,
    })
    for (const category of ['文字', '页面', '图片', '发布', '记录'] as const) {
      await openCategory(item, category)
      expect(item.host.querySelector('.inspector-resource-alert')?.textContent).toContain('1 项资源未载入')
      expect(item.host.querySelector('[role="status"]')?.textContent).toContain('正在载入主题资源')
      expect(categoryButton(item.host, '外观').querySelector('[aria-label="有资源未载入"]')).not.toBeNull()
    }
    await act(async () => item.host.querySelector<HTMLButtonElement>('.inspector-resource-alert')!.click())
    expect(categoryButton(item.host, '外观').getAttribute('aria-expanded')).toBe('true')
    expect(item.host.querySelector('.resource-issues')?.textContent).toContain('素材丢失')
    expect(item.host.querySelector('.inspector-resource-alert')).toBeNull()
    await act(async () => categoryButton(item.host, '外观').click())
    expect(item.host.querySelector<HTMLElement>('.inspector-drawer')!.hidden).toBe(true)
    expect(categoryButton(item.host, '外观').querySelector('[aria-label="有资源未载入"]')).not.toBeNull()
    await openCategory(item, '外观')
    expect(item.host.querySelector<HTMLButtonElement>('button[aria-label="重新载入首图背景"]')).not.toBeNull()
    expect(item.props.onRetryResources).not.toHaveBeenCalled()
    await item.rerender({ resourceIssues: [], resourceLoading: false })
    expect(item.host.querySelector('.resource-issues')).toBeNull()
    expect(item.host.querySelector('.inspector-rail-dot.is-warning')).toBeNull()
    expect(item.host.querySelector('[role="status"]')).toBeNull()
  })
})

describe('ContextInspector cover colors', () => {
  it('keeps both semantic color inputs and restore action visible in appearance', async () => {
    const { host, props } = await mountInspector({}, '外观')

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
    }, '外观')
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
    const { host } = await mountInspector({ onCoverTitleColor: onTitle }, '外观')
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
    const item = await mountInspector({}, '外观')
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

  it('clears invalid drafts when restoring an unchanged template color', async () => {
    const item = await mountInspector({}, '外观')
    const title = colorInput(item.host, '主标题')

    await changeInput(title, '#123')
    await blurInput(title)
    expect(title.getAttribute('aria-invalid')).toBe('true')

    const restore = Array.from(item.host.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('恢复模板颜色'),
    )
    await act(async () => restore?.click())

    expect(item.props.onRestoreCoverColors).toHaveBeenCalledOnce()
    expect(colorInput(item.host, '主标题').value).toBe('#6D136C')
    expect(colorInput(item.host, '主标题').hasAttribute('aria-invalid')).toBe(false)
  })
})

describe('ContextInspector cover slots', () => {
  it('把版式、垂直位置和副标题字距提交给页面样式，不改正文', async () => {
    const onCoverLayout = vi.fn()
    const onCoverVertical = vi.fn()
    const onCoverSubtitleSpacing = vi.fn()
    const item = await mountInspector({
      onCoverLayout,
      onCoverVertical,
      onCoverSubtitleSpacing,
    }, '页面')
    const { host } = item

    const poster = Array.from(
      host.querySelectorAll<HTMLButtonElement>('button'),
    ).find((button) => button.textContent?.includes('居中海报'))
    const bottom = Array.from(
      host.querySelectorAll<HTMLButtonElement>('[aria-label="垂直位置"] button'),
    ).find((button) => button.textContent === '下')
    const relaxed = Array.from(
      host.querySelectorAll<HTMLButtonElement>('[aria-label="副标题字距"] button'),
    ).find((button) => button.textContent === '舒展')
    await act(async () => poster?.click())
    await act(async () => bottom?.click())
    await act(async () => relaxed?.click())

    expect(onCoverLayout).toHaveBeenCalledWith('poster-center')
    expect(onCoverVertical).toHaveBeenCalledWith('bottom')
    expect(onCoverSubtitleSpacing).toHaveBeenCalledOnce()
    expect(onCoverSubtitleSpacing).toHaveBeenCalledWith('relaxed')
    expect(host.textContent).toContain('实验能力 · 只影响封面副标题')
    const activeLayout = host.querySelector(
      '[aria-label="封面版式"] button[aria-pressed="true"]',
    )
    expect(activeLayout?.textContent).toContain('左对齐叠排')

    await item.rerender({ coverSubtitleSpacing: 'relaxed' })
    expect(
      host.querySelector(
        '[aria-label="副标题字距"] button[aria-pressed="true"]',
      )?.textContent,
    ).toBe('舒展')
  })

  it('把字距入口保留在页面分类，选中文字或图片不会让设置消失', async () => {
    const item = await mountInspector({}, '页面')
    const spacingControl = () =>
      item.host.querySelector('[aria-label="副标题字距"]')

    expect(spacingControl()).not.toBeNull()

    await item.rerender({
      imageState: {
        active: true,
        imageId: 'image-1',
        width: '50%',
        align: 'center',
        src: 'blob:image',
        assetId: 'asset-1',
      },
    })
    expect(spacingControl()).not.toBeNull()
    expect(categoryButton(item.host, '页面').getAttribute('aria-expanded')).toBe('true')

    await item.rerender({
      imageState: {
        active: false,
        imageId: null,
        width: null,
        align: 'center',
        src: null,
        assetId: null,
      },
      textSelectionState: {
        active: true,
        highlighted: false,
        opacity: 0.5,
      },
    })
    expect(spacingControl()).not.toBeNull()
    expect(item.host.querySelectorAll('[aria-label="副标题字距"]')).toHaveLength(1)
    await openCategory(item, '文字')
    expect(spacingControl()).toBeNull()
  })

  it('把旧的 H1 宽度入口澄清为全篇作用，不改其控件', async () => {
    const { host } = await mountInspector({}, '页面')
    const labels = Array.from(
      host.querySelectorAll<HTMLElement>('.inspector-field-label'),
      (element) => element.textContent?.trim(),
    )

    expect(labels).toContain('全篇 H1 宽度')
    expect(labels).not.toContain('H1 宽度')
  })
})

describe('ContextInspector cover title size', () => {
  it('keeps one mounted size control through selection changes without switching the text category', async () => {
    const item = await mountInspector({ coverTitleFontSize: 126 })
    const control = item.host.querySelector('.cover-title-size-options')!
    const sizeButton = (value: number) => Array.from(
      control.querySelectorAll<HTMLButtonElement>('button'),
    ).find((button) => button.textContent === `${value} px`)!
    const expectSameControl = (value: number) => {
      expect(item.host.querySelectorAll('.cover-title-size-options')).toHaveLength(1)
      expect(item.host.querySelector('.cover-title-size-options')).toBe(control)
      expect(sizeButton(value).getAttribute('aria-pressed')).toBe('true')
    }
    expectSameControl(126)

    await item.rerender({
      textSelectionState: { active: true, highlighted: false, opacity: 0.25 },
    })
    expectSameControl(126)
    expect(item.host.querySelectorAll('input[aria-label="关键词强调透明度"]')).toHaveLength(1)
    await act(async () => sizeButton(144).click())
    expect(item.props.onCoverTitleFontSizeChange).toHaveBeenCalledOnce()
    expect(item.props.onCoverTitleFontSizeChange).toHaveBeenCalledWith(144)
    expect(item.props.onFontSize).not.toHaveBeenCalled()
    expect(item.props.onHighlightOpacity).not.toHaveBeenCalled()
    await item.rerender({ coverTitleFontSize: 144 })
    expectSameControl(144)

    await item.rerender({
      imageState: {
        active: true,
        imageId: 'image-context',
        width: '50%',
        align: 'center',
        src: 'blob:image',
        assetId: 'asset-context',
      },
      textSelectionState: { active: false, highlighted: false, opacity: 0.25 },
    })
    expectSameControl(144)
    expect(item.host.querySelector('input[aria-label="图片宽度百分比"]')).toBeNull()
    expect(categoryButton(item.host, '文字').getAttribute('aria-expanded')).toBe('true')
    expect(categoryButton(item.host, '图片').querySelector('[aria-label="当前有选区"]')).not.toBeNull()
    expect(item.host.querySelector('input[aria-label="关键词强调透明度"]')).toBeNull()

    await item.rerender({ imageState: createProps().imageState })
    expectSameControl(144)
    expect(item.host.querySelector('[aria-label="封面版式"]')).toBeNull()
    expect(item.host.querySelector('input[aria-label="图片宽度百分比"]')).toBeNull()
    expect(item.props.onCoverTitleFontSizeChange).toHaveBeenCalledOnce()
    await openCategory(item, '页面')
    expect(item.host.querySelector('[aria-label="封面版式"]')).not.toBeNull()
  })

  it('keeps cover size and emphasis first in text while page, appearance, image and publication have one dedicated entry', async () => {
    const item = await mountInspector({
      pageLayoutControls: createElement('section', { 'data-testid': 'page-layout' }),
      logoControls: createElement('section', { 'data-testid': 'logo-controls' }),
    })
    const sizeCard = item.host.querySelector('.cover-title-size-card')!
    const expectBefore = (first: Element, second: Element) => {
      expect(Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
    }
    expect(sizeCard).not.toBeNull()
    expect(item.host.querySelector('.inspector-drawer-content')!.firstElementChild).toBe(sizeCard)
    expect(item.host.querySelector('.publication-copy-card')).toBeNull()
    expect(item.host.querySelector('[data-testid="page-layout"]')).toBeNull()
    expect(item.host.querySelector('[data-testid="logo-controls"]')).toBeNull()

    await item.rerender({
      textSelectionState: { active: true, highlighted: false, opacity: 0.25 },
    })
    const textCard = item.host.querySelector('input[aria-label="关键词强调透明度"]')!.closest('.inspector-card')!
    expectBefore(sizeCard, textCard)
    expectBefore(textCard, item.host.querySelector('button[aria-label="H1 全局样式"]')!.closest('.inspector-card')!)

    await openCategory(item, '页面')
    expect(item.host.querySelectorAll('[data-testid="page-layout"]')).toHaveLength(1)
    expect(item.host.querySelector('[data-testid="logo-controls"]')).toBeNull()
    await openCategory(item, '外观')
    expect(item.host.querySelectorAll('[data-testid="logo-controls"]')).toHaveLength(1)
    expect(item.host.querySelector('[data-testid="page-layout"]')).toBeNull()
    await openCategory(item, '发布')
    expect(item.host.querySelectorAll('.publication-copy-card')).toHaveLength(1)
    expect(item.host.querySelector('.cover-title-size-card')).toBeNull()

    await item.rerender({
      imageState: {
        active: true,
        imageId: 'image-context',
        width: '50%',
        align: 'center',
        src: 'blob:image',
        assetId: 'asset-context',
      },
      textSelectionState: { active: false, highlighted: false, opacity: 0.25 },
    })
    expect(categoryButton(item.host, '发布').getAttribute('aria-expanded')).toBe('true')
    expect(item.host.querySelector('input[aria-label="图片宽度百分比"]')).toBeNull()
    await openCategory(item, '图片')
    const imageCard = item.host.querySelector('input[aria-label="图片宽度百分比"]')!.closest('.inspector-card')!
    expect(imageCard).not.toBeNull()
    expect(item.host.querySelector('.publication-copy-card')).toBeNull()
    expect(item.host.querySelectorAll('input[aria-label="图片宽度百分比"]')).toHaveLength(1)
  })

  it('keeps the no-cover-title hint and disabled explicit sizes in text and image contexts', async () => {
    const item = await mountInspector({ hasCoverTitle: false, coverTitleFontSize: 144 })
    const contexts: Array<Partial<InspectorProps>> = [
      { textSelectionState: { active: true, highlighted: false, opacity: 0.25 } },
      {
        textSelectionState: { active: false, highlighted: false, opacity: 0.25 },
        imageState: {
          active: true,
          imageId: 'image-context',
          width: '50%',
          align: 'center',
          src: 'blob:image',
          assetId: 'asset-context',
        },
      },
    ]
    for (const [index, context] of contexts.entries()) {
      await item.rerender(context)
      const card = item.host.querySelector('.cover-title-size-card')!
      expect(card.textContent).toContain('请先在第一页添加主标题（H1）')
      const buttons = Array.from(card.querySelectorAll<HTMLButtonElement>('.cover-title-size-options button'))
      expect(buttons).toHaveLength(4)
      expect(buttons[0].disabled).toBe(false)
      expect(buttons.slice(1).every((button) => button.disabled)).toBe(true)
      await act(async () => buttons[1].click())
      expect(item.props.onCoverTitleFontSizeChange).toHaveBeenCalledTimes(index)
      await act(async () => buttons[0].click())
      expect(item.props.onCoverTitleFontSizeChange).toHaveBeenCalledTimes(index + 1)
      expect(item.props.onCoverTitleFontSizeChange).toHaveBeenLastCalledWith(undefined)
    }
  })

  it('changes only the dedicated cover value and restores the original rules', async () => {
    const item = await mountInspector()
    const button = (text: string) => Array.from(
      item.host.querySelectorAll<HTMLButtonElement>('.cover-title-size-options button'),
    ).find((element) => element.textContent === text)!

    expect(button('跟随原规则').getAttribute('aria-pressed')).toBe('true')
    expect(item.host.textContent).toContain('只影响封面第一个主标题')
    expect(item.host.textContent).toContain('无需先选中文字')

    await act(async () => button('126 px').click())
    expect(item.props.onCoverTitleFontSizeChange).toHaveBeenCalledWith(126)
    expect(item.props.onFontSize).not.toHaveBeenCalled()
    expect(item.props.onCoverLayout).not.toHaveBeenCalled()

    await item.rerender({ coverTitleFontSize: 126 })
    expect(button('126 px').getAttribute('aria-pressed')).toBe('true')
    await act(async () => button('跟随原规则').click())
    expect(item.props.onCoverTitleFontSizeChange).toHaveBeenLastCalledWith(undefined)

    await item.rerender({ coverTitleFontSize: undefined })
    expect(button('跟随原规则').getAttribute('aria-pressed')).toBe('true')
  })

  it('requires a cover H1 for explicit sizes while keeping recovery available', async () => {
    const item = await mountInspector({ hasCoverTitle: false, coverTitleFontSize: 144 })
    const buttons = Array.from(
      item.host.querySelectorAll<HTMLButtonElement>('.cover-title-size-options button'),
    )
    expect(item.host.textContent).toContain('请先在第一页添加主标题（H1）')
    expect(buttons[0].disabled).toBe(false)
    expect(buttons.slice(1).every((button) => button.disabled)).toBe(true)
    await act(async () => buttons[1].click())
    expect(item.props.onCoverTitleFontSizeChange).not.toHaveBeenCalled()
    await act(async () => buttons[0].click())
    expect(item.props.onCoverTitleFontSizeChange).toHaveBeenCalledWith(undefined)

    await item.rerender({ hasCoverTitle: true })
    expect(buttons.every((button) => !button.disabled)).toBe(true)
  })
})

describe('ContextInspector keyword emphasis', () => {
  it('offers exactly five named colors and sends only the chosen color to the callback', async () => {
    const item = await mountInspector({
      textSelectionState: { active: true, highlighted: true, opacity: 0.37, style: 'underline', color: '#31C9C1' },
    })
    const swatches = Array.from(item.host.querySelectorAll<HTMLButtonElement>('[aria-label="关键词强调色板"] button'))
    expect(swatches).toHaveLength(5)
    expect(swatches.map((button) => button.getAttribute('aria-label'))).toEqual(TEXT_HIGHLIGHT_COLORS.map((color) => `${color.label} ${color.value}`))
    expect(swatches.every((button) => button.type === 'button')).toBe(true)
    for (const [index, color] of TEXT_HIGHLIGHT_COLORS.entries()) {
      await act(async () => swatches[index].click())
      expect(item.props.onHighlightColor).toHaveBeenNthCalledWith(index + 1, color.value)
      await item.rerender({
        textSelectionState: { active: true, highlighted: true, opacity: 0.37, style: 'underline', color: color.value },
      })
      expect(swatches.map((button) => button.getAttribute('aria-pressed'))).toEqual(TEXT_HIGHLIGHT_COLORS.map((_, selected) => selected === index ? 'true' : 'false'))
      expect(item.host.querySelector('button[aria-label="划线荧光笔"]')?.getAttribute('aria-pressed')).toBe('true')
      expect(item.host.querySelector<HTMLInputElement>('input[aria-label="关键词强调透明度"]')!.value).toBe('37')
    }
    expect(item.props.onHighlightStyle).not.toHaveBeenCalled()
    expect(item.props.onHighlightOpacity).not.toHaveBeenCalled()
    expect(item.props.onClearHighlight).not.toHaveBeenCalled()
  })

  it('shows mixed colors without selecting a swatch and keeps color, style and opacity controls independent', async () => {
    const item = await mountInspector({
      textSelectionState: { active: true, highlighted: true, opacity: 0.25, style: 'underline', color: '#31C9C1', mixedColor: true },
    })
    const swatches = Array.from(item.host.querySelectorAll<HTMLButtonElement>('.highlight-color-palette button'))
    expect(swatches.every((button) => button.getAttribute('aria-pressed') === 'false')).toBe(true)
    expect(item.host.textContent).toContain('多种颜色')
    expect(item.host.querySelector('button[aria-label="划线荧光笔"]')?.getAttribute('aria-pressed')).toBe('true')
    const opacity = item.host.querySelector<HTMLInputElement>('input[aria-label="关键词强调透明度"]')!
    await changeInput(opacity, '42')
    await blurInput(opacity)
    expect(item.props.onHighlightOpacity).toHaveBeenCalledWith(0.42)
    expect(item.props.onHighlightColor).not.toHaveBeenCalled()
    expect(item.props.onHighlightStyle).not.toHaveBeenCalled()
    await act(async () => swatches[2].click())
    expect(item.props.onHighlightColor).toHaveBeenCalledOnce()
    expect(item.props.onHighlightColor).toHaveBeenCalledWith('#F2C94C')
    await item.rerender({
      textSelectionState: { active: true, highlighted: true, opacity: 0.42, style: 'underline', color: '#F2C94C', mixedColor: false },
    })
    expect(item.host.textContent).not.toContain('多种颜色')
    expect(swatches[2].getAttribute('aria-pressed')).toBe('true')
  })

  it('offers the existing apply, opacity and remove actions under the unified name', async () => {
    const item = await mountInspector({
      textSelectionState: { active: true, highlighted: false, opacity: 0.25 },
    })
    expect(item.host.textContent).toContain('关键词强调')
    expect(item.host.textContent).toContain('支持标题和正文')
    expect(item.host.textContent).not.toContain('正文荧光笔')
    const apply = Array.from(item.host.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent === '应用 25% 关键词强调')!
    await act(async () => apply.click())
    expect(item.props.onHighlightOpacity).toHaveBeenCalledWith(0.25)

    await item.rerender({
      textSelectionState: { active: true, highlighted: true, opacity: 0.25 },
    })
    const opacity = item.host.querySelector<HTMLInputElement>(
      'input[aria-label="关键词强调透明度"]',
    )!
    await changeInput(opacity, '40')
    await blurInput(opacity)
    expect(item.props.onHighlightOpacity).toHaveBeenLastCalledWith(0.4)
    const remove = Array.from(item.host.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent === '移除关键词强调')!
    await act(async () => remove.click())
    expect(item.props.onClearHighlight).toHaveBeenCalledOnce()
  })

  it('exposes both emphasis styles as distinct toggles and forwards only the selected style', async () => {
    const item = await mountInspector({
      textSelectionState: { active: true, highlighted: true, opacity: 0.25, style: 'background' },
    })
    const background = item.host.querySelector<HTMLButtonElement>('button[aria-label="整块底色"]')!
    const underline = item.host.querySelector<HTMLButtonElement>('button[aria-label="划线荧光笔"]')!
    expect(background.getAttribute('aria-pressed')).toBe('true')
    expect(underline.getAttribute('aria-pressed')).toBe('false')
    expect(background.type).toBe('button')
    expect(underline.type).toBe('button')
    expect(item.host.querySelector('[role="group"][aria-label="荧光笔样式"]')).not.toBeNull()

    await act(async () => underline.click())
    expect(item.props.onHighlightStyle).toHaveBeenCalledOnce()
    expect(item.props.onHighlightStyle).toHaveBeenLastCalledWith('underline')
    expect(item.props.onHighlightOpacity).not.toHaveBeenCalled()
    expect(item.props.onClearHighlight).not.toHaveBeenCalled()
    await item.rerender({
      textSelectionState: { active: true, highlighted: true, opacity: 0.25, style: 'underline' },
    })
    expect(background.getAttribute('aria-pressed')).toBe('false')
    expect(underline.getAttribute('aria-pressed')).toBe('true')
    expect(item.host.querySelector('[aria-label="关键词强调色板"] button[aria-pressed="true"]')?.getAttribute('aria-label')).toBe('青绿 #31C9C1')
    expect(item.host.querySelector<HTMLInputElement>('input[aria-label="关键词强调透明度"]')!.value).toBe('25')

    await act(async () => background.click())
    expect(item.props.onHighlightStyle).toHaveBeenLastCalledWith('background')
  })

  it('shows mixed styles without falsely selecting a toggle and keeps opacity edits separate from style changes', async () => {
    const item = await mountInspector({
      textSelectionState: {
        active: true,
        highlighted: true,
        opacity: 0.25,
        style: 'background',
        mixedStyle: true,
      },
    })
    const options = Array.from(item.host.querySelectorAll<HTMLButtonElement>('.highlight-style-options button'))
    expect(options).toHaveLength(2)
    expect(options.every((button) => button.getAttribute('aria-pressed') === 'false')).toBe(true)
    expect(item.host.textContent).toContain('选区含多种强调样式')
    expect(item.host.textContent).toContain('调整透明度会保留各自样式')
    const opacity = item.host.querySelector<HTMLInputElement>('input[aria-label="关键词强调透明度"]')!
    await changeInput(opacity, '37')
    await blurInput(opacity)
    expect(item.props.onHighlightOpacity).toHaveBeenCalledOnce()
    expect(item.props.onHighlightOpacity).toHaveBeenCalledWith(0.37)
    expect(item.props.onHighlightStyle).not.toHaveBeenCalled()

    await item.rerender({
      textSelectionState: { active: true, highlighted: true, opacity: 0.37, style: 'underline', mixedStyle: false },
    })
    expect(item.host.textContent).not.toContain('选区含多种强调样式')
    expect(options[1].getAttribute('aria-pressed')).toBe('true')
  })

  it('shows instructions without an action when no text is selected', async () => {
    const { host, props } = await mountInspector()
    expect(host.textContent).toContain('请先选中标题或正文中的词')
    expect(host.querySelector('input[aria-label="关键词强调透明度"]')).toBeNull()
    expect(host.querySelector('.highlight-style-options')).toBeNull()
    expect(props.onHighlightOpacity).not.toHaveBeenCalled()
    expect(props.onHighlightStyle).not.toHaveBeenCalled()
  })
})

describe('ContextInspector system fonts', () => {
  it('labels all four font controls and shows one shared note while any system font is selected', async () => {
    const item = await mountInspector({
      fontH1: SYSTEM_FONT_STACK,
      fontH2: SYSTEM_FONT_STACK,
      fontH3: SYSTEM_FONT_STACK,
      fontBody: SYSTEM_FONT_STACK,
    })
    for (const label of ['H1 全局样式', 'H2 全局样式', 'H3 全局样式', '正文全局样式']) {
      const control = item.host.querySelector<HTMLButtonElement>(`button[role="combobox"][aria-label="${label}"]`)!
      expect(control).not.toBeNull()
      expect(control.textContent).toContain('系统字体 · 随设备')
      expect(control.textContent).not.toContain('✓')
      expect(control.textContent).not.toContain('✗')
      expect(control.closest('.font-field')!.querySelector('.font-local-note')).toBeNull()
      expect(control.closest('details')).toBeNull()
      expect(control.closest('[hidden]')).toBeNull()
    }
    expect(item.host.querySelectorAll('.font-local-note')).toHaveLength(1)
    const note = item.host.querySelector('.font-local-note')!
    expect(note.textContent).toBe(SYSTEM_FONT_OPTION.note)
    expect(note.parentElement?.classList.contains('inspector-card-body')).toBe(true)
    expect(note.previousElementSibling?.classList.contains('font-field')).toBe(true)
    expect(note.nextElementSibling?.textContent).toContain('打开字体库')
    expect(item.host.textContent).toContain('换机后外观和换行可能不同')

    await item.rerender({ fontH1: DEFAULT_THEME.fontH1 })
    expect(item.host.querySelectorAll('.font-local-note')).toHaveLength(1)
    await item.rerender({ fontH2: DEFAULT_THEME.fontH2, fontH3: DEFAULT_THEME.fontH3 })
    expect(item.host.querySelectorAll('.font-local-note')).toHaveLength(1)
    await item.rerender({ fontBody: DEFAULT_THEME.fontBody })
    expect(item.host.querySelector('.font-local-note')).toBeNull()
    expect(item.props.onFontH1).not.toHaveBeenCalled()
    expect(item.props.onFontH2).not.toHaveBeenCalled()
    expect(item.props.onFontH3).not.toHaveBeenCalled()
    expect(item.props.onFontBody).not.toHaveBeenCalled()
  })
})

describe('ContextInspector background retries', () => {
  it('forwards cover and inner retry intent separately', async () => {
    const onRetryResources = vi.fn()
    const { host } = await mountInspector({
      onRetryResources,
      resourceIssues: [
        {
          id: 'background:cover:missing',
          label: '首图背景',
          message: '素材丢失',
          backgroundRole: 'cover',
        },
        {
          id: 'background:inner:missing',
          label: '内页背景',
          message: '素材丢失',
          backgroundRole: 'inner',
        },
      ],
    }, '外观')

    const coverRetry = host.querySelector<HTMLButtonElement>(
      'button[aria-label="重新载入首图背景"]',
    )
    const innerRetry = host.querySelector<HTMLButtonElement>(
      'button[aria-label="重新载入内页背景"]',
    )
    expect(coverRetry).not.toBeNull()
    expect(innerRetry).not.toBeNull()

    await act(async () => coverRetry!.click())
    await act(async () => innerRetry!.click())

    expect(onRetryResources).toHaveBeenNthCalledWith(1, 'cover')
    expect(onRetryResources).toHaveBeenNthCalledWith(2, 'inner')
  })
})
