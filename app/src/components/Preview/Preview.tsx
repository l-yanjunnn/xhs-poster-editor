import { forwardRef } from 'react'
import { cn } from '@/lib/utils'
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

// 小红书首图被裁切成 4:3，所以第一页（pageIndex===0）走 .page--first 变体
// 让内容整体下移到 4:3 切线下方

// 单页 9:16 预览。Step 6 加分页算法后，App 层负责切页，这里只渲染一页。
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
            <div className="guide guide-v" />
            <div className="guide guide-h" />
          </>
        )}
      </div>
    </div>
  )
})
