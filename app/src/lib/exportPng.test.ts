import { beforeEach, describe, expect, it, vi } from 'vitest'
import html2canvas from 'html2canvas-pro'
import { calibratePageTypography } from './opticalTypography'
import { pageToPngCanvas, removePreviewOnlyElements } from './exportPng'

vi.mock('html2canvas-pro', () => ({ default: vi.fn() }))
vi.mock('./opticalTypography', () => ({
  calibratePageTypography: vi.fn(),
}))

const mockedHtml2Canvas = vi.mocked(html2canvas)
const mockedCalibrateTypography = vi.mocked(calibratePageTypography)

beforeEach(() => {
  vi.clearAllMocks()
})

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

describe('pageToPngCanvas typography stage', () => {
  it('先校准离屏 deep clone 再截图，全程不修改源 React 页面', async () => {
    const order: string[] = []
    const source = document.createElement('div')
    source.className = 'page'
    source.innerHTML = '<div class="content"><h2>提出对策题</h2></div>'
    document.body.appendChild(source)

    mockedCalibrateTypography.mockImplementation(async (cloned) => {
      order.push('calibrate')
      expect(cloned).not.toBe(source)
      expect(cloned.parentElement?.hasAttribute('data-export-stage')).toBe(true)
      cloned.setAttribute('data-calibrated-for-export', '')
      return {
        status: 'ready',
        h2Count: 1,
        markerCount: 0,
        fontIssues: [],
      }
    })
    mockedHtml2Canvas.mockImplementation(async (cloned) => {
      order.push('html2canvas')
      expect(cloned.hasAttribute('data-calibrated-for-export')).toBe(true)
      return document.createElement('canvas')
    })

    try {
      await pageToPngCanvas(source)
    } finally {
      source.remove()
    }

    expect(order).toEqual(['calibrate', 'html2canvas'])
    expect(source.hasAttribute('data-calibrated-for-export')).toBe(false)
    expect(source.querySelector('h2')?.getAttribute('style')).toBeNull()
    expect(document.querySelector('[data-export-stage]')).toBeNull()
    expect(mockedCalibrateTypography).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      {
        fontTimeoutMs: 5_000,
        recalibrateOnLateFonts: false,
        renderTarget: 'html2canvas',
      },
    )
  })

  it('onclone 只校准 html2canvas 传入的本次 referenceElement', async () => {
    const source = document.createElement('div')
    source.className = 'page'
    source.innerHTML = '<div class="content"><h2>页面 B</h2></div>'
    document.body.appendChild(source)
    let referencePage: HTMLElement | null = null

    mockedCalibrateTypography.mockResolvedValue({
      status: 'ready',
      h2Count: 1,
      markerCount: 0,
      fontIssues: [],
    })
    mockedHtml2Canvas.mockImplementation(async (_cloned, options) => {
      const clonedDoc = document.implementation.createHTMLDocument('export')
      Object.defineProperty(clonedDoc, 'fonts', {
        configurable: true,
        value: { ready: Promise.resolve() },
      })
      const wrongStage = clonedDoc.createElement('div')
      wrongStage.setAttribute('data-export-stage', '')
      wrongStage.innerHTML =
        '<div class="page"><div class="content"><h2>页面 A</h2></div></div>'
      clonedDoc.body.appendChild(wrongStage)
      referencePage = clonedDoc.createElement('div')
      referencePage.className = 'page'
      referencePage.innerHTML =
        '<div class="content"><h2>页面 B</h2></div>'
      clonedDoc.body.appendChild(referencePage)

      await options?.onclone?.(clonedDoc, referencePage)
      return document.createElement('canvas')
    })

    try {
      await pageToPngCanvas(source)
    } finally {
      source.remove()
    }

    expect(referencePage).not.toBeNull()
    expect(mockedCalibrateTypography).toHaveBeenCalledTimes(2)
    expect(mockedCalibrateTypography.mock.calls[1]?.[0]).toBe(referencePage)
    expect(
      mockedCalibrateTypography.mock.calls[1]?.[0].textContent,
    ).toContain('页面 B')
    expect(
      mockedCalibrateTypography.mock.calls[1]?.[0].textContent,
    ).not.toContain('页面 A')
  })
})
