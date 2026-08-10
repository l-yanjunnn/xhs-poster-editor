export const IMAGE_WIDTH_MIN = 10
export const IMAGE_WIDTH_MAX = 100
export const IMAGE_WIDTH_SNAP_TARGETS = [33, 50, 66, 75, 100] as const

export type ImageAlign = 'left' | 'center' | 'right'

export interface ImageNodeLike {
  type?: string
  attrs?: Record<string, unknown>
  content?: ImageNodeLike[]
}

export function normalizeImageAlign(value: unknown): ImageAlign {
  return value === 'center' || value === 'right' ? value : 'left'
}

export function clampImageWidth(value: number): number {
  if (!Number.isFinite(value)) return IMAGE_WIDTH_MAX
  return Math.min(IMAGE_WIDTH_MAX, Math.max(IMAGE_WIDTH_MIN, value))
}

export function formatImageWidth(value: number): string {
  const rounded = Math.round(clampImageWidth(value) * 10) / 10
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`
}

export function normalizeImageWidth(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return formatImageWidth(value)
  if (typeof value !== 'string') return null

  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)%$/)
  if (!match) return null
  return formatImageWidth(Number.parseFloat(match[1]))
}

export function imageWidthToNumber(value: unknown, fallback = 100): number {
  const normalized = normalizeImageWidth(value)
  return normalized ? Number.parseFloat(normalized) : clampImageWidth(fallback)
}

export function createImageId(): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  if (uuid) return `image-${uuid}`
  return `image-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function nextUniqueImageId(
  seen: ReadonlySet<string>,
  makeId: () => string,
): string {
  let candidate = makeId().trim()
  while (!candidate || seen.has(candidate)) candidate = makeId().trim()
  return candidate
}

export function normalizeImageAttributes(
  attrs: Record<string, unknown> | undefined,
  seen: Set<string>,
  makeId: () => string = createImageId,
): Record<string, unknown> {
  const current = attrs ?? {}
  const rawId = typeof current.imageId === 'string' ? current.imageId.trim() : ''
  const imageId =
    rawId && !seen.has(rawId) ? rawId : nextUniqueImageId(seen, makeId)
  seen.add(imageId)

  return {
    ...current,
    imageId,
    align: normalizeImageAlign(current.align),
    width: normalizeImageWidth(current.width),
    // v1.4 只持久化百分比宽度；高度始终由原图比例推导。
    height: null,
  }
}

/**
 * 旧草稿、HTML 粘贴和复制图片都可能缺少或复用 imageId。这里深拷贝并
 * 一次性恢复图片不变量，让 Preview 永远可以只靠 imageId 回到 Tiptap。
 */
export function normalizeImageDocument<T extends ImageNodeLike>(
  doc: T,
  makeId: () => string = createImageId,
): T {
  const seen = new Set<string>()

  function walk(node: ImageNodeLike): ImageNodeLike {
    const out: ImageNodeLike = { ...node }
    if (node.type === 'image') {
      out.attrs = normalizeImageAttributes(node.attrs, seen, makeId)
    } else if (node.attrs) {
      out.attrs = { ...node.attrs }
    }
    if (node.content) out.content = node.content.map(walk)
    return out
  }

  return walk(doc) as T
}

export interface WidthSnapResult {
  width: number
  snappedTo: number | null
}

export function snapImageWidth(
  rawWidth: number,
  options: {
    enabled?: boolean
    altKey?: boolean
    threshold?: number
    targets?: readonly number[]
  } = {},
): WidthSnapResult {
  const width = clampImageWidth(rawWidth)
  if (options.enabled === false || options.altKey) {
    return { width, snappedTo: null }
  }

  const threshold = options.threshold ?? 2.5
  const targets = options.targets ?? IMAGE_WIDTH_SNAP_TARGETS
  let closest: number | null = null
  let closestDistance = Number.POSITIVE_INFINITY
  for (const target of targets) {
    const distance = Math.abs(width - target)
    if (distance < closestDistance) {
      closest = target
      closestDistance = distance
    }
  }
  return closest !== null && closestDistance <= threshold
    ? { width: clampImageWidth(closest), snappedTo: closest }
    : { width, snappedTo: null }
}

export interface AlignmentTargetLefts {
  left: number
  center: number
  right: number
}

export interface AlignmentSnapResult {
  align: ImageAlign | null
  left: number
  distance: number | null
}

export function snapImageAlignment(
  proposedLeft: number,
  targetLefts: AlignmentTargetLefts,
  options: {
    enabled?: boolean
    altKey?: boolean
    thresholdPx?: number
  } = {},
): AlignmentSnapResult {
  if (options.enabled === false || options.altKey) {
    return { align: null, left: proposedLeft, distance: null }
  }

  const threshold = options.thresholdPx ?? 18
  const candidates: Array<[ImageAlign, number]> = [
    ['left', targetLefts.left],
    ['center', targetLefts.center],
    ['right', targetLefts.right],
  ]
  let best: [ImageAlign, number] | null = null
  let distance = Number.POSITIVE_INFINITY
  for (const candidate of candidates) {
    const candidateDistance = Math.abs(candidate[1] - proposedLeft)
    if (candidateDistance < distance) {
      best = candidate
      distance = candidateDistance
    }
  }

  return best && distance <= threshold
    ? { align: best[0], left: best[1], distance }
    : { align: null, left: proposedLeft, distance: null }
}
