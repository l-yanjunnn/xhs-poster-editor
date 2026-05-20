import { useEffect, useState } from 'react'
import { EditorPane } from '@/components/Editor/Editor'
import { Preview } from '@/components/Preview/Preview'
import { Toolbar } from '@/components/Toolbar/Toolbar'
import {
  OVERLAY_MAP,
  THEMES,
  type DensityLevel,
  type H1Width,
  type LogoStrategy,
  type OverlayKey,
  type ThemeKey,
} from '@/lib/themes'
import { DENSITY_MAP } from '@/lib/density'
import { computeFontSizeVars } from '@/lib/fontSize'
import {
  BUILTIN_BACKGROUNDS,
  BUILTIN_LOGOS,
  findAssetById,
} from '@/lib/builtinAssets'
import './styles/canvas.css'

function App() {
  const [theme, setTheme] = useState<ThemeKey>('')
  // 主题预设展开为独立 state，方便用户在主题基础上微调
  const [fontDisplay, setFontDisplay] = useState(THEMES[''].fontDisplay)
  const [fontBody, setFontBody] = useState(THEMES[''].fontBody)
  const [fontSize, setFontSize] = useState(THEMES[''].fontSize)
  const [density, setDensity] = useState<DensityLevel>(THEMES[''].density)
  const [h1Width, setH1Width] = useState<H1Width>(THEMES[''].h1Width)
  const [overlay, setOverlay] = useState<OverlayKey>(THEMES[''].overlay)
  const [logoStrategy, setLogoStrategy] = useState<LogoStrategy>(
    THEMES[''].logoStrategy,
  )
  const [bgSrc, setBgSrc] = useState(
    findAssetById(BUILTIN_BACKGROUNDS, THEMES[''].bg)?.src ?? '',
  )
  const [logoSrc, setLogoSrc] = useState(
    findAssetById(BUILTIN_LOGOS, THEMES[''].logo)?.src ?? '',
  )
  const [content, setContent] = useState('')

  // 切换主题：一次性应用整套预设到 state
  function applyTheme(key: ThemeKey) {
    const t = THEMES[key]
    setTheme(key)
    setFontDisplay(t.fontDisplay)
    setFontBody(t.fontBody)
    setFontSize(t.fontSize)
    setDensity(t.density)
    setH1Width(t.h1Width)
    setOverlay(t.overlay)
    setLogoStrategy(t.logoStrategy)
    setBgSrc(findAssetById(BUILTIN_BACKGROUNDS, t.bg)?.src ?? '')
    setLogoSrc(findAssetById(BUILTIN_LOGOS, t.logo)?.src ?? '')
  }

  // 把各个 state 翻译成 CSS 变量挂到 :root 上，画布通过变量响应
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--font-display', fontDisplay)
    root.style.setProperty('--font-body', fontBody)
    root.style.setProperty('--h1-max-width', h1Width)

    for (const [k, v] of Object.entries(computeFontSizeVars(fontSize))) {
      root.style.setProperty(k, v)
    }
    for (const [k, v] of Object.entries(DENSITY_MAP[density])) {
      root.style.setProperty(k, v)
    }

    const [color, opacity] = OVERLAY_MAP[overlay]
    root.style.setProperty('--c-overlay-color', color)
    root.style.setProperty('--c-overlay-opacity', String(opacity))
  }, [fontDisplay, fontBody, fontSize, density, h1Width, overlay])

  // 单页阶段：first/first-last 等价于「显示」，none = 不显示
  const showLogo = logoStrategy !== 'none'

  return (
    <div className="flex h-screen flex-col bg-neutral-950">
      <Toolbar
        theme={theme}
        fontDisplay={fontDisplay}
        fontBody={fontBody}
        fontSize={fontSize}
        density={density}
        h1Width={h1Width}
        overlay={overlay}
        logoStrategy={logoStrategy}
        onTheme={applyTheme}
        onFontDisplay={setFontDisplay}
        onFontBody={setFontBody}
        onFontSize={setFontSize}
        onDensity={setDensity}
        onH1Width={setH1Width}
        onOverlay={setOverlay}
        onLogoStrategy={setLogoStrategy}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* 左：编辑器 */}
        <div className="w-[45%] border-r-2 border-neutral-800">
          <EditorPane onUpdate={setContent} />
        </div>

        {/* 右：预览 */}
        <div className="flex flex-1 flex-col items-center gap-6 overflow-y-auto bg-neutral-900 p-8">
          <div className="text-xs text-neutral-500">
            预览缩放 40% · 实际画布 1080 × 1920
          </div>
          <Preview
            html={content}
            themeClass={theme}
            bgSrc={bgSrc}
            logoSrc={logoSrc}
            showLogo={showLogo}
          />
        </div>
      </div>
    </div>
  )
}

export default App
