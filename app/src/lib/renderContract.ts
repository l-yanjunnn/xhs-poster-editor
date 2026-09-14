import { CANVAS_WIDTH } from './canvas'

const STYLE_PROPERTIES = [
  'font-family', 'font-size', 'font-weight', 'font-style', 'font-stretch',
  'font-variant', 'font-feature-settings', 'letter-spacing', 'line-height',
  'color', 'background-color', 'background-image', 'opacity',
  'text-decoration-line', 'text-decoration-color', 'text-decoration-thickness',
  'border-top-width', 'border-top-color', 'border-left-width', 'border-left-color',
  'border-radius', 'visibility', 'display', 'object-fit', 'object-position', 'overflow-x', 'overflow-y',
] as const
const DECORATION_PROPERTIES = ['position', 'top', 'left', 'right', 'bottom', 'width', 'height', 'transform', 'margin-left', 'margin-top', 'background-color', 'opacity', 'border-radius', 'border-left-width', 'border-left-color'] as const

interface RenderNode {
  tag: string
  text: string
  rect: number[]
  style: string[]
  image: string | null
  decorations: string[][]
  decorationRects: number[][]
}
export interface RenderContract {
  nodes: RenderNode[]
}

function contentElements(page: HTMLElement): HTMLElement[] {
  return [page, ...page.querySelectorAll<HTMLElement>('*')].filter(element =>
    !element.closest('[data-preview-only], .guide, html2canvaspseudoelement') && element.tagName !== 'STYLE',
  )
}

// All poster decorations are absolute empty boxes. Resolve their real box from
// their containing block and transform, then compare with materialized iframe DOM.
function decorationRect(element: HTMLElement, pseudo: CSSStyleDeclaration, bounds: DOMRect, scale: number): number[] {
  const parent = element.getBoundingClientRect()
  const style = (element.ownerDocument.defaultView ?? window).getComputedStyle(element)
  const width = parseFloat(pseudo.width), height = parseFloat(pseudo.height)
  const resolve = (value: string, extent: number) => value.endsWith('%') ? parseFloat(value) / 100 * extent : parseFloat(value)
  const pw = parent.width / scale, ph = parent.height / scale
  const left = resolve(pseudo.left, pw), top = resolve(pseudo.top, ph)
  const x = (parent.left - bounds.left) / scale + parseFloat(style.borderLeftWidth || '0') + left + parseFloat(pseudo.marginLeft || '0')
  const y = (parent.top - bounds.top) / scale + parseFloat(style.borderTopWidth || '0') + top + parseFloat(pseudo.marginTop || '0')
  if (![x, y, width, height].every(Number.isFinite)) throw new Error('无法验证装饰的实际几何，请检查版式')
  const matrix = new DOMMatrix(pseudo.transform === 'none' ? undefined : pseudo.transform)
  const [ox, oy] = pseudo.transformOrigin.split(' ').map((value, index) => resolve(value, index ? height : width))
  const corners = [[0, 0], [width, 0], [0, height], [width, height]].map(([px, py]) => ({
    x: x + ox + matrix.a * (px - ox) + matrix.c * (py - oy) + matrix.e,
    y: y + oy + matrix.b * (px - ox) + matrix.d * (py - oy) + matrix.f,
  }))
  const xs = corners.map(point => point.x), ys = corners.map(point => point.y)
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)]
}

/** Measured DOM geometry and resolved styling, never copied snapshot labels. */
export function captureRenderContract(page: HTMLElement, finalIframe = false): RenderContract {
  const view = page.ownerDocument.defaultView ?? window
  const bounds = page.getBoundingClientRect()
  const scale = bounds.width / CANVAS_WIDTH || 1
  const nodes = contentElements(page).map(element => {
    const rect = element.getBoundingClientRect()
    const style = view.getComputedStyle(element)
    const text = [...element.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent ?? '').join('')
    const decorations: string[][] = []
    const decorationRects: number[][] = []
    if (finalIframe) {
      for (const child of [...element.children]) {
        if (child.tagName.toLowerCase() !== 'html2canvaspseudoelement') continue
        const computed = view.getComputedStyle(child)
        // Empty decorative pseudo boxes only; textual markers have their own nodes.
        if (!child.textContent) {
          decorations.push(DECORATION_PROPERTIES.map(property => computed.getPropertyValue(property)))
          const r = child.getBoundingClientRect()
          decorationRects.push([(r.left - bounds.left) / scale, (r.top - bounds.top) / scale, r.width / scale, r.height / scale])
        }
      }
    } else {
      for (const pseudo of ['::before', '::after']) {
        const computed = view.getComputedStyle(element, pseudo)
        if (computed.content === '""' && computed.display !== 'none') {
          decorations.push(DECORATION_PROPERTIES.map(property => computed.getPropertyValue(property)))
          decorationRects.push(decorationRect(element, computed, bounds, scale))
        }
      }
    }
    return {
      tag: element.tagName, text,
      rect: rect.width === 0 && rect.height === 0 ? [0, 0, 0, 0] : [(rect.left - bounds.left) / scale, (rect.top - bounds.top) / scale, rect.width / scale, rect.height / scale],
      style: STYLE_PROPERTIES.map(property => style.getPropertyValue(property)),
      image: element.tagName === 'IMG' ? `${(element as HTMLImageElement).currentSrc || (element as HTMLImageElement).src}|${(element as HTMLImageElement).naturalWidth}x${(element as HTMLImageElement).naturalHeight}` : null,
      decorations, decorationRects,
    }
  })
  return { nodes }
}

export function assertRenderContract(expected: RenderContract, actual: RenderContract, stage: string): void {
  if (expected.nodes.length !== actual.nodes.length) throw new Error(`${stage}：页面节点数量变化，成品已失效`)
  for (let index = 0; index < expected.nodes.length; index += 1) {
    const before = expected.nodes[index], after = actual.nodes[index]
    const label = `${stage} 第 ${index + 1} 个 ${before.tag}「${before.text.slice(0, 16)}」`
    if (before.tag !== after.tag || before.text !== after.text) throw new Error(`${label}：文字或结构变化`)
    if (before.style.some((value, i) => value !== after.style[i])) {
      const property = STYLE_PROPERTIES[before.style.findIndex((value, i) => value !== after.style[i])]
      throw new Error(`${label}：实际字体或样式变化（${property}）`)
    }
    if (before.image !== after.image) throw new Error(`${label}：图片资源变化`)
    if (before.rect.some((value, i) => Math.abs(value - after.rect[i]) > 1)) {
      throw new Error(`${label}：实际几何变化（${before.rect.join(',')} → ${after.rect.join(',')}）`)
    }
    const decorationsMatch = before.decorations.length === after.decorations.length && before.decorations.every((decoration, i) => decoration.every((value, j) => {
      const actualValue = after.decorations[i][j]
      if (value === actualValue) return true
      // html2canvas serializes pseudo lengths, then Chromium rounds to 1/64 px.
      return /^-?[\d.]+px$/.test(value) && /^-?[\d.]+px$/.test(actualValue) && Math.abs(parseFloat(value) - parseFloat(actualValue)) <= 0.05
    }))
    if (before.decorationRects.some((rect, i) => rect.some((value, j) => Math.abs(value - (after.decorationRects[i]?.[j] ?? Infinity)) > 1))) throw new Error(`${label}：装饰实际位置或尺寸变化`)
    if (!decorationsMatch) throw new Error(`${label}：装饰几何或样式变化 ${JSON.stringify(before.decorations)} → ${JSON.stringify(after.decorations)}`)
  }
}
