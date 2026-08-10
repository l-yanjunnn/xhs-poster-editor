import { forwardRef, type CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import { COVER_CROP_TOP } from '@/lib/canvas'
import type { ThemeKey } from '@/lib/themes'

interface Props {
  html: string
  themeClass: ThemeKey
  bgSrc?: string
  logoSrc?: string
  showLogo?: boolean
  pageIndex?: number
  pageTotal?: number
  guidesOn?: boolean
}

// 所有页面真实输出 9:15；第一页额外显示平台信息流 3:4 中心裁切参考。

// 单页 9:15 预览。Step 6 加分页算法后，App 层负责切页，这里只渲染一页。
// Step 7：ref 暴露内部 .page 节点给 html2canvas 截图用
export const Preview = forwardRef<HTMLDivElement, Props>(function Preview(
  {
    html,
    themeClass,
    bgSrc,
    logoSrc,
    showLogo = true,
    pageIndex = 0,
    pageTotal = 1,
    guidesOn = false,
  },
  ref,
) {
  const isFirstPage = pageIndex === 0
  return (
    <div className="page-wrapper">
      <div
        ref={ref}
        className={cn('page', themeClass, isFirstPage && 'page--first')}
      >
        {bgSrc && <img className="bg" src={bgSrc} alt="" />}
        <div className="overlay" />
        {logoSrc && showLogo && (
          <img className="logo" src={logoSrc} alt="" />
        )}
        <div
          className="content"
          dangerouslySetInnerHTML={{ __html: html }}
        />
        {pageTotal > 1 && (
          <div className="page-tag">
            {pageIndex + 1} / {pageTotal}
          </div>
        )}
        {guidesOn && (
          <>
            {isFirstPage && (
              <div
                className="cover-crop-preview"
                data-preview-only=""
                aria-hidden="true"
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
            <div className="guide guide-v" data-preview-only="" />
            <div className="guide guide-h" data-preview-only="" />
          </>
        )}
      </div>
    </div>
  )
})
