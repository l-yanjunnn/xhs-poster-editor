import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
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
  CANVAS_CONTENT_WIDTH,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  COVER_CROP_TOP,
  PAGE_PADDING_X,
} from '@/lib/canvas'
import {
  formatImageWidth,
  normalizeImageAlign,
  snapImageAlignment,
  snapImageWidth,
  type ImageAlign,
} from '@/lib/imageModel'
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

type ResizeDirection = 'left' | 'right'

interface ActiveGesture {
  kind: 'resize' | 'align'
  pointerId: number
  captureTarget: HTMLElement
  image: HTMLImageElement
  imageId: string
  startClientX: number
  startLeft: number
  startWidth: number
  scale: number
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

const PAGE_PADDING_TOP = 300
const FIRST_PAGE_PADDING_TOP = 320
const PAGE_PADDING_BOTTOM = 160

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
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null)
  const [feedback, setFeedback] = useState<GestureFeedback>({
    lineX: null,
    label: null,
  })
  const [overflowing, setOverflowing] = useState(false)
  const isFirstPage = pageIndex === 0

  // `dangerouslySetInnerHTML` 的容器可能在任意父级更新中重用或
  // 重建后代节点。每次 commit 后都恢复图片语义，避免可键盘操作性丢失。
  useLayoutEffect(() => {
    if (contentRef.current) {
      makeContentImagesKeyboardAccessible(contentRef.current)
    }
  })

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

  const measureSelection = useCallback(() => {
    const page = pageRef.current
    const image = findSelectedImage()
    if (!page || !image) {
      setSelectionBox((previous) => (previous === null ? previous : null))
      return null
    }
    const pageRect = page.getBoundingClientRect()
    const imageRect = image.getBoundingClientRect()
    const scale = pageRect.width / CANVAS_WIDTH
    if (!Number.isFinite(scale) || scale <= 0) return null
    const box = {
      left: (imageRect.left - pageRect.left) / scale,
      top: (imageRect.top - pageRect.top) / scale,
      width: imageRect.width / scale,
      height: imageRect.height / scale,
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
    return { box, image, scale }
  }, [findSelectedImage])

  const measureOverflow = useCallback(() => {
    const page = pageRef.current
    const content = contentRef.current
    if (!page || !content) return
    const last = content.lastElementChild
    if (!last) {
      setOverflowing(false)
      return
    }
    const pageRect = page.getBoundingClientRect()
    const lastRect = last.getBoundingClientRect()
    const scale = pageRect.width / CANVAS_WIDTH
    const safeBottom = pageRect.bottom - PAGE_PADDING_BOTTOM * scale
    setOverflowing(lastRect.bottom > safeBottom + 1)
  }, [])

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
        measureSelection()
        measureOverflow()
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
    measureSelection()
    measureOverflow()
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
  }, [html, measureOverflow, measureSelection, previewScale])

  // 字号、密度、字体与 H1 宽度通过 :root CSS vars 更新，不会改变固定高度的
  // `.content` border-box，因此 ResizeObserver 无法感知。等父级写完变量后在下一帧重测。
  useEffect(() => {
    const animationFrame = window.requestAnimationFrame(() => {
      measureSelection()
      measureOverflow()
    })
    return () => window.cancelAnimationFrame(animationFrame)
  }, [layoutRevision, measureOverflow, measureSelection, themeClass])

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
    const { box, image, scale } = measured
    gestureRef.current = {
      kind,
      pointerId: event.pointerId,
      captureTarget: event.currentTarget,
      image,
      imageId,
      startClientX: event.clientX,
      startLeft: box.left,
      startWidth: box.width,
      scale,
      resizeDirection,
      targetLefts: {
        left: PAGE_PADDING_X,
        center: PAGE_PADDING_X + (CANVAS_CONTENT_WIDTH - box.width) / 2,
        right: PAGE_PADDING_X + CANVAS_CONTENT_WIDTH - box.width,
      },
      originalStyle: image.getAttribute('style'),
      originalAlign: image.getAttribute('data-align'),
      draftWidth: (box.width / CANVAS_CONTENT_WIDTH) * 100,
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
        ((gesture.startWidth + deltaCanvas * direction) / CANVAS_CONTENT_WIDTH) *
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
      setFeedback({
        lineX:
          snapped.snappedTo === null
            ? null
            : align === 'left'
              ? PAGE_PADDING_X
              : align === 'center'
                ? CANVAS_WIDTH / 2
                : CANVAS_WIDTH - PAGE_PADDING_X,
        label:
          snapped.snappedTo === null
            ? `宽度 ${Math.round(snapped.width)}%`
            : `已吸附 · ${snapped.snappedTo}%`,
      })
      measureSelection()
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
      setFeedback({
        lineX:
          snapped.align === 'left'
            ? PAGE_PADDING_X
            : snapped.align === 'center'
              ? CANVAS_WIDTH / 2
              : CANVAS_WIDTH - PAGE_PADDING_X,
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
      setFeedback({ lineX: null, label: '松开后将回到原位' })
    }
    measureSelection()
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
      if (!committed) restoreGestureDom(gesture)
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
    if (!committed) restoreGestureDom(gesture)
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
              dangerouslySetInnerHTML={{ __html: html }}
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

            {layoutGuidesOn && (
              <div className="layout-guides">
                <div className="layout-guide layout-guide--left" />
                <div className="layout-guide layout-guide--center" />
                <div className="layout-guide layout-guide--right" />
                <div
                  className="layout-guide layout-guide--top"
                  style={{
                    top: `${isFirstPage ? FIRST_PAGE_PADDING_TOP : PAGE_PADDING_TOP}px`,
                  }}
                />
                <div className="layout-guide layout-guide--bottom" />
                <div className="layout-guide-label">排版安全区</div>
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
