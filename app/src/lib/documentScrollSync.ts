// v1.8.0 长文双向滚动联动的纯映射层（REQ-LONGDOC-SCROLL-SYNC）。
//
// 采用「视口中心语义锚点」而非全文滚动百分比：左侧 Tiptap 与中央 1080×1800
// 多页画布总高度并非线性对应，裸百分比会随标题/列表/图片/页间距持续漂移。
// 锚点 = (页序, 页内顶层块序, 块内进度)，两侧 DOM 同源、顶层顺序一致，
// 因此临时 (pageIndex, blockIndex) 已够用，不为滚动功能升级文档 schema。
//
// 本文件只做几何数学与 DOM 测量，不持有任何状态、不写 scrollTop；
// 主控权/rAF/防回环在 useDocumentScrollSync 协调层。

export interface DocumentScrollAnchor {
  pageIndex: number
  /** -1 = 页级锚点（空页退化：连续分页符/首尾分页产生的无块页面） */
  blockIndex: number
  /** 0..1，视口中心位于目标块（或空页）内部的相对位置 */
  blockProgress: number
}

export interface BlockGeometry {
  /** 滚动容器坐标系（content 坐标 = 视口坐标 + scrollTop），已含缩放 */
  top: number
  height: number
}

export interface PageGeometry {
  top: number
  height: number
  blocks: BlockGeometry[]
}

export interface SideGeometry {
  viewportHeight: number
  scrollHeight: number
  /** sticky 标题等遮挡高度；可视中心按 (viewportHeight - headerOffset) 计算 */
  headerOffset: number
  pages: PageGeometry[]
}

export interface AnchorScrollTarget {
  scrollTop: number
  /** 目标位置被首尾 clamp：协调层只确认事务，不反向纠偏，避免顶/底回弹 */
  saturated: boolean
}

/** 页数 + 每页顶层块数。左右签名不一致说明一侧 DOM 落后，跳帧重试。 */
export function structureSignature(geometry: SideGeometry): string {
  return `${geometry.pages.length}:${geometry.pages
    .map((page) => page.blocks.length)
    .join(',')}`
}

function visibleCenter(geometry: SideGeometry, scrollTop: number): number {
  const visibleHeight = Math.max(
    geometry.viewportHeight - geometry.headerOffset,
    0,
  )
  return scrollTop + geometry.headerOffset + visibleHeight / 2
}

function progressWithin(center: number, top: number, height: number): number {
  if (height <= 0) return 0
  return Math.min(Math.max((center - top) / height, 0), 1)
}

/** 区间外距离；区间内为 0 */
function intervalDistance(center: number, top: number, height: number): number {
  if (center < top) return top - center
  const bottom = top + Math.max(height, 0)
  if (center > bottom) return center - bottom
  return 0
}

/**
 * 由当前 scrollTop 求视口中心锚点。
 * 中心未命中任何块时取几何距离最近的块或空页；距离相同固定取后一个，
 * 避免同一位置来回翻转。空数据返回 null，协调层保持静止。
 */
export function anchorAtScrollTop(
  geometry: SideGeometry,
  scrollTop: number,
): DocumentScrollAnchor | null {
  if (geometry.pages.length === 0) return null
  const center = visibleCenter(geometry, scrollTop)

  let best: {
    distance: number
    pageIndex: number
    blockIndex: number
    top: number
    height: number
  } | null = null
  for (let pageIndex = 0; pageIndex < geometry.pages.length; pageIndex += 1) {
    const page = geometry.pages[pageIndex]
    const candidates =
      page.blocks.length > 0
        ? page.blocks.map((block, blockIndex) => ({ ...block, blockIndex }))
        : [{ top: page.top, height: page.height, blockIndex: -1 }]
    for (const candidate of candidates) {
      const distance = intervalDistance(center, candidate.top, candidate.height)
      // `<=`：距离相同选择后一个（文档序更靠后的候选），保证方向稳定
      if (best === null || distance <= best.distance) {
        best = {
          distance,
          pageIndex,
          blockIndex: candidate.blockIndex,
          top: candidate.top,
          height: candidate.height,
        }
      }
      // 命中即最优（距离 0 且我们偏向后者，但继续扫完同距候选代价高；
      // 距离 0 后仍可能有同样距离 0 的重叠后者，继续循环保持规则一致）
    }
  }
  if (best === null) return null
  return {
    pageIndex: best.pageIndex,
    blockIndex: best.blockIndex,
    blockProgress: progressWithin(center, best.top, best.height),
  }
}

/**
 * 把锚点投影为目标容器 scrollTop（手算 + clamp，不用 scrollIntoView，
 * 避免连带滚动祖先容器）。目标结构变短时逐级退化：块序钳到本页最后一块，
 * 页序钳到最后一页；空页用整页区间。
 */
export function scrollTopForAnchor(
  geometry: SideGeometry,
  anchor: DocumentScrollAnchor,
): AnchorScrollTarget | null {
  if (geometry.pages.length === 0) return null
  const pageIndex = Math.min(
    Math.max(anchor.pageIndex, 0),
    geometry.pages.length - 1,
  )
  const page = geometry.pages[pageIndex]
  let target: { top: number; height: number }
  if (anchor.blockIndex >= 0 && page.blocks.length > 0) {
    const blockIndex = Math.min(anchor.blockIndex, page.blocks.length - 1)
    target = page.blocks[blockIndex]
  } else {
    target = { top: page.top, height: page.height }
  }

  const targetCenter =
    target.top + Math.max(target.height, 0) * anchor.blockProgress
  const visibleHeight = Math.max(
    geometry.viewportHeight - geometry.headerOffset,
    0,
  )
  const raw = targetCenter - geometry.headerOffset - visibleHeight / 2
  const maxScrollTop = Math.max(
    geometry.scrollHeight - geometry.viewportHeight,
    0,
  )
  const clamped = Math.min(Math.max(raw, 0), maxScrollTop)
  return { scrollTop: clamped, saturated: Math.abs(clamped - raw) > 0.5 }
}

// ---------------------------------------------------------------------------
// DOM 测量。返回滚动容器坐标（rect.top - containerRect.top + scrollTop），
// 天然吸收中央画布的 transform: scale——getBoundingClientRect 即视觉坐标。
// ---------------------------------------------------------------------------

function toScrollCoord(
  rect: DOMRect,
  containerRect: DOMRect,
  scrollTop: number,
): BlockGeometry {
  return {
    top: rect.top - containerRect.top + scrollTop,
    height: rect.height,
  }
}

function isPageBreak(element: Element): boolean {
  return element.tagName === 'HR' && element.classList.contains('page-break')
}

/** ProseMirror 自身的光标/拖拽辅助节点不是语义块，两侧结构签名必须排除 */
function isEditorArtifact(element: Element): boolean {
  for (const cls of Array.from(element.classList)) {
    if (cls.startsWith('ProseMirror-')) return true
  }
  return false
}

/**
 * 左侧几何：按 `.ProseMirror` 根级子节点划块，根级 `hr.page-break` 划页。
 * 空页（连续分页符）用前后边界构成退化区间，与 splitIntoPages 的页数语义一致。
 */
export function measureEditorGeometry(
  scrollArea: HTMLElement,
  editorRoot: HTMLElement,
): SideGeometry {
  const containerRect = scrollArea.getBoundingClientRect()
  const scrollTop = scrollArea.scrollTop
  const pages: PageGeometry[] = []
  let blocks: BlockGeometry[] = []
  // 空页区间的起点：上一个分页符的下缘（首页则为内容区顶部）
  let pageStart: number | null = null

  const finishPage = (end: number) => {
    const top = blocks.length > 0 ? blocks[0].top : (pageStart ?? end)
    const bottom =
      blocks.length > 0
        ? blocks[blocks.length - 1].top + blocks[blocks.length - 1].height
        : end
    pages.push({ top, height: Math.max(bottom - top, 0), blocks })
    blocks = []
  }

  for (const child of Array.from(editorRoot.children)) {
    if (!(child instanceof HTMLElement) || isEditorArtifact(child)) continue
    const rect = toScrollCoord(
      child.getBoundingClientRect(),
      containerRect,
      scrollTop,
    )
    if (isPageBreak(child)) {
      finishPage(rect.top)
      pageStart = rect.top + rect.height
    } else {
      blocks.push(rect)
      if (pageStart === null) pageStart = rect.top
    }
  }
  // end 仅在末页为空页时生效（尾随分页符 → 退化为零高区间）
  finishPage(pageStart ?? 0)

  return {
    viewportHeight: scrollArea.clientHeight,
    scrollHeight: scrollArea.scrollHeight,
    headerOffset: 0,
    pages,
  }
}

/**
 * 中央画布几何：每页 `.page` 元素 + 其 `.content` 根级子节点。
 * headerOffset 由调用方用 sticky 标题的真实 rect 高度传入（不硬编码 58px）。
 */
export function measurePreviewGeometry(
  scrollPanel: HTMLElement,
  pageElements: Array<HTMLElement | null>,
  headerOffset: number,
): SideGeometry {
  const containerRect = scrollPanel.getBoundingClientRect()
  const scrollTop = scrollPanel.scrollTop
  const pages: PageGeometry[] = []
  for (const pageElement of pageElements) {
    if (!pageElement || !pageElement.isConnected) continue
    const pageRect = toScrollCoord(
      pageElement.getBoundingClientRect(),
      containerRect,
      scrollTop,
    )
    const content = pageElement.querySelector<HTMLElement>(':scope > .content')
    const blocks: BlockGeometry[] = []
    if (content) {
      for (const child of Array.from(content.children)) {
        if (!(child instanceof HTMLElement)) continue
        blocks.push(
          toScrollCoord(
            child.getBoundingClientRect(),
            containerRect,
            scrollTop,
          ),
        )
      }
    }
    pages.push({ top: pageRect.top, height: pageRect.height, blocks })
  }
  return {
    viewportHeight: scrollPanel.clientHeight,
    scrollHeight: scrollPanel.scrollHeight,
    headerOffset,
    pages,
  }
}
