import { useState } from 'react'
import { AlertTriangle, ArrowUpRight, LoaderCircle, Scissors } from 'lucide-react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@/lib/canvas'
import { CLIPPING_PREVIEW_MARGIN, type VerifiedExport } from '@/lib/verifiedExport'
import type { PageGeometryIssue } from '@/lib/pageGeometry'

/** A magnified view of the actual overflowing artwork, centered on the nearest cut edge. */
function boundaryView(issue: PageGeometryIssue) {
  const b = issue.bounds ?? { x: 0, y: CANVAS_HEIGHT, width: CANVAS_WIDTH, height: 0 }
  const w = 660, h = 360, margin = CLIPPING_PREVIEW_MARGIN
  const x = b.x < -1 ? 0 : b.x + b.width > CANVAS_WIDTH + 1 ? CANVAS_WIDTH : b.x + b.width / 2
  const y = b.y < -1 ? 0 : b.y + b.height > CANVAS_HEIGHT + 1 ? CANVAS_HEIGHT : b.y + b.height / 2
  return `${Math.max(-margin, Math.min(CANVAS_WIDTH + margin - w, x - w / 2))} ${Math.max(-margin, Math.min(CANVAS_HEIGHT + margin - h, y - h / 2))} ${w} ${h}`
}

export function ClippingConfirmation({ open, prepared, loading, progress, error, pageNumbers, onCancel, onConfirm }: {
  open: boolean
  prepared: VerifiedExport | null
  loading: boolean
  progress: { current: number; total: number }
  error: string | null
  pageNumbers: number[]
  onCancel: () => void
  onConfirm: () => void
}) {
  const [selectedPage, setSelectedPage] = useState<number | null>(null)
  const [selectedBlock, setSelectedBlock] = useState<number | null>(null)
  const clipped = prepared?.pages.filter(page => page.clipping) ?? []
  const active = clipped.find(page => page.pageNumber === selectedPage) ?? clipped[0]
  const issue = active?.clipping?.issues.find(issue => issue.blockIndex === selectedBlock) ?? active?.clipping?.issues[0]
  const numbers = clipped.length ? clipped.map(page => page.pageNumber) : pageNumbers
  const margin = CLIPPING_PREVIEW_MARGIN
  return <Dialog open={open} onOpenChange={next => { if (!next) onCancel() }}>
    <DialogContent className="grid max-h-[calc(100dvh-40px)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-[920px]"
      description={`第 ${numbers.join('、')} 页有内容超出画布。画布外的部分不会出现在 PNG 中，请查看预览后决定是否仍要导出。`}>
      <DialogHeader className="border-b border-neutral-200 px-6 py-5 pr-14">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800"><Scissors className="size-5" aria-hidden="true" /></span>
          <div><DialogTitle className="text-lg font-semibold">部分内容会被裁切，仍要导出吗？</DialogTitle>
            <p className="mt-2 text-xs leading-5 text-neutral-500">画布外的文字或图片将不会出现在导出的 PNG 中。</p></div>
        </div>
      </DialogHeader>
      <div className="min-h-0 space-y-4 overflow-y-auto px-6 py-5">
        <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-950" role="status">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p><strong>第 {numbers.join('、') || '—'} 页超出画布。</strong> 如果这是你希望保留的裁切效果，可以确认导出；如需保留完整内容，请返回调整分页、字号或位置。</p>
        </div>
        {loading ? <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-sm text-neutral-600" role="status">
          <LoaderCircle className="size-6 animate-spin" aria-hidden="true" /><p>正在生成裁切预览… {progress.current} / {progress.total}</p>
          <p className="text-xs text-neutral-400">预览完成后可确认导出</p>
        </div> : null}
        {!loading && error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
        {!loading && active && issue && <>
          <div className="flex flex-wrap items-center gap-2" aria-label="选择裁切页面">
            <span className="mr-1 text-xs text-neutral-500">查看页面</span>
            {clipped.map(page => <Button key={page.pageNumber} size="sm" variant={page.pageNumber === active.pageNumber ? 'default' : 'outline'}
              aria-pressed={page.pageNumber === active.pageNumber} onClick={() => { setSelectedPage(page.pageNumber); setSelectedBlock(null) }}>第 {page.pageNumber} 页</Button>)}
          </div>
          <div className="grid gap-4 sm:grid-cols-[1.35fr_1fr]">
            <section className="overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50">
              <div className="border-b border-neutral-200 bg-white px-4 py-3"><h3 className="text-xs font-semibold">裁切位置 · 放大预览</h3><p className="mt-1 text-[11px] text-neutral-500">橙色虚线是画布边界，浅橙区域不会导出</p></div>
              <svg viewBox={boundaryView(issue)} role="img" aria-label={`第 ${active.pageNumber} 页第 ${issue.blockIndex + 1} 段裁切位置放大预览`} className="block aspect-[11/6] w-full bg-neutral-100">
                <image href={active.clipping!.previewUrl} x={-margin} y={-margin} width={CANVAS_WIDTH + margin * 2} height={CANVAS_HEIGHT + margin * 2} />
                <path d={`M${-margin},${-margin}H${CANVAS_WIDTH + margin}V${CANVAS_HEIGHT + margin}H${-margin}Z M0,0V${CANVAS_HEIGHT}H${CANVAS_WIDTH}V0Z`} fill="#f59e0b" fillOpacity="0.16" fillRule="evenodd" />
                <rect x="0" y="0" width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill="none" stroke="#d97706" strokeWidth="3" strokeDasharray="10 7" />
              </svg>
              <div className="space-y-2 border-t border-neutral-200 bg-white p-4">
                <p className="text-xs font-medium text-neutral-800">第 {active.pageNumber} 页 · 第 {issue.blockIndex + 1} 段</p>
                {issue.blockText ? <p className="break-words text-xs leading-5 text-neutral-500">原段落：{issue.blockText}{issue.blockText.length >= 80 ? '…' : ''}</p> : <p className="text-xs text-neutral-500">该内容块包含超出画布的图片或元素。</p>}
                {active.clipping!.issues.length > 1 && <div className="flex flex-wrap gap-2" aria-label="选择裁切段落">{active.clipping!.issues.map(item => <button key={item.blockIndex} type="button" className="rounded border border-neutral-200 px-2 py-1 text-xs aria-pressed:border-amber-500 aria-pressed:bg-amber-50" aria-pressed={item.blockIndex === issue.blockIndex} onClick={() => setSelectedBlock(item.blockIndex)}>第 {item.blockIndex + 1} 段</button>)}</div>}
              </div>
            </section>
            <section className="flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50">
              <div className="border-b border-neutral-200 bg-white px-4 py-3"><h3 className="text-xs font-semibold">实际导出效果</h3><p className="mt-1 text-[11px] text-neutral-500">确认后将下载这张 PNG，不会自动缩小或补齐</p></div>
              <a href={active.previewUrl} target="_blank" rel="noreferrer" className="flex min-h-0 flex-1 items-center justify-center p-4" aria-label={`放大查看第 ${active.pageNumber} 页实际裁切 PNG`}>
                <img src={active.previewUrl} alt={`第 ${active.pageNumber} 页裁切后的实际 PNG`} className="max-h-[310px] max-w-full object-contain shadow-sm" />
              </a>
              <p className="flex items-center justify-center gap-1 pb-3 text-[11px] text-neutral-500">点击图片查看完整尺寸 <ArrowUpRight className="size-3" aria-hidden="true" /></p>
            </section>
          </div>
          <p className="text-[11px] leading-5 text-neutral-500">左侧展示边界附近的内容，右侧为完整画布的实际 PNG。此次裁切确认会记录在导出清单中。</p>
        </>}
      </div>
      <DialogFooter className="m-0 flex-col gap-3 rounded-none px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-xs text-neutral-500">{prepared ? `本次将导出 ${prepared.pages.length} 张图片` : '仅在本地生成预览，尚未下载'}</span>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onCancel}>返回调整</Button><Button disabled={loading || !prepared || Boolean(error)} onClick={onConfirm}>确认裁切并导出</Button></div>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
