import { CANVAS_HEIGHT, CANVAS_WIDTH, COVER_CROP_TOP, COVER_CROP_BOTTOM } from './canvas'

export interface PageGeometryIssue {
  code: 'content-clipped' | 'block-compressed' | 'block-overlap' | 'logo-overlap'
  blockIndex: number
  blockText: string
  message: string
}

/** Check measured content, independently of copied layout/seal labels.
 * Rects are normalized from the scaled editing preview to canvas units.
 */
export function inspectPageGeometry(page: HTMLElement): PageGeometryIssue[] {
  const bounds = page.getBoundingClientRect()
  const scale = bounds.width / CANVAS_WIDTH
  // Detached/non-layout test DOMs cannot provide geometry evidence.
  if (!scale || !bounds.height) return []
  const blocks = [...page.querySelectorAll<HTMLElement>('.content > *')]
  const issues: PageGeometryIssue[] = []
  const previousRects: DOMRect[] = []
  const logo = page.querySelector<HTMLElement>('.logo')?.getBoundingClientRect()
  blocks.forEach((block, blockIndex) => {
    const rect = block.getBoundingClientRect()
    const report = (code: PageGeometryIssue['code'], message: string) => {
      if (!issues.some(issue => issue.blockIndex === blockIndex && issue.code === code)) {
        issues.push({ code, blockIndex, blockText: (block.textContent ?? '').slice(0, 80), message })
      }
    }
    const assignedHeight = parseFloat(block.style.height)
    if (assignedHeight > 0 && rect.height / scale < assignedHeight - 1) {
      report('block-compressed', '文字块实际高度被压缩，文字行可能重叠')
    }
    if (rect.height > 0 && previousRects.some(previous => Math.min(previous.bottom, rect.bottom) - Math.max(previous.top, rect.top) > scale && Math.min(previous.right, rect.right) - Math.max(previous.left, rect.left) > scale)) {
      report('block-overlap', '文字块与上一段重叠，请调整布局')
    }
    previousRects.push(rect)
    // The logo lives outside .content, so ordinary block checks cannot detect
    // it covering text. Check actual glyphs/images, not empty paragraph boxes.
    if (logo?.width && logo.height) {
      for (const element of block.querySelectorAll<HTMLElement>('.dtl-atom, img')) {
        const r = element.getBoundingClientRect()
        if (Math.min(r.right, logo.right) - Math.max(r.left, logo.left) > scale &&
            Math.min(r.bottom, logo.bottom) - Math.max(r.top, logo.top) > scale) {
          report('logo-overlap', '内容与 Logo 重叠，请调整内页位置或 Logo 显示设置')
          break
        }
      }
    }
    // Include every line/atom: absolute children can escape a seemingly valid block.
    for (const element of [block, ...block.querySelectorAll<HTMLElement>('.dtl-line, .dtl-atom, img, pre, li')]) {
      if (element.closest('[data-preview-only]')) continue
      const r = element.getBoundingClientRect()
      if (!r.width || !r.height) continue
      const x = (r.left - bounds.left) / scale
      const y = (r.top - bounds.top) / scale
      if (x < -1 || y < -1 || x + r.width / scale > CANVAS_WIDTH + 1 || y + r.height / scale > CANVAS_HEIGHT + 1) {
        report('content-clipped', '内容超出画布，会被裁切；请分页或调整字号、间距')
      }
    }
  })
  return issues
}

/** Inside the canvas but outside the theme/crop safety area is a warning, not clipping. */
export function inspectPageSafeArea(page: HTMLElement): Array<{ code: string; blockIndex: number; blockText: string; message: string }> {
  const bounds = page.getBoundingClientRect(), scale = bounds.width / CANVAS_WIDTH
  const content = page.querySelector<HTMLElement>('.content')
  if (!scale || !bounds.height || !content) return []
  const first = page.classList.contains('page--first')
  const safeTop = first ? COVER_CROP_TOP : 0
  const safeBottom = Math.min(CANVAS_HEIGHT - (parseFloat(getComputedStyle(content).paddingBottom) || 0), first ? COVER_CROP_BOTTOM : CANVAS_HEIGHT)
  return [...content.children].flatMap((block, blockIndex) => {
    const rects = [block, ...block.querySelectorAll('.dtl-atom, img, pre, li')].map(node => node.getBoundingClientRect()).filter(rect => rect.height > 0)
    const top = Math.min(...rects.map(rect => (rect.top - bounds.top) / scale))
    const bottom = Math.max(...rects.map(rect => (rect.bottom - bounds.top) / scale))
    if (top >= -1 && bottom <= CANVAS_HEIGHT + 1 && (top < safeTop - 1 || bottom > safeBottom + 1)) {
      return [{ code: 'outside-safe-area', blockIndex, blockText: (block.textContent ?? '').slice(0, 80), message: '内容仍在完整画布内，但超出主题留白或封面 3:4 安全区；请确认发布时的裁切效果' }]
    }
    return []
  })
}
