import { useEffect, useState, type CSSProperties } from 'react'
import { OVERLAY_MAP, type Theme } from '@/lib/themes'
import {
  BUILTIN_BACKGROUNDS,
  BUILTIN_LOGOS,
  findAssetById,
} from '@/lib/builtinAssets'
import { getUserAssetById } from '@/lib/assetStore'
import { DENSITY_MAP } from '@/lib/density'
import { computeFontSizeVars } from '@/lib/fontSize'

// 9:16 主题缩略图：渲染缩小的真实 .page，1:1 复用 canvas.css 样式
// 通过 inline style 把主题的 CSS vars 注入到本地容器，不污染 :root
//
// 工作原理：外层 wrapper 固定缩略尺寸 + overflow hidden；
// 内层保持画布原尺寸 1080x1920 并应用 transform: scale(N)。
// .page 类继承 canvas.css 全套样式，CSS var 走 inline 覆盖。

interface Props {
  theme: Theme
  // 相对画布 1080x1920 的缩放比例；默认 0.14 → 大约 151x269
  scale?: number
}

const CANVAS_W = 1080
const CANVAS_H = 1920

export function ThemePreview({ theme, scale = 0.14 }: Props) {
  const [bgSrc, setBgSrc] = useState('')
  const [logoSrc, setLogoSrc] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      const bg = await resolveSrc(theme.bgAssetId, 'background')
      const logo = await resolveSrc(theme.logoAssetId, 'logo')
      if (alive) {
        setBgSrc(bg)
        setLogoSrc(logo)
      }
    })()
    return () => {
      alive = false
    }
  }, [theme.bgAssetId, theme.logoAssetId])

  const [overlayColor, overlayOpacity] = OVERLAY_MAP[theme.overlay]

  const cssVars: CSSProperties = {
    ['--font-h1' as never]: theme.fontH1,
    ['--font-h2' as never]: theme.fontH2,
    ['--font-h3' as never]: theme.fontH3,
    ['--font-body' as never]: theme.fontBody,
    ['--h1-max-width' as never]: theme.h1Width,
    ['--c-overlay-color' as never]: overlayColor,
    ['--c-overlay-opacity' as never]: String(overlayOpacity),
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

  return (
    <div
      style={{
        width: `${CANVAS_W * scale}px`,
        height: `${CANVAS_H * scale}px`,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <div
        style={{
          ...cssVars,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          width: `${CANVAS_W}px`,
          height: `${CANVAS_H}px`,
        }}
      >
        <div
          className={`page ${theme.themeClass}`}
          style={{ boxShadow: 'none' }}
        >
          {bgSrc && <img className="bg" src={bgSrc} alt="" />}
          <div className="overlay" />
          {logoSrc && <img className="logo" src={logoSrc} alt="" />}
          <div className="content">
            <h1>小红书风格长图</h1>
            <p>这是一段正文示例。左边是 Tiptap 编辑器，右边是 9:16 画布预览。</p>
            <h2>二级标题</h2>
            <p>切换顶部主题、字号、间距、字体，右边画布会实时更新。</p>
            <h3>三级标题</h3>
            <blockquote>引用块的样式来自 editor.html 的同名 token。</blockquote>
            <ul>
              <li>列表项 1</li>
              <li>列表项 2</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

async function resolveSrc(id: string, kind: 'background' | 'logo') {
  if (!id) return ''
  const list = kind === 'background' ? BUILTIN_BACKGROUNDS : BUILTIN_LOGOS
  const builtin = findAssetById(list, id)
  if (builtin) return builtin.src
  const user = await getUserAssetById(id)
  return user?.src ?? ''
}
