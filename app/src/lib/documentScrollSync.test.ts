import { describe, expect, it } from 'vitest'
import {
  anchorAtScrollTop,
  measureEditorGeometry,
  measurePreviewGeometry,
  scrollTopForAnchor,
  structureSignature,
  type SideGeometry,
} from './documentScrollSync'

// 视口 600、无 sticky 遮挡：scrollTop=0 时视口中心在 300
const flat = (pages: SideGeometry['pages']): SideGeometry => ({
  viewportHeight: 600,
  scrollHeight: 3000,
  headerOffset: 0,
  pages,
})

const threePages: SideGeometry = flat([
  {
    top: 0,
    height: 500,
    blocks: [
      { top: 0, height: 100 },
      { top: 100, height: 200 },
      { top: 300, height: 200 },
    ],
  },
  { top: 550, height: 400, blocks: [{ top: 550, height: 400 }] },
  {
    top: 1000,
    height: 2000,
    blocks: [
      { top: 1000, height: 1000 },
      { top: 2000, height: 1000 },
    ],
  },
])

describe('anchorAtScrollTop', () => {
  it('视口中心命中块内时返回该块与块内进度', () => {
    // center = 300 → 第 0 页第 2 块 [300, 500) 的起点
    const anchor = anchorAtScrollTop(threePages, 0)
    expect(anchor).toEqual({
      pageIndex: 0,
      blockIndex: 2,
      blockProgress: 0,
    })
  })

  it('长块用 blockProgress 保留块内进度，不只跳到块首', () => {
    // center = 1200 + 300 = 1500 → 第 2 页第 0 块 [1000, 2000) 的 50%
    const anchor = anchorAtScrollTop(threePages, 1200)
    expect(anchor).toEqual({
      pageIndex: 2,
      blockIndex: 0,
      blockProgress: 0.5,
    })
  })

  it('中心落在页间空白时取几何距离最近的块', () => {
    // center = 210 + 300 = 510 → 距第 0 页末块底(500) 10、距第 1 页块顶(550) 40
    const anchor = anchorAtScrollTop(threePages, 210)
    expect(anchor?.pageIndex).toBe(0)
    expect(anchor?.blockIndex).toBe(2)
    expect(anchor?.blockProgress).toBe(1)
  })

  it('距离相同固定选择后一个，避免同一位置来回翻转', () => {
    // center = 225 + 300 = 525 → 距上块底与下块顶均为 25 → 取后者
    const anchor = anchorAtScrollTop(threePages, 225)
    expect(anchor?.pageIndex).toBe(1)
    expect(anchor?.blockIndex).toBe(0)
    expect(anchor?.blockProgress).toBe(0)
  })

  it('空页退化为页级锚点（blockIndex = -1）', () => {
    const geometry = flat([
      { top: 0, height: 100, blocks: [{ top: 0, height: 100 }] },
      { top: 150, height: 700, blocks: [] },
      { top: 900, height: 100, blocks: [{ top: 900, height: 100 }] },
    ])
    // center = 200 + 300 = 500 → 空页区间 [150, 850) 内部
    const anchor = anchorAtScrollTop(geometry, 200)
    expect(anchor).toEqual({
      pageIndex: 1,
      blockIndex: -1,
      blockProgress: 0.5,
    })
  })

  it('无页时返回 null', () => {
    expect(anchorAtScrollTop(flat([]), 0)).toBeNull()
  })

  it('headerOffset 参与可视中心计算', () => {
    const geometry = { ...threePages, headerOffset: 58 }
    // center = 0 + 58 + (600-58)/2 = 329 → 仍在第 0 页第 2 块 [300,500)
    const anchor = anchorAtScrollTop(geometry, 0)
    expect(anchor?.blockIndex).toBe(2)
    expect(anchor?.blockProgress).toBeCloseTo((329 - 300) / 200, 5)
  })
})

describe('scrollTopForAnchor', () => {
  it('与 anchorAtScrollTop 构成往返：同一几何投影回原 scrollTop', () => {
    const scrollTop = 1200
    const anchor = anchorAtScrollTop(threePages, scrollTop)!
    const target = scrollTopForAnchor(threePages, anchor)!
    expect(target.scrollTop).toBeCloseTo(scrollTop, 5)
    expect(target.saturated).toBe(false)
  })

  it('异构几何按锚点语义投影（同块同进度，不同像素）', () => {
    // 目标侧同结构但块高不同（模拟中央画布缩放后的几何）
    const other: SideGeometry = {
      viewportHeight: 800,
      scrollHeight: 4000,
      headerOffset: 58,
      pages: [
        {
          top: 0,
          height: 900,
          blocks: [
            { top: 0, height: 300 },
            { top: 300, height: 300 },
            { top: 600, height: 300 },
          ],
        },
        { top: 1000, height: 600, blocks: [{ top: 1000, height: 600 }] },
        {
          top: 1700,
          height: 2000,
          blocks: [
            { top: 1700, height: 800 },
            { top: 2500, height: 1200 },
          ],
        },
      ],
    }
    // 源侧 center=1500 → 页2块0进度0.5 → 目标中心 1700 + 800*0.5 = 2100
    const anchor = anchorAtScrollTop(threePages, 1200)!
    const target = scrollTopForAnchor(other, anchor)!
    // scrollTop = 2100 - 58 - (800-58)/2 = 1671
    expect(target.scrollTop).toBeCloseTo(2100 - 58 - (800 - 58) / 2, 5)
  })

  it('目标越过首尾时 clamp 并标记 saturated', () => {
    const anchor = { pageIndex: 0, blockIndex: 0, blockProgress: 0 }
    const top = scrollTopForAnchor(threePages, anchor)!
    expect(top.scrollTop).toBe(0)
    expect(top.saturated).toBe(true)

    const deep = { pageIndex: 2, blockIndex: 1, blockProgress: 1 }
    const bottom = scrollTopForAnchor(threePages, deep)!
    expect(bottom.scrollTop).toBe(3000 - 600)
    expect(bottom.saturated).toBe(true)
  })

  it('目标结构变短时钳到最后一页/最后一块，不抛错', () => {
    const anchor = { pageIndex: 9, blockIndex: 9, blockProgress: 0.5 }
    const target = scrollTopForAnchor(threePages, anchor)
    expect(target).not.toBeNull()
    // 钳到第 2 页最后一块 [2000, 3000) 的 50% = 2500
    expect(target!.scrollTop).toBeCloseTo(2500 - 300, 5)
  })

  it('空页锚点投影到整页区间', () => {
    const geometry = flat([
      { top: 0, height: 100, blocks: [{ top: 0, height: 100 }] },
      { top: 150, height: 700, blocks: [] },
    ])
    const target = scrollTopForAnchor(geometry, {
      pageIndex: 1,
      blockIndex: -1,
      blockProgress: 0.5,
    })!
    expect(target.scrollTop).toBeCloseTo(150 + 350 - 300, 5)
  })
})

describe('structureSignature', () => {
  it('页数与每页块数一致才相等', () => {
    expect(structureSignature(threePages)).toBe('3:3,1,2')
    const mutated = flat([
      ...threePages.pages.slice(0, 2),
      { ...threePages.pages[2], blocks: threePages.pages[2].blocks.slice(1) },
    ])
    expect(structureSignature(mutated)).not.toBe(
      structureSignature(threePages),
    )
  })
})

// ---------------------------------------------------------------------------
// DOM 测量（jsdom 无真实排版，用 stub rect 验证结构切分与坐标换算）
// ---------------------------------------------------------------------------

function stubRect(element: HTMLElement, top: number, height: number) {
  element.getBoundingClientRect = () =>
    ({
      top,
      bottom: top + height,
      height,
      left: 0,
      right: 100,
      width: 100,
      x: 0,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect
}

describe('measureEditorGeometry', () => {
  it('按根级 hr.page-break 划页并排除 ProseMirror 辅助节点', () => {
    const scrollArea = document.createElement('div')
    stubRect(scrollArea, 0, 600)
    Object.defineProperty(scrollArea, 'scrollTop', { value: 50 })
    Object.defineProperty(scrollArea, 'clientHeight', { value: 600 })
    Object.defineProperty(scrollArea, 'scrollHeight', { value: 2000 })

    const root = document.createElement('div')
    const p1 = document.createElement('p')
    stubRect(p1, 10, 40)
    const gapcursor = document.createElement('div')
    gapcursor.className = 'ProseMirror-gapcursor'
    stubRect(gapcursor, 0, 0)
    const hr = document.createElement('hr')
    hr.className = 'page-break'
    stubRect(hr, 60, 10)
    const hr2 = document.createElement('hr')
    hr2.className = 'page-break'
    stubRect(hr2, 80, 10)
    const p2 = document.createElement('p')
    stubRect(p2, 100, 60)
    root.append(p1, gapcursor, hr, hr2, p2)

    const geometry = measureEditorGeometry(scrollArea, root)
    expect(structureSignature(geometry)).toBe('3:1,0,1')
    // 滚动坐标 = 视口坐标 + scrollTop(50)
    expect(geometry.pages[0].blocks[0]).toEqual({ top: 60, height: 40 })
    // 空页区间 = 上一分页符下缘 → 下一分页符上缘
    expect(geometry.pages[1].top).toBe(120)
    expect(geometry.pages[1].height).toBe(10)
    expect(geometry.pages[2].blocks[0]).toEqual({ top: 150, height: 60 })
    expect(geometry.headerOffset).toBe(0)
  })

  it('装饰分隔线 hr.divider 是普通块，不划页', () => {
    const scrollArea = document.createElement('div')
    stubRect(scrollArea, 0, 600)
    Object.defineProperty(scrollArea, 'clientHeight', { value: 600 })
    Object.defineProperty(scrollArea, 'scrollHeight', { value: 900 })
    const root = document.createElement('div')
    const divider = document.createElement('hr')
    divider.className = 'divider'
    stubRect(divider, 0, 10)
    root.append(divider)
    const geometry = measureEditorGeometry(scrollArea, root)
    expect(structureSignature(geometry)).toBe('1:1')
  })
})

describe('measurePreviewGeometry', () => {
  it('读取 .page 与 .content 根级子块，跳过未挂载页', () => {
    const panel = document.createElement('div')
    stubRect(panel, 100, 700)
    Object.defineProperty(panel, 'scrollTop', { value: 20 })
    Object.defineProperty(panel, 'clientHeight', { value: 700 })
    Object.defineProperty(panel, 'scrollHeight', { value: 1600 })

    const page = document.createElement('div')
    page.className = 'page'
    stubRect(page, 160, 720)
    const content = document.createElement('div')
    content.className = 'content'
    const h1 = document.createElement('h1')
    stubRect(h1, 200, 50)
    content.append(h1)
    page.append(content)
    document.body.append(panel, page)

    const geometry = measurePreviewGeometry(panel, [page, null], 58)
    expect(geometry.pages).toHaveLength(1)
    expect(geometry.pages[0].top).toBe(160 - 100 + 20)
    expect(geometry.pages[0].blocks[0]).toEqual({
      top: 200 - 100 + 20,
      height: 50,
    })
    expect(geometry.headerOffset).toBe(58)
    page.remove()
    panel.remove()
  })
})
