import { ImagePlus, Stamp } from 'lucide-react'
import { InspectorCard } from './InspectorCard'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LOGO_STRATEGY_OPTIONS, type LogoStrategy, type ThemeKey } from '@/lib/themes'
import { isLogoVisible, type CoverLogoPosition, type PageLogoVisibility } from '@/lib/logoSettings'

interface Props {
  pageIndex: number
  overrides: PageLogoVisibility[]
  strategy: LogoStrategy
  coverPosition: CoverLogoPosition
  themeClass: ThemeKey
  logoSrc: string
  hasAsset: boolean
  onStrategy: (value: LogoStrategy) => void
  onCoverPosition: (value: CoverLogoPosition) => void
  onVisibility: (value: PageLogoVisibility) => void
  onReset: () => void
  onPick: () => void
  cropGuideOn: boolean
  onCropGuide: (value: boolean) => void
}
export function LogoControls(p: Props) {
  const count = p.overrides.filter(value => value !== 'inherit').length
  const override = p.overrides[p.pageIndex] ?? 'inherit'
  const restricted = p.themeClass === 'theme-public-exam-landscape'
  const visible = p.hasAsset && isLogoVisible(p.strategy, override, p.pageIndex, p.overrides.length, p.themeClass)
  const inherited = p.hasAsset && isLogoVisible(p.strategy, 'inherit', p.pageIndex, p.overrides.length, p.themeClass)
  return <InspectorCard title="Logo" description="整篇共用一个素材；本页可单独设置显示或隐藏。" icon={<Stamp />}>
    <div className="logo-controls">
      <button type="button" className="logo-asset-button" onClick={p.onPick}>
        {p.logoSrc ? <img src={p.logoSrc} alt="当前 Logo" /> : <ImagePlus aria-hidden="true" />}
        <span>{p.hasAsset ? '更换 Logo 素材' : '选择 Logo 素材'}</span>
      </button>
      {restricted && <p className="layout-hint" role="note">公考·山水卷沿用主题约束，不显示 Logo。以下设置会保留，切换其他主题后本页覆盖仍有效。</p>}
      {!p.hasAsset && !restricted && <p className="layout-hint">尚未选择 Logo 素材，当前不会显示。</p>}
      <div className="logo-field"><span id="logo-strategy-label">整篇显示范围</span>
        <Select value={p.strategy} onValueChange={value => p.onStrategy(value as LogoStrategy)}>
          <SelectTrigger aria-labelledby="logo-strategy-label" className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>{LOGO_STRATEGY_OPTIONS.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="logo-overrides-note">
        <p aria-live="polite">{count ? `${count} 页单独设置，修改整篇范围时会保留。` : '所有页面跟随整篇设置。'}</p>
        <button type="button" className="layout-reset" disabled={!count} onClick={p.onReset}>恢复所有页面跟随</button>
      </div>
      <div className="layout-page-settings">
        <div className="layout-scope"><span>仅第 {p.pageIndex + 1} 页{p.pageIndex === 0 ? ' · 封面' : ''}</span><strong aria-live="polite">当前{visible ? '显示' : '隐藏'}</strong></div>
        <div className="logo-field"><span id="page-logo-label">本页 Logo 显示</span>
          <Select value={override} onValueChange={value => p.onVisibility(value as PageLogoVisibility)}>
            <SelectTrigger aria-labelledby="page-logo-label" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="inherit">跟随整篇设置 · {inherited ? '显示' : '隐藏'}</SelectItem>
              <SelectItem value="show">显示</SelectItem><SelectItem value="hide">隐藏</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {p.pageIndex === 0 && <div className="logo-field">
          <span id="cover-logo-label">封面 Logo 位置</span>
          <Select value={p.coverPosition} onValueChange={value => p.onCoverPosition(value as CoverLogoPosition)}>
            <SelectTrigger aria-labelledby="cover-logo-label" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="visible-area">封面可见区右上角</SelectItem>
              <SelectItem value="inner">与内页一致</SelectItem>
              <SelectItem value="outside-area">封面可见范围外右上角</SelectItem>
            </SelectContent>
          </Select>
          <p className="layout-hint">与内页一致可能在裁切后露出部分 Logo；范围外选项让 Logo 底边位于参考线上方 5 px，完整图片仍保留 Logo。隐藏时保留位置。</p>
          <label className="logo-crop-toggle"><input type="checkbox" checked={p.cropGuideOn} onChange={event => p.onCropGuide(event.target.checked)} />显示封面 3:4 裁切参考</label>
          <p className="layout-hint">这是中心裁切模拟；实际平台、设备和发布方式可能不同。完整 PNG 保持 9:15，参考遮罩不导出。</p>
        </div>}
      </div>
    </div>
  </InspectorCard>
}
