import { describe, expect, it } from 'vitest'
import { removePreviewOnlyElements } from './exportPng'

describe('removePreviewOnlyElements', () => {
  it('剥离裁切遮罩和参考线，但保留正文', () => {
    const page = document.createElement('div')
    page.innerHTML = `
      <div class="content"><p>正文</p></div>
      <div data-preview-only><span>3:4 裁切参考</span></div>
      <div class="guide guide-v"></div>
    `

    removePreviewOnlyElements(page)

    expect(page.querySelector('[data-preview-only]')).toBeNull()
    expect(page.querySelector('.guide')).toBeNull()
    expect(page.querySelector('.content')?.textContent).toBe('正文')
  })
})
