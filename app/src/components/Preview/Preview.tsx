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
}

// 单页 9:16 预览。Step 6 加分页算法后，App 层负责切页，这里只渲染一页。
export function Preview({
  html,
  themeClass,
  bgSrc,
  logoSrc,
  showLogo = true,
  pageIndex = 0,
  pageTotal = 1,
}: Props) {
  return (
    <div className="page-wrapper">
      <div className={cn('page', themeClass)}>
        {bgSrc && <img className="bg" src={bgSrc} alt="" />}
        <div className="overlay" />
        {logoSrc && showLogo && (
          <img className="logo" src={logoSrc} alt="" />
        )}
        <div
          className="content"
          dangerouslySetInnerHTML={{ __html: html }}
        />
        <div className="page-tag">
          {pageIndex + 1} / {pageTotal}
        </div>
      </div>
    </div>
  )
}
