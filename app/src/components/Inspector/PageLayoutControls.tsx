import { AlignVerticalDistributeCenter, PanelTop, RotateCcw } from 'lucide-react'
import { InspectorCard } from './InspectorCard'
import type { InnerPagePosition, PageVertical } from '@/lib/pageLayout'

interface Props {
  templateDefault: InnerPagePosition
  pageIndex: number
  layouts: Array<{ id: string | null; vertical: PageVertical }>
  onPage: (index: number) => void
  whitespaceMode: 'legacy' | 'preserve'
  onWhitespace: (mode: 'legacy' | 'preserve') => void
  coverTopOffset: number
  onCoverTopOffset: (offset: number) => void
  onVertical: (vertical: PageVertical) => void
}

export function PageLayoutControls(props: Props) {
  const isCover = props.pageIndex === 0
  const vertical = props.layouts[props.pageIndex]?.vertical ?? 'inherit'
  return (
    <InspectorCard title="页面布局" description="选择一页调整位置，预览会定位到该页。" icon={<PanelTop />}>
      <div className="page-layout-controls">
        <label className="layout-field">设置当前页
          <select value={props.pageIndex} onChange={event => props.onPage(Number(event.target.value))}>
            {props.layouts.map((layout, index) => <option key={layout.id ?? index} value={index}>{index === 0 ? '第 1 页 · 封面' : `第 ${index + 1} 页 · 内页`}</option>)}
          </select>
        </label>
        <div className="layout-page-settings">
          <div className="layout-scope"><span>仅第 {props.pageIndex + 1} 页</span><strong>{isCover ? '封面位置' : '内页位置'}</strong></div>
          {isCover ? <>
            <div className="layout-value-row">
              <label htmlFor="cover-top-offset">封面顶部偏移</label>
              <output htmlFor="cover-top-offset">{props.coverTopOffset > 0 ? '+' : ''}{props.coverTopOffset}<span> px</span></output>
            </div>
            <input id="cover-top-offset" aria-describedby="cover-offset-hint" type="range" min="-120" max="120" step="10" value={props.coverTopOffset} onChange={event => props.onCoverTopOffset(Number(event.target.value))} />
            <div className="layout-range-captions" aria-hidden="true"><span>更靠上</span><span>主题默认</span><span>更靠下</span></div>
            <div className="layout-hint-row"><p id="cover-offset-hint">整体上移或下移封面文字；内页位置独立设置。</p><button type="button" className="layout-reset" disabled={props.coverTopOffset === 0} onClick={() => props.onCoverTopOffset(0)} aria-label="恢复封面默认偏移"><RotateCcw aria-hidden="true" />重置</button></div>
          </> : <>
            <div role="group" aria-label="仅当前内页 · 垂直位置" className="layout-position-options">
              {([['inherit', '默认'], ['top', '顶部'], ['middle', '居中']] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={vertical === value} onClick={() => props.onVertical(value)}><span className={`layout-position-icon is-${value}`} aria-hidden="true">{value === 'inherit' ? <AlignVerticalDistributeCenter /> : <i />}</span>{label}</button>)}
            </div>
            <p className="layout-hint">默认跟随模板（当前：{props.templateDefault === 'top' ? '顶部' : '居中'}）。顶部与 Logo 上缘对齐；居中保留原有留白。</p>
          </>}
        </div>
        <div className="layout-document-settings">
          <div className="layout-scope"><span>整篇文稿</span></div>
          <label className="layout-field">空格显示
            <select aria-label="整篇空格显示" value={props.whitespaceMode} onChange={event => props.onWhitespace(event.target.value as Props['whitespaceMode'])}>
              <option value="legacy">兼容旧稿 · 合并连续空格显示</option>
              <option value="preserve">保留连续空格</option>
            </select>
          </label>
          <p className="layout-hint">仅改变显示方式，保留你输入的原始空格。</p>
        </div>
      </div>
    </InspectorCard>
  )
}
