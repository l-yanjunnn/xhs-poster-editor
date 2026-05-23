import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { BUILTIN_THEMES, type Theme } from '@/lib/themes'
import { deleteUserTheme } from '@/lib/themeStore'
import { ThemePreview } from '@/components/ThemePreview/ThemePreview'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  // 用户主题由 App 持有（同时供 Toolbar 下拉用），这里只读
  userThemes: Theme[]
  // 当前已应用主题 id；null = 用户编辑过、已脱离任何主题
  currentThemeId: string | null
  onApply: (theme: Theme) => void
  // 把当前 App state 打包成主题保存
  onSaveCurrent: (name: string, includeContent: boolean) => Promise<void>
  // 增删后让 App 重新拉用户主题列表
  onReload: () => Promise<void>
}

type Source = 'builtin' | 'user'

export function ThemeLibrary(p: Props) {
  const [source, setSource] = useState<Source>('builtin')
  const [newName, setNewName] = useState('')
  const [includeContent, setIncludeContent] = useState(false)
  const [saving, setSaving] = useState(false)

  function handleApply(theme: Theme) {
    p.onApply(theme)
    p.onOpenChange(false)
  }

  async function handleDelete(id: string) {
    await deleteUserTheme(id)
    await p.onReload()
  }

  async function handleSave() {
    const name = newName.trim()
    if (!name) return
    setSaving(true)
    try {
      await p.onSaveCurrent(name, includeContent)
      await p.onReload()
      setNewName('')
      setIncludeContent(false)
      setSource('user') // 切到「我的」让用户立即看到新主题
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={p.open} onOpenChange={p.onOpenChange}>
      <DialogContent description="主题库" className="grid-cols-1 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>主题</DialogTitle>
        </DialogHeader>

        <Tabs
          value={source}
          onValueChange={(v) => setSource(v as Source)}
          className="w-full flex-col"
        >
          <TabsList>
            <TabsTrigger value="builtin">内置</TabsTrigger>
            <TabsTrigger value="user">我的</TabsTrigger>
          </TabsList>

          <TabsContent value="builtin" className="mt-4">
            <ThemeGrid
              themes={BUILTIN_THEMES}
              currentThemeId={p.currentThemeId}
              onApply={handleApply}
            />
          </TabsContent>

          <TabsContent value="user" className="mt-4">
            <SaveForm
              newName={newName}
              includeContent={includeContent}
              saving={saving}
              onNewName={setNewName}
              onIncludeContent={setIncludeContent}
              onSave={handleSave}
            />
            <div className="mt-4">
              {p.userThemes.length === 0 ? (
                <div className="py-8 text-center text-sm text-neutral-500">
                  还没有保存任何主题，先在上方填名字保存一个吧
                </div>
              ) : (
                <ThemeGrid
                  themes={p.userThemes}
                  currentThemeId={p.currentThemeId}
                  onApply={handleApply}
                  onDelete={handleDelete}
                />
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function ThemeGrid({
  themes,
  currentThemeId,
  onApply,
  onDelete,
}: {
  themes: Theme[]
  currentThemeId: string | null
  onApply: (theme: Theme) => void
  onDelete?: (id: string) => void
}) {
  return (
    <div className="grid max-h-[480px] grid-cols-4 gap-3 overflow-y-auto p-1">
      {themes.map((t) => {
        const isCurrent = t.id === currentThemeId
        return (
          <div
            key={t.id}
            className={`group relative overflow-hidden rounded border-2 transition ${
              isCurrent
                ? 'border-blue-500'
                : 'border-neutral-700 hover:border-neutral-500'
            }`}
          >
            {/* 9:16 真实主题缩略图 */}
            <div className="flex items-center justify-center bg-neutral-950 p-2">
              <ThemePreview theme={t} scale={0.14} />
            </div>
            <div className="bg-neutral-900 px-2 py-2">
              <div className="flex items-center justify-between gap-1">
                <div className="truncate text-xs text-neutral-200">{t.name}</div>
                {t.contentJSON && (
                  <span
                    className="rounded bg-neutral-700 px-1.5 py-0.5 text-[10px] text-neutral-300"
                    title="主题含正文，应用时会替换编辑器内容"
                  >
                    含正文
                  </span>
                )}
              </div>
              <button
                className="mt-1.5 w-full rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-500"
                onClick={() => onApply(t)}
              >
                {isCurrent ? '已应用' : '应用'}
              </button>
            </div>
            {onDelete && (
              <button
                className="absolute right-1 top-1 hidden h-6 w-6 items-center justify-center rounded bg-black/70 text-xs text-white hover:bg-red-600 group-hover:flex"
                onClick={() => onDelete(t.id)}
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

function SaveForm({
  newName,
  includeContent,
  saving,
  onNewName,
  onIncludeContent,
  onSave,
}: {
  newName: string
  includeContent: boolean
  saving: boolean
  onNewName: (v: string) => void
  onIncludeContent: (v: boolean) => void
  onSave: () => void
}) {
  return (
    <div className="rounded border border-neutral-700 bg-neutral-800 p-4">
      <div className="text-sm text-neutral-200">保存当前样式为新主题</div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={newName}
          onChange={(e) => onNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newName.trim()) onSave()
          }}
          placeholder="主题名称"
          className="flex-1 min-w-[180px] rounded border border-neutral-600 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-100 outline-none focus:border-blue-500"
        />
        <label className="flex cursor-pointer items-center gap-1.5 text-sm text-neutral-300">
          <input
            type="checkbox"
            checked={includeContent}
            onChange={(e) => onIncludeContent(e.target.checked)}
          />
          包含正文
        </label>
        <Button onClick={onSave} disabled={!newName.trim() || saving}>
          {saving ? '保存中…' : '保存'}
        </Button>
      </div>
      <div className="mt-2 text-[11px] text-neutral-500">
        包含正文：连同当前编辑器内容一起保存，下次应用时会替换正文
      </div>
    </div>
  )
}
