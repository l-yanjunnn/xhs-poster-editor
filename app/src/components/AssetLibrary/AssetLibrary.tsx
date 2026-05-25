import { useEffect, useId, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import {
  BUILTIN_BACKGROUNDS,
  BUILTIN_IMAGES,
  BUILTIN_LOGOS,
  type Asset,
} from '@/lib/builtinAssets'
import {
  addUserAsset,
  deleteUserAsset,
  listUserAssets,
  type AssetKind,
} from '@/lib/assetStore'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  // 当前选中的背景/Logo src，用来高亮卡片
  currentBgSrc: string
  currentLogoSrc: string
  // 传完整 Asset 而不是单纯 src，让上层能同时保存 assetId（用于主题序列化）
  onPickBackground: (asset: Asset) => void
  onPickLogo: (asset: Asset) => void
  // 插入到编辑器（image kind），可选
  onPickImage?: (asset: Asset) => void
  // 打开时初始 tab，编辑器「插入图片」按钮直接落到 image 用
  initialKind?: KindTab
}

type SourceTab = 'builtin' | 'user'
type KindTab = 'background' | 'logo' | 'image'

export function AssetLibrary(p: Props) {
  const [kind, setKind] = useState<KindTab>(p.initialKind ?? 'background')
  const [source, setSource] = useState<SourceTab>('builtin')

  // 用 initialKind 切换打开的 tab（每次开启素材库都生效）
  useEffect(() => {
    if (p.open && p.initialKind) setKind(p.initialKind)
  }, [p.open, p.initialKind])

  // image kind 内置为空，自动跳到「我的上传」省一次点击
  useEffect(() => {
    if (kind === 'image') setSource('user')
  }, [kind])
  const [userAssets, setUserAssets] = useState<Asset[]>([])
  const [uploading, setUploading] = useState(false)
  // Why: 用 label htmlFor 关联 input 触发 file picker，比 ref.click() 稳。
  // Radix Dialog 的 Portal + focus trap 在某些场景会让 hidden input.click() 静默失败
  const fileInputId = useId()

  // 切到「我的」或换素材类型时拉一次列表
  useEffect(() => {
    if (!p.open || source !== 'user') return
    listUserAssets(kind).then(setUserAssets)
  }, [p.open, source, kind])

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue
        await addUserAsset(kind, file)
      }
      setUserAssets(await listUserAssets(kind))
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(id: string) {
    await deleteUserAsset(id)
    setUserAssets(await listUserAssets(kind as AssetKind))
  }

  function handlePick(asset: Asset) {
    if (kind === 'background') p.onPickBackground(asset)
    else if (kind === 'logo') p.onPickLogo(asset)
    else if (kind === 'image') p.onPickImage?.(asset)
    p.onOpenChange(false)
  }

  const builtinList =
    kind === 'background'
      ? BUILTIN_BACKGROUNDS
      : kind === 'logo'
        ? BUILTIN_LOGOS
        : BUILTIN_IMAGES
  // image 是插入到正文，不存在「当前选中」概念，不高亮
  const currentSrc =
    kind === 'background'
      ? p.currentBgSrc
      : kind === 'logo'
        ? p.currentLogoSrc
        : ''

  return (
    <Dialog open={p.open} onOpenChange={p.onOpenChange}>
      <DialogContent className="grid-cols-1 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>素材库</DialogTitle>
        </DialogHeader>

        {/* 一级 Tab：素材类型 */}
        <Tabs
          value={kind}
          onValueChange={(v) => setKind(v as KindTab)}
          className="w-full flex-col"
        >
          <TabsList className="w-full">
            <TabsTrigger value="background">背景</TabsTrigger>
            <TabsTrigger value="logo">Logo</TabsTrigger>
            <TabsTrigger value="image">图片</TabsTrigger>
          </TabsList>

          {/* 三种 kind 共用同一份 UI */}
          {(['background', 'logo', 'image'] as const).map((k) => (
            <TabsContent key={k} value={k} className="mt-4">
              {/* 二级 Tab：内置 / 我的 */}
              <Tabs
                value={source}
                onValueChange={(v) => setSource(v as SourceTab)}
                className="w-full flex-col"
              >
                <TabsList>
                  <TabsTrigger value="builtin">内置</TabsTrigger>
                  <TabsTrigger value="user">我的上传</TabsTrigger>
                </TabsList>

                <TabsContent value="builtin" className="mt-4">
                  <AssetGrid
                    assets={builtinList}
                    currentSrc={currentSrc}
                    onPick={handlePick}
                  />
                </TabsContent>

                <TabsContent value="user" className="mt-4">
                  <UploadDropzone
                    uploading={uploading}
                    onFiles={handleFiles}
                    inputId={fileInputId}
                  />
                  <input
                    id={fileInputId}
                    type="file"
                    accept="image/*"
                    multiple
                    className="sr-only"
                    onChange={(e) => {
                      handleFiles(e.target.files)
                      e.target.value = ''
                    }}
                  />
                  <div className="mt-4">
                    {userAssets.length === 0 ? (
                      <div className="py-8 text-center text-sm text-neutral-500">
                        还没有上传任何
                        {k === 'background' ? '背景' : k === 'logo' ? 'Logo' : '图片'}
                      </div>
                    ) : (
                      <AssetGrid
                        assets={userAssets}
                        currentSrc={currentSrc}
                        onPick={handlePick}
                        onDelete={handleDelete}
                      />
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function AssetGrid({
  assets,
  currentSrc,
  onPick,
  onDelete,
}: {
  assets: Asset[]
  currentSrc: string
  onPick: (a: Asset) => void
  onDelete?: (id: string) => void
}) {
  return (
    <div className="grid max-h-[420px] grid-cols-4 gap-3 overflow-y-auto p-1">
      {assets.map((a) => {
        const isCurrent = a.src === currentSrc
        return (
          <div
            key={a.id}
            className={`group relative cursor-pointer overflow-hidden rounded border-2 transition ${
              isCurrent
                ? 'border-blue-500'
                : 'border-neutral-700 hover:border-neutral-500'
            }`}
            onClick={() => onPick(a)}
          >
            <div className="aspect-square bg-neutral-900">
              <img
                src={a.src}
                alt={a.name}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="truncate bg-neutral-800 px-2 py-1 text-xs text-neutral-300">
              {a.name}
            </div>
            {onDelete && (
              <button
                className="absolute right-1 top-1 hidden h-6 w-6 items-center justify-center rounded bg-black/70 text-xs text-white hover:bg-red-600 group-hover:flex"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(a.id)
                }}
                aria-label="删除"
              >
                ×
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

function UploadDropzone({
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
        {uploading ? '上传中…' : '拖拽图片到这里，或'}
      </div>
      {/* label htmlFor 原生关联 input，浏览器直接转发 click → file picker */}
      <Button asChild variant="secondary" disabled={uploading}>
        <label htmlFor={inputId} className="cursor-pointer">
          选择文件
        </label>
      </Button>
      <div className="mt-3 text-xs text-neutral-500">
        支持 PNG / JPG，存在你浏览器本地，不会上传到服务器
      </div>
    </div>
  )
}
