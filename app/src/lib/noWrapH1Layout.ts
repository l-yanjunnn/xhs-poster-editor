import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import {
  CANVAS_WIDTH,
  PAGE_PADDING_X,
  PUBLIC_EXAM_INNER_PADDING_X,
  coverContentWidthForTheme,
} from './canvas'
import type { CoverLayout } from './coverSlots'
import { normalizeCoverTitleFontSize, type CoverTitleFontSize } from './coverTitle'
import { resolvePageVertical, type InnerPagePosition } from './pageLayout'

export interface H1PhraseMetrics {
  fontFamily: string
  fontSizePx: number
  fontWeight: number
  maxWidthPx: number
  letterSpacingPx?: number
}

export interface NoWrapH1Layout extends H1PhraseMetrics {
  coverTitle?: H1PhraseMetrics
  innerPage?: H1PhraseMetrics
  innerFirstMaxWidthPx?: number
  innerVerticalDefault?: InnerPagePosition
  logoLayoutReserved?: boolean
}

interface Input {
  fontFamily: string
  fontSizePx: number
  fontWeight: number
  h1Width: string
  themeClass: string
  coverLayout: CoverLayout
  coverTitleFontSize?: CoverTitleFontSize
  innerVerticalDefault: InnerPagePosition
  logoLayoutReserved: boolean
}

/** Match canvas.css for each H1 role; an enlarged cover must never size inner-page phrases. */
export function createNoWrapH1Layout(input: Input): NoWrapH1Layout {
  const { fontFamily, fontSizePx, fontWeight, coverLayout, themeClass } = input
  const widthRatio = Number.parseFloat(input.h1Width) / 100
  const coverWidth = coverContentWidthForTheme(themeClass)
  const innerPadding = themeClass === 'theme-public-exam-landscape'
    ? PUBLIC_EXAM_INNER_PADDING_X : PAGE_PADDING_X
  const base: H1PhraseMetrics = {
    fontFamily, fontSizePx, fontWeight,
    maxWidthPx: coverWidth * widthRatio,
    letterSpacingPx: -0.5,
  }
  const coverFontSize = normalizeCoverTitleFontSize(input.coverTitleFontSize)
    ?? fontSizePx * (coverLayout === 'kicker-above' ? 1.16 : 1)
  return {
    ...base,
    coverTitle: {
      ...base,
      fontSizePx: coverFontSize,
      maxWidthPx: coverLayout === 'poster-center' ? coverWidth : base.maxWidthPx,
      letterSpacingPx: coverLayout === 'kicker-above' || themeClass === 'theme-public-exam-landscape'
        ? coverFontSize * 0.01 : -0.5,
    },
    innerPage: { ...base, maxWidthPx: (CANVAS_WIDTH - innerPadding * 2) * widthRatio },
    // canvas.css reserves the first row beside the logo, including its 24px gap.
    innerFirstMaxWidthPx: CANVAS_WIDTH - innerPadding - 60 - 120 - 24,
    innerVerticalDefault: input.innerVerticalDefault,
    logoLayoutReserved: input.logoLayoutReserved,
  }
}

/** Position is the heading's document position (before the node, not its first character). */
export function resolveNoWrapH1Layout(
  doc: ProseMirrorNode,
  position: number,
  layout: NoWrapH1Layout,
): { metrics: H1PhraseMetrics; isCoverTitle: boolean } {
  let pageIndex = 0
  let isFirstBlock = true
  let foundCoverTitle = false
  let vertical: unknown = null
  let reserveLogo = true
  let result = { metrics: layout as H1PhraseMetrics, isCoverTitle: false }
  doc.forEach((node, offset) => {
    if (offset > position) return
    if (node.type.name === 'horizontalRule') {
      pageIndex += 1
      isFirstBlock = true
      vertical = node.attrs.pageVertical
      reserveLogo = node.attrs.logoLayoutReserved !== false
      return
    }
    const isTopLevelH1 = node.type.name === 'heading' && node.attrs.level === 1
    const isCoverTitle = pageIndex === 0 && isTopLevelH1 && !foundCoverTitle
    if (isCoverTitle) foundCoverTitle = true
    if (position < offset + node.nodeSize) {
      if (isCoverTitle && offset === position) {
        result = { metrics: layout.coverTitle ?? layout, isCoverTitle: true }
      } else if (pageIndex > 0) {
        const metrics = layout.innerPage ?? layout
        const besideLogo = isFirstBlock && offset === position &&
          layout.logoLayoutReserved && reserveLogo &&
          resolvePageVertical(vertical, layout.innerVerticalDefault) === 'top'
        result = {
          metrics: besideLogo && layout.innerFirstMaxWidthPx !== undefined
            ? { ...metrics, maxWidthPx: Math.min(metrics.maxWidthPx, layout.innerFirstMaxWidthPx) }
            : metrics,
          isCoverTitle: false,
        }
      }
    }
    isFirstBlock = false
  })
  return result
}
