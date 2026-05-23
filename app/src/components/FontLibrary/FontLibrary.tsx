import { useEffect, useId, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  deleteUserFont,
  fileNameToFamily,
  listUserFonts,
  putUserFont,
  type StoredFont,
} from '@/lib/fontStore'
import { registerFontFromBlob, unregisterFont } from '@/lib/fontRegistry'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  // 字体增减后通知 App 刷新下拉列表
  onFontsChanged: () => void
}

export function FontLibrary(p: Props) {
  const [fonts, setFonts] = useState<StoredFont[]>([])
  const [uploading, setUploading] = useState(false)
  // Why: 用 label htmlFor 原生关联触发 file picker，绕过 Radix Dialog Portal 中 ref.click() 可能静默失败的脆弱链路
  const fileInputId = useId()

  useEffect(() => {
    if (!p.open) return
    listUserFonts().then(setFonts)
  }, [p.open])

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        if (!/\.(ttf|otf|woff2?|ttc)$/i.test(file.name)) continue
        const family = fileNameToFamily(file.name)
        // 先注册到 document.fonts，注册失败（文件损坏）就不存 IndexedDB
        try {
          await registerFontFromBlob(family, file)
        } catch (e) {
          console.warn('字体注册失败：', file.name, e)
          continue
        }
        await putUserFont(family, file)
      }
      setFonts(await listUserFonts())
      p.onFontsChanged()
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(family: string) {
    unregisterFont(family)
    await deleteUserFont(family)
    setFonts(await listUserFonts())
    p.onFontsChanged()
  }

  return (
    <Dialog open={p.open} onOpenChange={p.onOpenChange}>
      <DialogContent className="grid-cols-1 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>字体库</DialogTitle>
        </DialogHeader>

        <Dropzone
          uploading={uploading}
          onFiles={handleFiles}
          inputId={fileInputId}
        />
        <input
          id={fileInputId}
          type="file"
          accept=".ttf,.otf,.woff,.woff2,.ttc"
          multiple
          className="sr-only"
          onChange={(e) => {
            handleFiles(e.target.files)
            e.target.value = ''
          }}
        />

        <div className="mt-2">
          {fonts.length === 0 ? (
            <div className="py-6 text-center text-sm text-neutral-500">
              还没有上传任何字体
            </div>
          ) : (
            <div className="grid max-h-[420px] grid-cols-1 gap-2 overflow-y-auto p-1">
              {fonts.map((f) => (
                <FontCard
                  key={f.family}
                  font={f}
                  onDelete={() => handleDelete(f.family)}
                />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function FontCard({
  font,
  onDelete,
}: {
  font: StoredFont
  onDelete: () => void
}) {
  return (
    <div className="group relative flex items-center justify-between rounded border border-neutral-700 bg-neutral-900 px-4 py-3 hover:border-neutral-500">
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs text-neutral-500">{font.fileName}</div>
        <div
          className="truncate text-2xl text-neutral-100"
          style={{ fontFamily: `"${font.family}"` }}
        >
          {font.family} · AaBb 你好 1234
        </div>
      </div>
      <button
        onClick={onDelete}
        className="ml-3 hidden h-8 w-8 items-center justify-center rounded bg-neutral-800 text-neutral-400 hover:bg-red-600 hover:text-white group-hover:flex"
        aria-label="删除"
      >
        ×
      </button>
    </div>
  )
}

function Dropzone({
  uploading,
  onFiles,
  inputId,
}: {
  uploading: boolean
  onFiles: (files: FileList | null) => void
  inputId: string
}) {
  const [dragOver, setDragOver] = useState(false)
  return (
    <div
      className={`flex flex-col items-center justify-center rounded border-2 border-dashed p-6 transition ${
        dragOver
          ? 'border-blue-500 bg-blue-500/10'
          : 'border-neutral-700 hover:border-neutral-500'
      }`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        onFiles(e.dataTransfer.files)
      }}
    >
      <div className="mb-3 text-sm text-neutral-400">
        {uploading ? '上传中…' : '拖拽 ttf / otf / woff 到这里，或'}
      </div>
      {/* label htmlFor 原生关联 input，浏览器直接转发 click → file picker */}
      <Button asChild variant="secondary" disabled={uploading}>
        <label htmlFor={inputId} className="cursor-pointer">
          选择字体文件
        </label>
      </Button>
      <div className="mt-3 text-xs text-neutral-500">
        字体存在你浏览器本地，不会上传到服务器。同名字体重传会覆盖。
      </div>
    </div>
  )
}
