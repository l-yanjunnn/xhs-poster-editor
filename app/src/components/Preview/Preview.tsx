import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { MoveHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  COVER_CROP_TOP,
} from '@/lib/canvas'
import {
  formatImageWidth,
  normalizeImageAlign,
  snapImageAlignment,
  snapImageWidth,
  type ImageAlign,
} from '@/lib/imageModel'
import {
  calibratePageTypography,
  calibratePageTypographyNow,
} from '@/lib/opticalTypography'
import type { ThemeKey } from '@/lib/themes'

interface Props {
  html: string
  themeClass: ThemeKey
  bgSrc?: string
  logoSrc?: string
  showLogo?: boolean
  pageIndex?: number
  pageTotal?: number
  cropGuideOn?: boolean
  layoutGuidesOn?: boolean
  snapEnabled?: boolean
  selectedImageId?: string | null
  previewScale?: number
  layoutRevision?: string
  onSelectImage?: (imageId: string) => void
  onClearSelection?: () => void
  onGestureStateChange?: (active: boolean) => void
  onCommitImage?: (
    imageId: string,
    patch: { width?: string | null; align?: ImageAlign },
    actionLabel: string,
  ) => boolean
}

interface SelectionBox {
  left: number
  top: number
  width: number
  height: number
}

interface PreviewCanvasGeometry {
  scale: number
  pageLeft: number
  pageTop: number
  contentLeft: number
  contentRight: number
  contentTop: number
  contentBottom: number
  contentWidth: number
  contentCenter: number
}

type ResizeDirection = 'left' | 'right'

interface ActiveGesture {
  kind: 'resize' | 'align'
  pointerId: number
  captureTarget: HTMLElement
  image: HTMLImageElement
  imageId: string
  startClientX: number
  startLeft: number
  startTop: number
  startWidth: number
  startHeight: number
  scale: number
  geometry: PreviewCanvasGeometry
  resizeDirection?: ResizeDirection
  targetLefts: { left: number; center: number; right: number }
  originalStyle: string | null
  originalAlign: string | null
  draftWidth: number
  draftAlign: ImageAlign | null
  snappedWidth: number | null
  didMove: boolean
}

interface GestureFeedback {
  lineX: number | null
  label: string | null
}

function parseCssLength(value: string): number | null {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function cssPadding(
  pageStyle: CSSStyleDeclaration,
  contentStyle: CSSStyleDeclaration,
  variable: '--page-padding-x' | '--page-padding-top' | '--page-padding-bottom',
  fallbackProperty: 'paddingLeft' | 'paddingTop' | 'paddingBottom',
): number {
  return (
    parseCssLength(pageStyle.getPropertyValue(variable)) ??
    parseCssLength(contentStyle[fallbackProperty]) ??
    0
  )
}

/**
 * 把当前 `.page` 的 CSS 安全区转成 1080×1800 画布坐标。
 * 优先读页面角色上的 `--page-padding-*`，并结合真实 content rect；
 * 因此 Cover / Inner / 旧主题不需要在交互层重复一套常量。
 */
function measurePreviewCanvasGeometry(
  page: HTMLDivElement,
  content: HTMLDivElement,
): PreviewCanvasGeometry | null {
  const pageRect = page.getBoundingClientRect()
  const scale = pageRect.width / CANVAS_WIDTH
  if (!Number.isFinite(scale) || scale <= 0) return null

  const contentRect = content.getBoundingClientRect()
  const pageStyle = window.getComputedStyle(page)
  const contentStyle = window.getComputedStyle(content)
  const paddingX = cssPadding(
    pageStyle,
    contentStyle,
    '--page-padding-x',
    'paddingLeft',
  )
  const paddingTop = cssPadding(
    pageStyle,
    contentStyle,
    '--page-padding-top',
    'paddingTop',
  )
  const paddingBottom = cssPadding(
    pageStyle,
    contentStyle,
    '--page-padding-bottom',
    'paddingBottom',
  )

  // hidden/jsdom 环境下 content rect 可能是 0；真实浏览器则使用
  // content border-box 的实际偏移，而不假定它永远与 page 重合。
  const hasContentWidth = contentRect.width > 0
  const hasContentHeight = contentRect.height > 0
  const contentBorderLeft = hasContentWidth
    ? (contentRect.left - pageRect.left) / scale
    : 0
  const contentBorderRight = hasContentWidth
    ? (contentRect.right - pageRect.left) / scale
    : CANVAS_WIDTH
  const contentBorderTop = hasContentHeight
    ? (contentRect.top - pageRect.top) / scale
    : 0
  const contentBorderBottom = hasContentHeight
    ? (contentRect.bottom - pageRect.top) / scale
    : CANVAS_HEIGHT
  const contentLeft = contentBorderLeft + paddingX
  const contentRight = contentBorderRight - paddingX
  const contentTop = contentBorderTop + paddingTop
  const contentBottom = contentBorderBottom - paddingBottom
  const contentWidth = contentRight - contentLeft
  if (
    !Number.isFinite(contentWidth) ||
    contentWidth <= 0 ||
    contentBottom < contentTop
  ) {
    return null
  }

  return {
    scale,
    pageLeft: pageRect.left,
    pageTop: pageRect.top,
    contentLeft,
    contentRight,
    contentTop,
    contentBottom,
    contentWidth,
    contentCenter: contentLeft + contentWidth / 2,
  }
}

function sameCanvasLayout(
  previous: PreviewCanvasGeometry | null,
  next: PreviewCanvasGeometry,
): boolean {
  if (!previous) return false
  return (
    Math.abs(previous.contentLeft - next.contentLeft) < 0.1 &&
    Math.abs(previous.contentRight - next.contentRight) < 0.1 &&
    Math.abs(previous.contentTop - next.contentTop) < 0.1 &&
    Math.abs(previous.contentBottom - next.contentBottom) < 0.1 &&
    Math.abs(previous.contentCenter - next.contentCenter) < 0.1
  )
}

function alignedImageLeft(
  align: ImageAlign,
  width: number,
  geometry: PreviewCanvasGeometry,
): number {
  if (align === 'center') return geometry.contentCenter - width / 2
  if (align === 'right') return geometry.contentRight - width
  return geometry.contentLeft
}

function alignmentGuideX(
  align: ImageAlign,
  geometry: PreviewCanvasGeometry,
): number {
  if (align === 'center') return geometry.contentCenter
  if (align === 'right') return geometry.contentRight
  return geometry.contentLeft
}

function setForwardedRef(
  ref: React.ForwardedRef<HTMLDivElement>,
  value: HTMLDivElement | null,
) {
  if (typeof ref === 'function') ref(value)
  else if (ref) ref.current = value
}

function restoreGestureDom(gesture: ActiveGesture) {
  if (gesture.originalStyle === null) gesture.image.removeAttribute('style')
  else gesture.image.setAttribute('style', gesture.originalStyle)
  if (gesture.originalAlign === null) gesture.image.removeAttribute('data-align')
  else gesture.image.setAttribute('data-align', gesture.originalAlign)
  gesture.image.style.removeProperty('transform')
}

function makeContentImagesKeyboardAccessible(content: HTMLDivElement) {
  const images = Array.from(
    content.querySelectorAll<HTMLImageElement>('img[data-image-id]'),
  )
  for (const image of images) {
    image.tabIndex = 0
    image.setAttribute('role', 'button')
    image.setAttribute('aria-label', '选中此图片并在右侧调整')
  }
  return images
}

/**
 * `.page` 是唯一可导出节点；选框、手柄和参考线位于同尺度 sibling
 * `canvas-interaction-layer`。即使导出逻辑未执行清理，这些节点也不会被 clone。
 */
export const Preview = forwardRef<HTMLDivElement, Props>(function Preview(
  {
    html,
    themeClass,
    bgSrc,
    logoSrc,
    showLogo = true,
    pageIndex = 0,
    pageTotal = 1,
    cropGuideOn = false,
    layoutGuidesOn = false,
    snapEnabled = true,
    selectedImageId = null,
    previewScale = 0.4,
    layoutRevision = '',
    onSelectImage,
    onClearSelection,
    onGestureStateChange,
    onCommitImage,
  },
  forwardedRef,
) {
  const pageRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const gestureRef = useRef<ActiveGesture | null>(null)
  const typographyRevisionRef = useRef(0)
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null)
  const [canvasGeometry, setCanvasGeometry] =
    useState<PreviewCanvasGeometry | null>(null)
  const [feedback, setFeedback] = useState<GestureFeedback>({
    lineX: null,
    label: null,
  })
  const [overflowing, setOverflowing] = useState(false)
  const isFirstPage = pageIndex === 0
  const contentMarkup = useMemo(() => ({ __html: html }), [html])

  // 保持 `dangerouslySetInnerHTML` prop 的引用稳定，避免选框、overflow
  // 等内部状态更新时 React 重写整棵内容 DOM。只在实际排版输入变化时，
  // 于绘制前恢复图片语义、展示 marker 与光学变量。
  useLayoutEffect(() => {
    if (contentRef.current) {
      makeContentImagesKeyboardAccessible(contentRef.current)
    }
    if (pageRef.current) {
      calibratePageTypographyNow(pageRef.current, true)
    }
  }, [html, isFirstPage, layoutRevision, previewScale, themeClass])

  const findSelectedImage = useCallback(() => {
    if (!selectedImageId || !contentRef.current) return null
    return (
      Array.from(
        contentRef.current.querySelectorAll<HTMLImageElement>(
          'img[data-image-id]',
        ),
      ).find((image) => image.dataset.imageId === selectedImageId) ?? null
    )
  }, [selectedImageId])

  const refreshCanvasGeometry = useCallback(() => {
    const page = pageRef.current
    const content = contentRef.current
    if (!page || !content) {
      setCanvasGeometry((previous) => (previous === null ? previous : null))
      return null
    }
    const next = measurePreviewCanvasGeometry(page, content)
    setCanvasGeometry((previous) =>
      next && sameCanvasLayout(previous, next) ? previous : next,
    )
    return next
  }, [])

  const measureSelection = useCallback(
    (geometrySnapshot?: PreviewCanvasGeometry | null) => {
      const image = findSelectedImage()
      const geometry =
        geometrySnapshot === undefined
          ? refreshCanvasGeometry()
          : geometrySnapshot
      if (!geometry || !image) {
        setSelectionBox((previous) => (previous === null ? previous : null))
        return null
      }
      const imageRect = image.getBoundingClientRect()
      const box = {
        left: (imageRect.left - geometry.pageLeft) / geometry.scale,
        top: (imageRect.top - geometry.pageTop) / geometry.scale,
        width: imageRect.width / geometry.scale,
        height: imageRect.height / geometry.scale,
      }
      setSelectionBox((previous) =>
        previous &&
        Math.abs(previous.left - box.left) < 0.1 &&
        Math.abs(previous.top - box.top) < 0.1 &&
        Math.abs(previous.width - box.width) < 0.1 &&
        Math.abs(previous.height - box.height) < 0.1
          ? previous
          : box,
      )
      return { box, image, geometry }
    },
    [findSelectedImage, refreshCanvasGeometry],
  )

  const measureOverflow = useCallback(
    (geometrySnapshot?: PreviewCanvasGeometry | null) => {
      const content = contentRef.current
      const geometry =
        geometrySnapshot === undefined
          ? refreshCanvasGeometry()
          : geometrySnapshot
      if (!content || !geometry) return
      const last = content.lastElementChild
      if (!last) {
        setOverflowing(false)
        return
      }
      const lastRect = last.getBoundingClientRect()
      const safeBottom =
        geometry.pageTop + geometry.contentBottom * geometry.scale
      setOverflowing(lastRect.bottom > safeBottom + 1)
    },
    [refreshCanvasGeometry],
  )

  // H2 竖线和有序列表编号是字形伴随元素：首帧先同步
  // 注入展示 marker，再等精确字体完成后复测。Abort + revision
  // 防止快速 A→B 切字体时，A 的慢结果回写到 B 上。
  useLayoutEffect(() => {
    const page = pageRef.current
    if (!page) return
    const controller = new AbortController()
    const revision = ++typographyRevisionRef.current
    void calibratePageTypography(page, { signal: controller.signal }).then(
      () => {
        if (
          controller.signal.aborted ||
          revision !== typographyRevisionRef.current
        ) {
          return
        }
        const geometry = refreshCanvasGeometry()
        measureSelection(geometry)
        measureOverflow(geometry)
      },
    )
    return () => controller.abort()
  }, [
    html,
    isFirstPage,
    layoutRevision,
    measureOverflow,
    measureSelection,
    previewScale,
    refreshCanvasGeometry,
    themeClass,
  ])

  useLayoutEffect(() => {
    const content = contentRef.current
    if (!content) return
    const images = makeContentImagesKeyboardAccessible(content)
    let disposed = false
    let animationFrame = 0
    const remeasure = () => {
      window.cancelAnimationFrame(animationFrame)
      animationFrame = window.requestAnimationFrame(() => {
        if (disposed) return
        const geometry = refreshCanvasGeometry()
        measureSelection(geometry)
        measureOverflow(geometry)
      })
    }
    for (const image of images) {
      image.addEventListener('load', remeasure)
      image.addEventListener('error', remeasure)
    }
    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(remeasure)
    resizeObserver?.observe(content)
    const geometry = refreshCanvasGeometry()
    measureSelection(geometry)
    measureOverflow(geometry)
    void document.fonts.ready.then(() => {
      if (!disposed) remeasure()
    })
    return () => {
      disposed = true
      window.cancelAnimationFrame(animationFrame)
      resizeObserver?.disconnect()
      for (const image of images) {
        image.removeEventListener('load', remeasure)
        image.removeEventListener('error', remeasure)
      }
    }
  }, [
    html,
    measureOverflow,
    measureSelection,
    previewScale,
    refreshCanvasGeometry,
  ])

  // 字号、密度、字体与 H1 宽度通过 :root CSS vars 更新，不会改变固定高度的
  // `.content` border-box，因此 ResizeObserver 无法感知。等父级写完变量后在下一帧重测。
  useEffect(() => {
    const animationFrame = window.requestAnimationFrame(() => {
      const geometry = refreshCanvasGeometry()
      measureSelection(geometry)
      measureOverflow(geometry)
    })
    return () => window.cancelAnimationFrame(animationFrame)
  }, [
    isFirstPage,
    layoutRevision,
    measureOverflow,
    measureSelection,
    refreshCanvasGeometry,
    themeClass,
  ])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !gestureRef.current) return
      event.preventDefault()
      cancelGesture()
    }
    const handleBlur = () => cancelGesture()
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('blur', handleBlur)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('blur', handleBlur)
    }
  })

  useEffect(
    () => () => {
      if (!gestureRef.current) return
      restoreGestureDom(gestureRef.current)
      gestureRef.current = null
      onGestureStateChange?.(false)
    },
    [onGestureStateChange],
  )

  function setPageNode(node: HTMLDivElement | null) {
    pageRef.current = node
    setForwardedRef(forwardedRef, node)
  }

  function handlePageClick(event: ReactMouseEvent<HTMLDivElement>) {
    const target = event.target
    if (!(target instanceof Element)) return
    const image = target.closest<HTMLImageElement>('img[data-image-id]')
    const imageId = image?.dataset.imageId
    if (imageId) onSelectImage?.(imageId)
    else onClearSelection?.()
  }

  function handlePageKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    const target = event.target
    if (!(target instanceof HTMLImageElement)) return
    const imageId = target.dataset.imageId
    if (!imageId) return
    event.preventDefault()
    onSelectImage?.(imageId)
  }

  function beginGesture(
    event: ReactPointerEvent<HTMLElement>,
    kind: ActiveGesture['kind'],
    resizeDirection?: ResizeDirection,
  ) {
    const measured = measureSelection()
    const imageId = selectedImageId
    if (!measured || !imageId) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const { box, image, geometry } = measured
    gestureRef.current = {
      kind,
      pointerId: event.pointerId,
      captureTarget: event.currentTarget,
      image,
      imageId,
      startClientX: event.clientX,
      startLeft: box.left,
      startTop: box.top,
      startWidth: box.width,
      startHeight: box.height,
      scale: geometry.scale,
      geometry,
      resizeDirection,
      targetLefts: {
        left: geometry.contentLeft,
        center: geometry.contentCenter - box.width / 2,
        right: geometry.contentRight - box.width,
      },
      originalStyle: image.getAttribute('style'),
      originalAlign: image.getAttribute('data-align'),
      draftWidth: (box.width / geometry.contentWidth) * 100,
      draftAlign: normalizeImageAlign(image.dataset.align),
      snappedWidth: null,
      didMove: false,
    }
    onGestureStateChange?.(true)
  }

  function handleGestureMove(event: ReactPointerEvent<HTMLElement>) {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    event.preventDefault()
    const deltaClient = event.clientX - gesture.startClientX
    if (Math.abs(deltaClient) <= 2 && !gesture.didMove) return
    gesture.didMove = true
    const deltaCanvas = deltaClient / gesture.scale

    if (gesture.kind === 'resize') {
      const direction = gesture.resizeDirection === 'left' ? -1 : 1
      const rawWidth =
        ((gesture.startWidth + deltaCanvas * direction) /
          gesture.geometry.contentWidth) *
        100
      const snapped = snapImageWidth(rawWidth, {
        enabled: snapEnabled,
        altKey: event.altKey,
      })
      gesture.draftWidth = snapped.width
      gesture.snappedWidth = snapped.snappedTo
      gesture.image.style.width = formatImageWidth(snapped.width)
      gesture.image.style.height = 'auto'
      gesture.image.style.removeProperty('transform')
      const align = normalizeImageAlign(gesture.image.dataset.align)
      const nextWidth =
        (gesture.geometry.contentWidth * snapped.width) / 100
      const nextHeight =
        gesture.startWidth > 0
          ? gesture.startHeight * (nextWidth / gesture.startWidth)
          : gesture.startHeight
      setSelectionBox({
        left: alignedImageLeft(align, nextWidth, gesture.geometry),
        top: gesture.startTop,
        width: nextWidth,
        height: nextHeight,
      })
      setFeedback({
        lineX:
          snapped.snappedTo === null
            ? null
            : alignmentGuideX(align, gesture.geometry),
        label:
          snapped.snappedTo === null
            ? `宽度 ${Math.round(snapped.width)}%`
            : `已吸附 · ${snapped.snappedTo}%`,
      })
      return
    }

    const proposedLeft = gesture.startLeft + deltaCanvas
    const snapped = snapImageAlignment(proposedLeft, gesture.targetLefts, {
      enabled: snapEnabled,
      altKey: event.altKey,
      // 阈值用屏幕 12px 换算到画布，不随预览缩放改变手感。
      thresholdPx: 12 / gesture.scale,
    })
    gesture.draftAlign = snapped.align
    gesture.snappedWidth = null
    if (snapped.align) {
      gesture.image.dataset.align = snapped.align
      gesture.image.style.removeProperty('transform')
      setSelectionBox({
        left: gesture.targetLefts[snapped.align],
        top: gesture.startTop,
        width: gesture.startWidth,
        height: gesture.startHeight,
      })
      setFeedback({
        lineX: alignmentGuideX(snapped.align, gesture.geometry),
        label: `已吸附 · ${
          snapped.align === 'left'
            ? '左对齐'
            : snapped.align === 'center'
              ? '居中'
              : '右对齐'
        }`,
      })
    } else {
      gesture.image.dataset.align = normalizeImageAlign(gesture.originalAlign)
      gesture.image.style.transform = `translateX(${deltaCanvas}px)`
      setSelectionBox({
        left: proposedLeft,
        top: gesture.startTop,
        width: gesture.startWidth,
        height: gesture.startHeight,
      })
      setFeedback({ lineX: null, label: '松开后将回到原位' })
    }
  }

  function finishGesture(event: ReactPointerEvent<HTMLElement>) {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    event.preventDefault()
    gestureRef.current = null
    onGestureStateChange?.(false)
    setFeedback({ lineX: null, label: null })
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    if (
      !gesture.didMove ||
      Math.abs(event.clientX - gesture.startClientX) <= 2
    ) {
      restoreGestureDom(gesture)
      measureSelection()
      return
    }

    if (gesture.kind === 'resize') {
      const width = formatImageWidth(gesture.draftWidth)
      const committed = onCommitImage?.(
        gesture.imageId,
        { width },
        `调整为 ${width}`,
      )
      if (!committed) {
        restoreGestureDom(gesture)
        measureSelection()
      }
      return
    }

    if (!gesture.draftAlign) {
      restoreGestureDom(gesture)
      measureSelection()
      return
    }
    const align = gesture.draftAlign
    gesture.image.style.removeProperty('transform')
    const committed = onCommitImage?.(
      gesture.imageId,
      { align },
      align === 'left' ? '左对齐' : align === 'center' ? '居中对齐' : '右对齐',
    )
    if (!committed) {
      restoreGestureDom(gesture)
      measureSelection()
    }
  }

  function cancelGesture() {
    const gesture = gestureRef.current
    if (!gesture) return
    gestureRef.current = null
    onGestureStateChange?.(false)
    restoreGestureDom(gesture)
    try {
      if (gesture.captureTarget.hasPointerCapture(gesture.pointerId)) {
        gesture.captureTarget.releasePointerCapture(gesture.pointerId)
      }
    } catch {
      // 元素已卸载时浏览器可能抛出，DOM 状态已无需处理。
    }
    setFeedback({ lineX: null, label: null })
    measureSelection()
  }

  const shellStyle = {
    '--preview-scale': String(previewScale),
    width: `${CANVAS_WIDTH * previewScale}px`,
    height: `${CANVAS_HEIGHT * previewScale}px`,
  } as CSSProperties
  const interactionLayerStyle = canvasGeometry
    ? ({
        '--page-padding-x': `${canvasGeometry.contentLeft}px`,
        '--page-padding-top': `${canvasGeometry.contentTop}px`,
        '--page-padding-bottom': `${CANVAS_HEIGHT - canvasGeometry.contentBottom}px`,
      } as CSSProperties)
    : undefined

  return (
    <div className="page-preview-group">
      <div className="page-wrapper" style={shellStyle}>
        <div className="page-stage">
          <div
            ref={setPageNode}
            className={cn('page', themeClass, isFirstPage && 'page--first')}
            onClick={handlePageClick}
            onKeyDown={handlePageKeyDown}
          >
            {bgSrc && <img className="bg" src={bgSrc} alt="" />}
            <div className="overlay" />
            {logoSrc && showLogo && (
              <img className="logo" src={logoSrc} alt="" />
            )}
            <div
              ref={contentRef}
              className="content"
              dangerouslySetInnerHTML={contentMarkup}
            />
            {pageTotal > 1 && (
              <div className="page-tag">
                {pageIndex + 1} / {pageTotal}
              </div>
            )}
          </div>

          <div
            className="canvas-interaction-layer"
            data-preview-only=""
            aria-hidden={!selectionBox && !layoutGuidesOn && !cropGuideOn}
            style={interactionLayerStyle}
          >
            {cropGuideOn && isFirstPage && (
              <div
                className="cover-crop-preview"
                style={
                  {
                    '--cover-crop-offset': `${COVER_CROP_TOP}px`,
                  } as CSSProperties
                }
              >
                <div className="cover-crop-mask cover-crop-mask--top" />
                <div className="cover-crop-mask cover-crop-mask--bottom" />
                <div className="cover-crop-label">首图 3:4 可见区</div>
              </div>
            )}

            {layoutGuidesOn && canvasGeometry && (
              <div className="layout-guides">
                <div
                  className="layout-guide layout-guide--left"
                  style={{ left: `${canvasGeometry.contentLeft}px` }}
                />
                <div
                  className="layout-guide layout-guide--center"
                  style={{ left: `${canvasGeometry.contentCenter}px` }}
                />
                <div
                  className="layout-guide layout-guide--right"
                  style={{
                    right: `${CANVAS_WIDTH - canvasGeometry.contentRight}px`,
                  }}
                />
                <div
                  className="layout-guide layout-guide--top"
                  style={{
                    top: `${canvasGeometry.contentTop}px`,
                    left: `${canvasGeometry.contentLeft}px`,
                    right: `${CANVAS_WIDTH - canvasGeometry.contentRight}px`,
                  }}
                />
                <div
                  className="layout-guide layout-guide--bottom"
                  style={{
                    bottom: `${CANVAS_HEIGHT - canvasGeometry.contentBottom}px`,
                    left: `${canvasGeometry.contentLeft}px`,
                    right: `${CANVAS_WIDTH - canvasGeometry.contentRight}px`,
                  }}
                />
                <div
                  className="layout-guide-label"
                  style={{ left: `${canvasGeometry.contentLeft}px` }}
                >
                  排版安全区
                </div>
              </div>
            )}

            {feedback.lineX !== null && (
              <div
                className="snap-guide"
                style={{ left: `${feedback.lineX}px` }}
              />
            )}

            {selectionBox && selectedImageId && (
              <div
                className="image-selection-box"
                style={{
                  left: `${selectionBox.left}px`,
                  top: `${selectionBox.top}px`,
                  width: `${selectionBox.width}px`,
                  height: `${selectionBox.height}px`,
                }}
              >
                <div
                  className="image-drag-grip"
                  aria-hidden="true"
                  title="左右拖动调整对齐；Option/Alt 临时关闭磁吸"
                  onPointerDown={(event) => beginGesture(event, 'align')}
                  onPointerMove={handleGestureMove}
                  onPointerUp={finishGesture}
                  onPointerCancel={cancelGesture}
                  onLostPointerCapture={cancelGesture}
                >
                  <MoveHorizontal aria-hidden="true" />
                </div>
                {(['left', 'right'] as const).flatMap((direction) =>
                  (['top', 'bottom'] as const).map((vertical) => (
                    <span
                      key={`${direction}-${vertical}`}
                      className={`image-resize-handle image-resize-handle--${direction}-${vertical}`}
                      aria-hidden="true"
                      title="等比缩放；Option/Alt 临时关闭磁吸"
                      onPointerDown={(event) =>
                        beginGesture(event, 'resize', direction)
                      }
                      onPointerMove={handleGestureMove}
                      onPointerUp={finishGesture}
                      onPointerCancel={cancelGesture}
                      onLostPointerCapture={cancelGesture}
                    />
                  )),
                )}
              </div>
            )}

            {feedback.label && (
              <div className="gesture-feedback" role="status">
                {feedback.label}
              </div>
            )}

            {overflowing && (
              <div className="canvas-overflow-warning" role="status">
                本页内容已超出安全区，请手动分页
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="page-preview-caption">
        第 {pageIndex + 1} 页 · {CANVAS_WIDTH} × {CANVAS_HEIGHT}
      </div>
    </div>
  )
})
