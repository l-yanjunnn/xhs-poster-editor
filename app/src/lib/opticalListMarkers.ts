const MARKER_ATTRIBUTE = 'data-optical-list-marker'
const MARKER_CLASS = 'optical-list-marker'
const MARKER_COLUMNS_ATTRIBUTE = 'data-optical-list-marker-columns'
const MARKER_MAX_LABEL_ATTRIBUTE = 'data-optical-list-marker-max-label'
const MARKER_WIDTH_PROPERTY = '--optical-list-marker-column-width'

export interface OpticalListMarkerMeasureContext {
  label: string
  value: number
  list: HTMLOListElement
  item: HTMLLIElement
}

export interface OpticalListMarkerOptions {
  /**
   * 自定义编号文本的实际布局宽度（CSS px）。
   *
   * 默认使用 Range 测量 marker 内文本；字体尚未就绪或节点尚未
   * 插入文档时，回退为 `Nch`。字体就绪后可调用
   * `refreshOpticalOrderedListMarkerColumns` 重新测量。
   */
  measureMarkerWidth?: (
    marker: HTMLSpanElement,
    context: OpticalListMarkerMeasureContext,
  ) => number | null | undefined
}

interface DecoratedMarker {
  marker: HTMLSpanElement
  label: string
  value: number
  item: HTMLLIElement
}

function isElement(node: ParentNode): node is Element {
  return node.nodeType === Node.ELEMENT_NODE
}

function isOrderedList(element: Element): element is HTMLOListElement {
  return element.tagName === 'OL'
}

function directListItems(list: HTMLOListElement): HTMLLIElement[] {
  return Array.from(list.children).filter(
    (child): child is HTMLLIElement => child.tagName === 'LI',
  )
}

function parseIntegerAttribute(element: Element, name: string): number | null {
  const raw = element.getAttribute(name)?.trim()
  if (!raw || !/^[+-]?\d+$/.test(raw)) return null
  const value = Number(raw)
  return Number.isSafeInteger(value) ? value : null
}

function orderedListValues(
  list: HTMLOListElement,
  items: HTMLLIElement[],
): number[] {
  const reversed = list.hasAttribute('reversed')
  const explicitStart = parseIntegerAttribute(list, 'start')
  let current = explicitStart ?? (reversed ? items.length : 1)
  const step = reversed ? -1 : 1

  return items.map((item) => {
    const explicitValue = parseIntegerAttribute(item, 'value')
    if (explicitValue !== null) current = explicitValue
    const value = current
    current += step
    return value
  })
}

function orderedListsWithin(root: ParentNode): HTMLOListElement[] {
  const lists: HTMLOListElement[] = []
  if (isElement(root) && isOrderedList(root)) lists.push(root)
  lists.push(...Array.from(root.querySelectorAll<HTMLOListElement>('ol')))
  return lists
}

function directGeneratedMarkers(item: HTMLLIElement): HTMLSpanElement[] {
  return Array.from(item.children).filter(
    (child): child is HTMLSpanElement =>
      child.tagName === 'SPAN' && child.hasAttribute(MARKER_ATTRIBUTE),
  )
}

function ensureMarker(
  item: HTMLLIElement,
  value: number,
): HTMLSpanElement {
  const existing = directGeneratedMarkers(item)
  const marker = existing.shift() ?? item.ownerDocument.createElement('span')
  existing.forEach((duplicate) => duplicate.remove())

  marker.classList.add(MARKER_CLASS)
  marker.setAttribute(MARKER_ATTRIBUTE, '')
  // 原生 marker 会被展示层 CSS 关闭，因此该文本也是读屏获得实际
  // start/value/reversed 序号的唯一来源，不能 aria-hidden。
  marker.removeAttribute('aria-hidden')
  marker.setAttribute('contenteditable', 'false')
  marker.dataset.opticalListValue = String(value)
  marker.textContent = `${value}.`

  if (item.firstChild !== marker) item.insertBefore(marker, item.firstChild)
  return marker
}

function defaultMarkerWidth(marker: HTMLSpanElement): number | null {
  const range = marker.ownerDocument.createRange()
  try {
    range.selectNodeContents(marker)
    const rect = range.getBoundingClientRect()
    return Number.isFinite(rect.width) && rect.width > 0 ? rect.width : null
  } catch {
    return null
  } finally {
    range.detach()
  }
}

function markerColumnWidth(
  list: HTMLOListElement,
  markers: DecoratedMarker[],
  options: OpticalListMarkerOptions,
): { cssWidth: string; maxLabel: string; columns: number } | null {
  if (markers.length === 0) return null

  const measured = markers.map((entry) => {
    const context: OpticalListMarkerMeasureContext = {
      label: entry.label,
      value: entry.value,
      list,
      item: entry.item,
    }
    const width = options.measureMarkerWidth
      ? options.measureMarkerWidth(entry.marker, context)
      : defaultMarkerWidth(entry.marker)
    return {
      ...entry,
      width:
        typeof width === 'number' && Number.isFinite(width) && width > 0
          ? width
          : null,
    }
  })

  const widestMeasured = measured.reduce<(typeof measured)[number] | null>(
    (widest, entry) => {
      if (entry.width === null) return widest
      if (widest && widest.width !== null && widest.width >= entry.width) {
        return widest
      }
      return entry
    },
    null,
  )
  const widestByCharacters = markers.reduce((widest, entry) =>
    Array.from(entry.label).length > Array.from(widest.label).length
      ? entry
      : widest,
  )
  const columns = Math.max(
    ...markers.map((entry) => Array.from(entry.label).length),
  )

  if (widestMeasured?.width !== null && widestMeasured?.width !== undefined) {
    // 向上保留 1/1000 px，避免因四舍五入将最宽编号裁掉一丝。
    const width = Math.ceil(widestMeasured.width * 1000) / 1000
    return {
      cssWidth: `${width}px`,
      maxLabel: widestMeasured.label,
      columns,
    }
  }

  return {
    cssWidth: `${columns}ch`,
    maxLabel: widestByCharacters.label,
    columns,
  }
}

function applyColumnWidth(
  list: HTMLOListElement,
  markers: DecoratedMarker[],
  options: OpticalListMarkerOptions,
) {
  const column = markerColumnWidth(list, markers, options)
  if (!column) {
    list.removeAttribute(MARKER_COLUMNS_ATTRIBUTE)
    list.removeAttribute(MARKER_MAX_LABEL_ATTRIBUTE)
    list.style.removeProperty(MARKER_WIDTH_PROPERTY)
    return
  }

  list.setAttribute(MARKER_COLUMNS_ATTRIBUTE, String(column.columns))
  list.setAttribute(MARKER_MAX_LABEL_ATTRIBUTE, column.maxLabel)
  list.style.setProperty(MARKER_WIDTH_PROPERTY, column.cssWidth)
}

function decorateDomRoot<T extends ParentNode>(
  root: T,
  options: OpticalListMarkerOptions,
): T {
  const activeMarkers = new Set<HTMLSpanElement>()

  for (const list of orderedListsWithin(root)) {
    const items = directListItems(list)
    const values = orderedListValues(list, items)
    const markers = items.map((item, index): DecoratedMarker => {
      const value = values[index]
      const marker = ensureMarker(item, value)
      activeMarkers.add(marker)
      return { marker, label: `${value}.`, value, item }
    })
    applyColumnWidth(list, markers, options)
  }

  // DOM 可能从 ol 切换成 ul，或者 marker 被移到了非直系位置。
  // 只清理本模块生成的 data 节点，不改动任何 ol/li 语义属性。
  root
    .querySelectorAll<HTMLSpanElement>(`span[${MARKER_ATTRIBUTE}]`)
    .forEach((marker) => {
      if (!activeMarkers.has(marker)) marker.remove()
    })

  return root
}

/**
 * 为预览 HTML 的有序列表注入仅展示的编号节点。
 *
 * - HTML 字符串入参返回新字符串；
 * - DOM root 入参原地装饰并返回同一 root；
 * - 重复调用会复用已有 marker，不会重复注入。
 */
export function decorateOpticalOrderedListMarkers(
  source: string,
  options?: OpticalListMarkerOptions,
): string
export function decorateOpticalOrderedListMarkers<T extends ParentNode>(
  source: T,
  options?: OpticalListMarkerOptions,
): T
export function decorateOpticalOrderedListMarkers(
  source: string | ParentNode,
  options: OpticalListMarkerOptions = {},
): string | ParentNode {
  if (typeof source !== 'string') return decorateDomRoot(source, options)

  const template = document.createElement('template')
  template.innerHTML = source
  decorateDomRoot(template.content, options)
  return template.innerHTML
}

/**
 * 在字体加载或字号变化后，不重算编号，只刷新每层的最宽编号列。
 */
export function refreshOpticalOrderedListMarkerColumns<T extends ParentNode>(
  root: T,
  options: OpticalListMarkerOptions = {},
): T {
  for (const list of orderedListsWithin(root)) {
    const markers = directListItems(list).flatMap((item) => {
      const marker = directGeneratedMarkers(item)[0]
      if (!marker) return []
      const value = Number(marker.dataset.opticalListValue)
      if (!Number.isSafeInteger(value)) return []
      return [
        {
          marker,
          label: marker.textContent ?? `${value}.`,
          value,
          item,
        },
      ]
    })
    applyColumnWidth(list, markers, options)
  }
  return root
}
