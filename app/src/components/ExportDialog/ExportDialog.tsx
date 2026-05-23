import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  defaultFilename: string
  pageCount: number
  // 由父组件实际调用 exportPages；这里只负责拿到 filename
  onExport: (filename: string) => Promise<void>
}

// 导出弹窗：让用户重命名后点导出
export function ExportDialog({
  open,
  onOpenChange,
  defaultFilename,
  pageCount,
  onExport,
}: Props) {
  const [filename, setFilename] = useState(defaultFilename)
  const [exporting, setExporting] = useState(false)

  // 每次弹窗打开时用最新的 defaultFilename 重置输入框
  useEffect(() => {
    if (open) {
      setFilename(defaultFilename)
      setExporting(false)
    }
  }, [open, defaultFilename])

  const trimmed = filename.trim()
  const canExport = trimmed.length > 0 && pageCount > 0 && !exporting

  const outputName =
    pageCount === 1 ? `${trimmed || '...'}.png` : `${trimmed || '...'}.zip`

  async function handleExport() {
    if (!canExport) return
    setExporting(true)
    try {
      await onExport(trimmed)
      onOpenChange(false)
    } catch (e) {
      console.error('导出失败', e)
      alert(`导出失败：${(e as Error).message}`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md grid-cols-1"
        description="导出当前画布为 PNG 图片"
      >
        <DialogHeader>
          <DialogTitle>导出 PNG</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">文件名</span>
            <input
              type="text"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canExport) handleExport()
              }}
              autoFocus
              className="rounded border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              placeholder="输入文件名"
            />
          </label>

          <div className="rounded bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            {pageCount === 1 ? (
              <>将导出单页：<span className="font-mono">{outputName}</span></>
            ) : (
              <>
                将导出 {pageCount} 页为 <span className="font-mono">{outputName}</span>
                <br />
                <span className="text-[11px] opacity-70">
                  包内文件命名：{trimmed || '...'}-1.png ~ {trimmed || '...'}-{pageCount}.png
                </span>
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={exporting}
          >
            取消
          </Button>
          <Button onClick={handleExport} disabled={!canExport}>
            {exporting ? '导出中…' : '导出'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
