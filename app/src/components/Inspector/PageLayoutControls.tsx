import type { PageVertical } from '@/lib/pageLayout'

interface Props {
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
  return <fieldset className="page-layout-controls">
    <legend>页面布局</legend>
    <label>整篇空格显示
      <select value={props.whitespaceMode} onChange={event => props.onWhitespace(event.target.value as Props['whitespaceMode'])}>
        <option value="legacy">兼容旧稿（连续普通空格合并显示）</option>
        <option value="preserve">保留连续空格</option>
      </select>
    </label>
    <label>封面顶部偏移 · {props.coverTopOffset} px
      <input aria-label="封面顶部偏移" type="range" min="-120" max="120" step="10" value={props.coverTopOffset} onChange={event => props.onCoverTopOffset(Number(event.target.value))} />
    </label>
    <small>负数上移，0 为主题默认。单位为画布像素。</small>
    <label>设置当前页
      <select value={props.pageIndex} onChange={event => props.onPage(Number(event.target.value))}>
        {props.layouts.map((layout, index) => <option key={layout.id ?? index} value={index}>{index === 0 ? '第 1 页 · 封面' : `第 ${index + 1} 页 · 内页`}</option>)}
      </select>
    </label>
    {props.pageIndex > 0 ? <label>仅当前内页 · 垂直位置
      <select value={props.layouts[props.pageIndex]?.vertical ?? 'inherit'} onChange={event => props.onVertical(event.target.value as PageVertical)}>
        <option value="inherit">继承主题默认</option><option value="top">顶部</option><option value="middle">居中</option><option value="bottom">底部</option>
      </select>
    </label> : <small>封面位置使用下方封面设置；内页可逐页设定。</small>}
  </fieldset>
}
