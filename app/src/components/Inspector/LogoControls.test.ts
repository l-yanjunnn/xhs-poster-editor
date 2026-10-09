import { act, createElement, type ComponentProps } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { LogoControls } from './LogoControls'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

it('selects the Logo target page and reflects that page’s visibility while keeping the picker optional', async () => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const onPage = vi.fn()
  const props: ComponentProps<typeof LogoControls> = {
    pageIndex: 0,
    onPage,
    overrides: ['inherit', 'show', 'hide'],
    strategy: 'every',
    coverPosition: 'visible-area',
    themeClass: '',
    logoSrc: '',
    hasAsset: true,
    onStrategy: vi.fn(),
    onCoverPosition: vi.fn(),
    onVisibility: vi.fn(),
    onReset: vi.fn(),
    onPick: vi.fn(),
    cropGuideOn: false,
    onCropGuide: vi.fn(),
  }
  try {
    await act(async () => root.render(createElement(LogoControls, props)))
    const picker = host.querySelector<HTMLSelectElement>('select[aria-label="设置 Logo 所在页"]')!
    expect(Array.from(picker.options, option => [option.value, option.text])).toEqual([
      ['0', '第 1 页 · 封面'], ['1', '第 2 页 · 内页'], ['2', '第 3 页 · 内页'],
    ])
    expect(picker.value).toBe('0')
    expect(host.querySelector('.layout-scope')?.textContent).toBe('仅第 1 页 · 封面当前显示')
    expect(host.querySelector('#cover-logo-label')).not.toBeNull()

    await act(async () => {
      picker.value = '2'
      picker.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(onPage).toHaveBeenCalledExactlyOnceWith(2)
    expect(props.onVisibility).not.toHaveBeenCalled()
    await act(async () => root.render(createElement(LogoControls, { ...props, pageIndex: 2 })))
    expect(picker.value).toBe('2')
    expect(host.querySelector('.layout-scope')?.textContent).toBe('仅第 3 页当前隐藏')
    expect(host.querySelector('[aria-labelledby="page-logo-label"]')?.textContent).toBe('隐藏')
    expect(host.querySelector('#cover-logo-label')).toBeNull()

    await act(async () => root.render(createElement(LogoControls, { ...props, onPage: undefined })))
    expect(host.querySelector('select[aria-label="设置 Logo 所在页"]')).toBeNull()
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})
