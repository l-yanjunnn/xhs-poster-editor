import { beforeEach, describe, expect, it, vi } from 'vitest'
import html2canvas from 'html2canvas-pro'
import { pageToPngCanvas, removePreviewOnlyElements } from './exportPng'

vi.mock('html2canvas-pro', () => ({ default: vi.fn() }))

const mockedHtml2Canvas = vi.mocked(html2canvas)

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
  function deterministicAtom(id: string, text: string): string {
    return `<span
      class="dtl-atom"
      data-layout-atom="${id}"
      data-layout-line="0"
      data-layout-line-top="0.000"
      data-layout-top="0.000"
      data-layout-baseline="16.000"
      data-layout-native-baseline="16.000"
      style="position:absolute;top:0px;width:20px;height:32px;line-height:32px;font-size:20px"
    ><span class="dtl-glyph" style="font-size:20px">${text}</span></span>`
  }

  it('原样复用预览封存的光学快照截图，全程不修改源 React 页面', async () => {
    const order: string[] = []
    const source = document.createElement('div')
    source.className = 'page'
    source.dataset.layoutSnapshot = 'snapshot-a'
    source.dataset.layoutState = 'ready'
    source.dataset.layoutIssueCount = '0'
    source.dataset.layoutSnapshotPhase = 'sealed'
    source.innerHTML = '<div class="content"><h2>提出对策题</h2></div>'
    document.body.appendChild(source)

    mockedHtml2Canvas.mockImplementation(async (cloned) => {
      order.push('html2canvas')
      expect(cloned).not.toBe(source)
      expect(cloned.parentElement?.hasAttribute('data-export-stage')).toBe(true)
      return document.createElement('canvas')
    })

    let canvas: HTMLCanvasElement
    try {
      canvas = await pageToPngCanvas(source)
    } finally {
      source.remove()
    }

    expect(order).toEqual(['html2canvas'])
    expect(source.querySelector('h2')?.getAttribute('style')).toBeNull()
    expect(document.querySelector('[data-export-stage]')).toBeNull()
    expect(canvas!.dataset.layoutSnapshot).toBe('snapshot-a')
    expect(canvas!.dataset.layoutRenderHash).toMatch(/^[0-9a-f]{8}$/u)
  })

  it('对真实非零 atom 生成 baseline 哈希，并把同一哈希传入 iframe/canvas', async () => {
    const source = document.createElement('div')
    source.className = 'page deterministic-text-layout'
    source.dataset.layoutSnapshot = 'snapshot-atoms'
    source.dataset.layoutState = 'ready'
    source.dataset.layoutIssueCount = '0'
    source.dataset.layoutSnapshotPhase = 'sealed'
    source.style.width = '1080px'
    source.style.height = '1800px'
    source.innerHTML = `<div class="content">${deterministicAtom('a0', '甲')}${deterministicAtom('a1', '4')}</div>`
    document.body.appendChild(source)
    const atomRectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function measuredRect(this: HTMLElement) {
        const top = Number.parseFloat(this.style.top) || 0
        const height = Number.parseFloat(this.style.height) || 32
        return {
          bottom: top + height,
          height,
          left: 0,
          right: 20,
          top,
          width: 20,
          x: 0,
          y: top,
          toJSON: () => ({}),
        }
      })
    const rangeRectSpy = vi
      .spyOn(window.Range.prototype, 'getBoundingClientRect')
      .mockReturnValue({
        bottom: 22,
        height: 20,
        left: 0,
        right: 20,
        top: 2,
        width: 20,
        x: 0,
        y: 2,
        toJSON: () => ({}),
      })
    let referencePage: HTMLElement | null = null

    mockedHtml2Canvas.mockImplementation(async (cloned, options) => {
      const clonedDoc = document.implementation.createHTMLDocument('export')
      Object.defineProperty(clonedDoc, 'fonts', {
        configurable: true,
        value: { ready: Promise.resolve() },
      })
      referencePage = cloned.cloneNode(true) as HTMLElement
      clonedDoc.body.appendChild(referencePage)
      await options?.onclone?.(clonedDoc, referencePage)
      return document.createElement('canvas')
    })

    try {
      const canvas = await pageToPngCanvas(source)
      const hash = canvas.dataset.layoutExportBaselineHash
      expect(hash).toMatch(/^[0-9a-f]{8}$/u)
      if (!referencePage) throw new Error('onclone did not capture reference page')
      const capturedReference: HTMLElement = referencePage
      expect(capturedReference.dataset.layoutExportBaselineHash).toBe(hash)
      expect(
        Array.from(
          capturedReference.querySelectorAll<HTMLElement>('.dtl-atom'),
          (atom) => atom.dataset.layoutExportBaselineShift,
        ),
      ).toEqual(['-6.000', '-6.000'])
      expect(source.dataset.layoutExportBaselineHash).toBeUndefined()
      expect(
        Array.from(source.querySelectorAll<HTMLElement>('.dtl-atom'), (atom) =>
          atom.style.top,
        ),
      ).toEqual(['0px', '0px'])
    } finally {
      source.remove()
      rangeRectSpy.mockRestore()
      atomRectSpy.mockRestore()
    }
  })

  it('任一真实 atom baseline 超限时整页拒绝，且不调用 html2canvas', async () => {
    const source = document.createElement('div')
    source.className = 'page deterministic-text-layout'
    source.dataset.layoutSnapshot = 'snapshot-bad-atom'
    source.dataset.layoutState = 'ready'
    source.dataset.layoutIssueCount = '0'
    source.dataset.layoutSnapshotPhase = 'sealed'
    source.style.width = '1080px'
    source.style.height = '1800px'
    source.innerHTML = `<div class="content">${deterministicAtom('a0', '甲')}${deterministicAtom('a1', '4')}</div>`
    document.body.appendChild(source)
    const atomRectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function measuredRect(this: HTMLElement) {
        const top = Number.parseFloat(this.style.top) || 0
        const height = Number.parseFloat(this.style.height) || 32
        return {
          bottom: top + height,
          height,
          left: 0,
          right: 20,
          top,
          width: 20,
          x: 0,
          y: top,
          toJSON: () => ({}),
        }
      })
    const rangeRectSpy = vi
      .spyOn(window.Range.prototype, 'getBoundingClientRect')
      .mockReturnValue({
        bottom: 220,
        height: 20,
        left: 0,
        right: 20,
        top: 200,
        width: 20,
        x: 0,
        y: 200,
        toJSON: () => ({}),
      })

    try {
      await expect(pageToPngCanvas(source)).rejects.toThrow(
        '导出字形基线校准失败：0/2',
      )
      expect(mockedHtml2Canvas).not.toHaveBeenCalled()
      expect(source.dataset.layoutExportBaselineHash).toBeUndefined()
    } finally {
      source.remove()
      rangeRectSpy.mockRestore()
      atomRectSpy.mockRestore()
    }
  })

  it('onclone 只验证本次 referenceElement，且不再次改写光学校准', async () => {
    const source = document.createElement('div')
    source.className = 'page'
    source.dataset.layoutSnapshot = 'snapshot-b'
    source.dataset.layoutState = 'ready'
    source.dataset.layoutIssueCount = '0'
    source.dataset.layoutSnapshotPhase = 'sealed'
    source.innerHTML = '<div class="content"><h2>页面 B</h2></div>'
    document.body.appendChild(source)
    let referencePage: HTMLElement = document.createElement('div')

    mockedHtml2Canvas.mockImplementation(async (cloned, options) => {
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
      referencePage = cloned.cloneNode(true) as HTMLElement
      clonedDoc.body.appendChild(referencePage)

      await options?.onclone?.(clonedDoc, referencePage)
      return document.createElement('canvas')
    })

    try {
      await pageToPngCanvas(source)
    } finally {
      source.remove()
    }

    expect(referencePage.dataset.layoutRenderHash).toMatch(/^[0-9a-f]{8}$/u)
    expect(referencePage.textContent).toContain('页面 B')
    expect(referencePage.textContent).not.toContain('页面 A')
  })

  it('拒绝 pending、font-error 或带布局问题的旧快照', async () => {
    const source = document.createElement('div')
    source.className = 'page'
    source.dataset.layoutSnapshot = 'stale-snapshot'
    source.dataset.layoutState = 'font-error'
    source.dataset.layoutIssueCount = '0'
    document.body.appendChild(source)

    await expect(pageToPngCanvas(source)).rejects.toThrow(
      '页面的确定性排版尚未通过字体与几何预检',
    )
    expect(mockedHtml2Canvas).not.toHaveBeenCalled()
    source.remove()
  })

  function warningOnlyPage(): HTMLDivElement {
    const source = document.createElement('div')
    source.className = 'page'
    source.dataset.layoutSnapshot = 'warning-snapshot'
    source.dataset.layoutState = 'ready-with-warnings'
    source.dataset.layoutIssueCount = '1'
    source.dataset.layoutSnapshotPhase = 'sealed'
    source.dataset.layoutIssues = JSON.stringify([
      {
        code: 'unsatisfied-line',
        blockIndex: 1,
        blockText: '这里面存在着许多看似道不清、言不明的道理。',
        message: '第 1 行在字距/标点上限内无法排入版心',
      },
    ])
    source.innerHTML = '<div class="content"><p>正文</p></div>'
    return source
  }

  it('warning-only 页面：未确认拒绝，allowWarnings 确认后按同一快照渲染', async () => {
    const source = warningOnlyPage()
    document.body.appendChild(source)
    mockedHtml2Canvas.mockImplementation(async () =>
      document.createElement('canvas'),
    )

    try {
      await expect(pageToPngCanvas(source)).rejects.toThrow(
        '页面的确定性排版尚未通过字体与几何预检',
      )
      expect(mockedHtml2Canvas).not.toHaveBeenCalled()

      const canvas = await pageToPngCanvas(source, { allowWarnings: true })
      expect(mockedHtml2Canvas).toHaveBeenCalledTimes(1)
      // 强制导出使用的正是预览封存的同一快照。
      expect(canvas.dataset.layoutSnapshot).toBe('warning-snapshot')
    } finally {
      source.remove()
    }
  })

  it('allowWarnings 不能放行硬阻断：blocking code 或未封存快照仍拒绝', async () => {
    const blockingIssue = warningOnlyPage()
    blockingIssue.dataset.layoutIssues = JSON.stringify([
      {
        code: 'text-mismatch',
        blockIndex: 0,
        blockText: '段落',
        message: '物化排版后的 Unicode 文本与编辑源不一致',
      },
    ])
    document.body.appendChild(blockingIssue)
    await expect(
      pageToPngCanvas(blockingIssue, { allowWarnings: true }),
    ).rejects.toThrow('页面的确定性排版尚未通过字体与几何预检')
    blockingIssue.remove()

    const unsealed = warningOnlyPage()
    unsealed.dataset.layoutSnapshotPhase = 'layout'
    document.body.appendChild(unsealed)
    await expect(
      pageToPngCanvas(unsealed, { allowWarnings: true }),
    ).rejects.toThrow('页面的确定性排版尚未通过字体与几何预检')
    unsealed.remove()

    expect(mockedHtml2Canvas).not.toHaveBeenCalled()
  })
})
