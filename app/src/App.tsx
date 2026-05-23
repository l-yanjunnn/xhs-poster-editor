import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EditorPane, type EditorHandle } from '@/components/Editor/Editor'
import { Preview } from '@/components/Preview/Preview'
import { Toolbar } from '@/components/Toolbar/Toolbar'
import { AssetLibrary } from '@/components/AssetLibrary/AssetLibrary'
import { FontLibrary } from '@/components/FontLibrary/FontLibrary'
import { ThemeLibrary } from '@/components/ThemeLibrary/ThemeLibrary'
import { ExportDialog } from '@/components/ExportDialog/ExportDialog'
import {
  BUILTIN_THEMES,
  DEFAULT_THEME,
  OVERLAY_MAP,
  type DensityLevel,
  type H1Width,
  type LogoStrategy,
  type OverlayKey,
  type Theme,
  type ThemeKey,
} from '@/lib/themes'
import {
  listUserThemes,
  newUserThemeId,
  putUserTheme,
} from '@/lib/themeStore'
import { DENSITY_MAP } from '@/lib/density'
import { computeFontSizeVars } from '@/lib/fontSize'
import {
  BUILTIN_BACKGROUNDS,
  BUILTIN_LOGOS,
  findAssetById,
  type Asset,
} from '@/lib/builtinAssets'
import { loadAllUserFonts } from '@/lib/fontRegistry'
import { listUserFonts } from '@/lib/fontStore'
import { getUserAssetById } from '@/lib/assetStore'
import { splitIntoPages } from '@/lib/splitPages'
import { exportPages, suggestFilename } from '@/lib/exportPng'
import './styles/canvas.css'

function App() {
  // 主题对应的色彩 CSS class（作用在 .page div 上）
  const [themeClass, setThemeClass] = useState<ThemeKey>(DEFAULT_THEME.themeClass)

  // 主题字段展开为独立 state，便于用户在主题基础上微调
  const [fontH1, setFontH1] = useState(DEFAULT_THEME.fontH1)
  const [fontH2, setFontH2] = useState(DEFAULT_THEME.fontH2)
  const [fontH3, setFontH3] = useState(DEFAULT_THEME.fontH3)
  const [fontBody, setFontBody] = useState(DEFAULT_THEME.fontBody)
  const [fontSize, setFontSize] = useState(DEFAULT_THEME.fontSize)
  const [density, setDensity] = useState<DensityLevel>(DEFAULT_THEME.density)
  const [h1Width, setH1Width] = useState<H1Width>(DEFAULT_THEME.h1Width)
  const [overlay, setOverlay] = useState<OverlayKey>(DEFAULT_THEME.overlay)
  const [logoStrategy, setLogoStrategy] = useState<LogoStrategy>(
    DEFAULT_THEME.logoStrategy,
  )

  // 资源同时持有 id（用于主题序列化）和 src（用于渲染）
  const [bgAssetId, setBgAssetId] = useState(DEFAULT_THEME.bgAssetId)
  const [logoAssetId, setLogoAssetId] = useState(DEFAULT_THEME.logoAssetId)
  const [bgSrc, setBgSrc] = useState(
    findAssetById(BUILTIN_BACKGROUNDS, DEFAULT_THEME.bgAssetId)?.src ?? '',
  )
  const [logoSrc, setLogoSrc] = useState(
    findAssetById(BUILTIN_LOGOS, DEFAULT_THEME.logoAssetId)?.src ?? '',
  )

  const [content, setContent] = useState('')
  const editorRef = useRef<EditorHandle>(null)

  // 当前已应用的主题 id；null = 用户微调过、已脱离任何主题
  const [currentThemeId, setCurrentThemeId] = useState<string | null>(
    DEFAULT_THEME.id,
  )

  const [assetLibOpen, setAssetLibOpen] = useState(false)
  const [fontLibOpen, setFontLibOpen] = useState(false)
  const [themeLibOpen, setThemeLibOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  // 收集多页 .page DOM 节点供导出截图使用
  const pageRefs = useRef<(HTMLDivElement | null)[]>([])
  const [userFontFamilies, setUserFontFamilies] = useState<string[]>([])
  // 用户保存的主题列表，由 App 集中维护，同时供 Toolbar 下拉和 ThemeLibrary 卡片使用
  const [userThemes, setUserThemes] = useState<Theme[]>([])

  useEffect(() => {
    loadAllUserFonts().then(setUserFontFamilies)
    listUserThemes().then(setUserThemes)
  }, [])

  const reloadUserFonts = useCallback(async () => {
    const fonts = await listUserFonts()
    setUserFontFamilies(fonts.map((f) => f.family))
  }, [])

  const reloadUserThemes = useCallback(async () => {
    setUserThemes(await listUserThemes())
  }, [])

  // 通过 assetId 反查 src：builtin 走静态表，user 走 IndexedDB
  async function resolveAssetSrc(
    id: string,
    kind: 'background' | 'logo',
  ): Promise<string> {
    if (!id) return ''
    const builtinList =
      kind === 'background' ? BUILTIN_BACKGROUNDS : BUILTIN_LOGOS
    const builtin = findAssetById(builtinList, id)
    if (builtin) return builtin.src
    const user = await getUserAssetById(id)
    return user?.src ?? ''
  }

  // 应用主题：把 Theme 所有字段写回 App state；含正文则替换 editor
  async function applyTheme(theme: Theme) {
    setThemeClass(theme.themeClass)
    setFontH1(theme.fontH1)
    setFontH2(theme.fontH2)
    setFontH3(theme.fontH3)
    setFontBody(theme.fontBody)
    setFontSize(theme.fontSize)
    setDensity(theme.density)
    setH1Width(theme.h1Width)
    setOverlay(theme.overlay)
    setLogoStrategy(theme.logoStrategy)
    setBgAssetId(theme.bgAssetId)
    setLogoAssetId(theme.logoAssetId)
    setBgSrc(await resolveAssetSrc(theme.bgAssetId, 'background'))
    setLogoSrc(await resolveAssetSrc(theme.logoAssetId, 'logo'))
    setCurrentThemeId(theme.id)
    if (theme.contentJSON) {
      editorRef.current?.setContent(theme.contentJSON)
    }
  }

  // 把当前 App state 打包成新主题保存
  async function saveCurrentAsTheme(name: string, includeContent: boolean) {
    const theme: Theme = {
      id: newUserThemeId(),
      name,
      isBuiltin: false,
      createdAt: Date.now(),
      themeClass,
      overlay,
      h1Width,
      fontH1,
      fontH2,
      fontH3,
      fontBody,
      fontSize,
      density,
      logoStrategy,
      bgAssetId,
      logoAssetId,
      contentJSON: includeContent ? editorRef.current?.getJSON() ?? null : null,
    }
    await putUserTheme(theme)
    setCurrentThemeId(theme.id)
  }

  // 用户从 Toolbar 改动任何样式 → 脱离当前主题
  function customize<T>(setter: (v: T) => void): (v: T) => void {
    return (v) => {
      setter(v)
      setCurrentThemeId(null)
    }
  }

  // Toolbar 主题下拉：通过 id 查找主题然后 apply
  function handleSelectThemeById(themeId: string) {
    const theme =
      BUILTIN_THEMES.find((t) => t.id === themeId) ??
      userThemes.find((t) => t.id === themeId)
    if (theme) applyTheme(theme)
  }

  function handlePickBackground(asset: Asset) {
    setBgAssetId(asset.id)
    setBgSrc(asset.src)
    setCurrentThemeId(null)
  }
  function handlePickLogo(asset: Asset) {
    setLogoAssetId(asset.id)
    setLogoSrc(asset.src)
    setCurrentThemeId(null)
  }

  // CSS var 注入
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--font-h1', fontH1)
    root.style.setProperty('--font-h2', fontH2)
    root.style.setProperty('--font-h3', fontH3)
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
  }, [fontH1, fontH2, fontH3, fontBody, fontSize, density, h1Width, overlay])

  const pages = useMemo(() => splitIntoPages(content), [content])

  async function handleExport(filename: string) {
    const els = pageRefs.current.filter((el): el is HTMLDivElement => el !== null)
    await exportPages(els, filename)
  }

  function shouldShowLogo(pageIndex: number, total: number): boolean {
    switch (logoStrategy) {
      case 'every':
        return true
      case 'first':
        return pageIndex === 0
      case 'first-last':
        return pageIndex === 0 || pageIndex === total - 1
      case 'none':
        return false
    }
  }

  return (
    <div className="flex h-screen flex-col bg-neutral-950">
      <Toolbar
        currentThemeId={currentThemeId}
        userThemes={userThemes}
        onTheme={handleSelectThemeById}
        fontH1={fontH1}
        fontH2={fontH2}
        fontH3={fontH3}
        fontBody={fontBody}
        fontSize={fontSize}
        density={density}
        h1Width={h1Width}
        overlay={overlay}
        logoStrategy={logoStrategy}
        userFontFamilies={userFontFamilies}
        onFontH1={customize(setFontH1)}
        onFontH2={customize(setFontH2)}
        onFontH3={customize(setFontH3)}
        onFontBody={customize(setFontBody)}
        onFontSize={customize(setFontSize)}
        onDensity={customize(setDensity)}
        onH1Width={customize(setH1Width)}
        onOverlay={customize(setOverlay)}
        onLogoStrategy={customize(setLogoStrategy)}
        onOpenAssetLibrary={() => setAssetLibOpen(true)}
        onOpenFontLibrary={() => setFontLibOpen(true)}
        onOpenThemeLibrary={() => setThemeLibOpen(true)}
        onExport={() => setExportOpen(true)}
      />

      <AssetLibrary
        open={assetLibOpen}
        onOpenChange={setAssetLibOpen}
        currentBgSrc={bgSrc}
        currentLogoSrc={logoSrc}
        onPickBackground={handlePickBackground}
        onPickLogo={handlePickLogo}
      />

      <FontLibrary
        open={fontLibOpen}
        onOpenChange={setFontLibOpen}
        onFontsChanged={reloadUserFonts}
      />

      <ThemeLibrary
        open={themeLibOpen}
        onOpenChange={setThemeLibOpen}
        userThemes={userThemes}
        currentThemeId={currentThemeId}
        onApply={applyTheme}
        onSaveCurrent={saveCurrentAsTheme}
        onReload={reloadUserThemes}
      />

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        defaultFilename={suggestFilename(content)}
        pageCount={pages.length}
        onExport={handleExport}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* 左：编辑器 */}
        <div className="w-[45%] border-r-2 border-neutral-800">
          <EditorPane ref={editorRef} onUpdate={setContent} />
        </div>

        {/* 右：预览（多页纵向滚动） */}
        <div className="flex flex-1 flex-col items-center gap-6 overflow-y-auto bg-neutral-900 p-8">
          <div className="text-xs text-neutral-500">
            预览缩放 40% · 实际画布 1080 × 1920 · 共 {pages.length} 页
          </div>
          {pages.map((pageHtml, i) => (
            <Preview
              key={i}
              ref={(el) => {
                pageRefs.current[i] = el
              }}
              html={pageHtml}
              themeClass={themeClass}
              bgSrc={bgSrc}
              logoSrc={logoSrc}
              showLogo={shouldShowLogo(i, pages.length)}
              pageIndex={i}
              pageTotal={pages.length}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export default App
