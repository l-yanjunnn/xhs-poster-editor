import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { coverSlotDataset } from '@/lib/coverSlots'
import { OVERLAY_MAP, type Theme } from '@/lib/themes'
import { resolveAssetSrc } from '@/lib/resolveAsset'
import { resolvePageBackgrounds } from '@/lib/pageBackgrounds'
import { DENSITY_MAP } from '@/lib/density'
import { computeFontSizeVars } from '@/lib/fontSize'
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@/lib/canvas'
import {
  calibratePageTypography,
  calibratePageTypographyNow,
} from '@/lib/opticalTypography'

// 9:15 主题缩略图：渲染缩小的真实 .page，1:1 复用 canvas.css 样式
// 通过 inline style 把主题的 CSS vars 注入到本地容器，不污染 :root
//
// 工作原理：外层 wrapper 固定缩略尺寸 + overflow hidden；
// 内层保持真实画布尺寸并应用 transform: scale(N)。
// .page 类继承 canvas.css 全套样式，CSS var 走 inline 覆盖。

interface Props {
  theme: Theme
  // 相对画布 1080x1800 的缩放比例；默认 0.14 → 大约 151x252
  scale?: number
}

export function ThemePreview({ theme, scale = 0.14 }: Props) {
  const [resolvedAssets, setResolvedAssets] = useState({
    coverBgAssetId: '',
    innerBgAssetId: '',
    logoAssetId: '',
    bgSrc: '',
    logoSrc: '',
  })
  const assetRevisionRef = useRef(0)
  const typographyRevisionRef = useRef(0)
  const pageRef = useRef<HTMLDivElement | null>(null)

  // 解析结果与请求 id pair 绑定。theme 切换后旧 pair 立即失效，
  // 在新资源返回前两个 src 都视为空，避免闪现「新主题 + 旧封面」。
  const assetsAreCurrent =
    resolvedAssets.coverBgAssetId === theme.coverBgAssetId &&
    resolvedAssets.innerBgAssetId === theme.bgAssetId &&
    resolvedAssets.logoAssetId === theme.logoAssetId
  const bgSrc = assetsAreCurrent ? resolvedAssets.bgSrc : ''
  const logoSrc = assetsAreCurrent ? resolvedAssets.logoSrc : ''

  useEffect(() => {
    const revision = ++assetRevisionRef.current
    let alive = true
    ;(async () => {
      const [backgroundResult, logoResult] = await Promise.allSettled([
        resolvePageBackgrounds({
          coverAssetId: theme.coverBgAssetId,
          innerAssetId: theme.bgAssetId,
        }),
        resolveAssetSrc(theme.logoAssetId, 'logo'),
      ])
      if (!alive || revision !== assetRevisionRef.current) return
      setResolvedAssets({
        coverBgAssetId: theme.coverBgAssetId,
        innerBgAssetId: theme.bgAssetId,
        logoAssetId: theme.logoAssetId,
        bgSrc:
          backgroundResult.status === 'fulfilled'
            ? backgroundResult.value.coverSrc
            : '',
        logoSrc: logoResult.status === 'fulfilled' ? logoResult.value : '',
      })
    })()
    return () => {
      alive = false
    }
  }, [theme.bgAssetId, theme.coverBgAssetId, theme.logoAssetId])

  const [overlayColor, overlayOpacity] = OVERLAY_MAP[theme.overlay]
  // 缩略图固定展示首页；除“不显示”外，其余策略首页都会有 Logo。
  const showLogo = theme.logoStrategy !== 'none'

  const cssVars: CSSProperties = {
    ['--font-h1' as never]: theme.fontH1,
    ['--font-h2' as never]: theme.fontH2,
    ['--font-h3' as never]: theme.fontH3,
    ['--font-body' as never]: theme.fontBody,
    // 字重也要注入：否则缩略图继承 :root 上当前 App 状态的 --fw-*，
    // 「不加粗」主题的缩略图会错误显示为粗体
    ['--fw-h1' as never]: theme.h1Bold ? '700' : '400',
    ['--fw-h2' as never]: theme.h2Bold ? '700' : '400',
    ['--fw-h3' as never]: theme.h3Bold ? '700' : '400',
    ['--h1-max-width' as never]: theme.h1Width,
    ['--c-overlay-color' as never]: overlayColor,
    ['--c-overlay-opacity' as never]: String(overlayOpacity),
    ['--c-cover-title' as never]: theme.coverTitleColor,
    ['--c-cover-subtitle' as never]: theme.coverSubtitleColor,
    ...(Object.fromEntries(
      Object.entries(computeFontSizeVars(theme.fontSize)).map(([k, v]) => [
        k,
        v,
      ]),
    ) as CSSProperties),
    ...(Object.fromEntries(
      Object.entries(DENSITY_MAP[theme.density]).map(([k, v]) => [k, v]),
    ) as CSSProperties),
  }
  const isPublicExam = theme.themeClass === 'theme-public-exam-landscape'

  useLayoutEffect(() => {
    if (pageRef.current) calibratePageTypographyNow(pageRef.current, false)
  })

  useLayoutEffect(() => {
    const page = pageRef.current
    if (!page) return
    const controller = new AbortController()
    const revision = ++typographyRevisionRef.current
    void calibratePageTypography(page, {
      signal: controller.signal,
      includeLists: false,
    }).then(() => {
      if (
        controller.signal.aborted ||
        revision !== typographyRevisionRef.current
      ) {
        return
      }
      // 读布局让缩略图在当前帧确认新的光学变量。
      void page.offsetHeight
    })
    return () => controller.abort()
  }, [
    scale,
    theme.density,
    theme.fontH2,
    theme.fontSize,
    theme.h2Bold,
    theme.themeClass,
    theme.coverLayout,
    theme.coverVertical,
    theme.coverSubtitleSpacing,
  ])

  return (
    <div
      style={{
        width: `${CANVAS_WIDTH * scale}px`,
        height: `${CANVAS_HEIGHT * scale}px`,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <div
        style={{
          ...cssVars,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          width: `${CANVAS_WIDTH}px`,
          height: `${CANVAS_HEIGHT}px`,
        }}
      >
        <div
          ref={pageRef}
          className={`page page--first ${theme.themeClass}`}
          style={{ boxShadow: 'none' }}
          {...coverSlotDataset(
            true,
            theme.coverLayout,
            theme.coverVertical,
            theme.coverSubtitleSpacing,
          )}
        >
          {bgSrc && <img className="bg" src={bgSrc} alt="" />}
          <div className="overlay" />
          {showLogo && logoSrc && <img className="logo" src={logoSrc} alt="" />}
          <div className="content">
            {isPublicExam ? (
              <>
                <h1>申论大作文的三个底层结构</h1>
                <p>从审题到卷面，一篇讲透；附 12 个真题句式模板</p>
              </>
            ) : (
              <>
                <h1>小红书风格长图</h1>
                <p>
                  这是一段正文示例。左边是 Tiptap 编辑器，右边是 9:15
                  画布预览。
                </p>
                <h2>二级标题</h2>
                <p>
                  切换顶部主题、字号、间距、字体，右边画布会实时更新。
                </p>
                <h3>三级标题</h3>
                <blockquote>引用块的样式来自 editor.html 的同名 token。</blockquote>
                <ul>
                  <li>列表项 1</li>
                  <li>列表项 2</li>
                </ul>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
