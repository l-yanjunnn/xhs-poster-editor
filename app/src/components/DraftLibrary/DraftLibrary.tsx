import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { EditorDocumentV2 } from '@/lib/documentStore'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  documents: EditorDocumentV2[]
  activeDocumentId: string | null
  activeDocumentTitle: string
  storageError: string | null
  onSaveAs: (title: string) => Promise<boolean>
  onOpenDocument: (document: EditorDocumentV2) => Promise<boolean>
  onDeleteDocument: (document: EditorDocumentV2) => Promise<boolean>
}

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export function DraftLibrary(p: Props) {
  const [newTitle, setNewTitle] = useState('')
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  function handleOpenChange(open: boolean) {
    if (!open) {
      setConfirmDeleteId(null)
      setBusyAction(null)
    }
    p.onOpenChange(open)
  }

  async function handleSaveAs() {
    const title = newTitle.trim()
    if (!title || busyAction) return
    setBusyAction('save-as')
    try {
      if (await p.onSaveAs(title)) setNewTitle('')
    } finally {
      setBusyAction(null)
    }
  }

  async function handleOpen(document: EditorDocumentV2) {
    if (busyAction || document.id === p.activeDocumentId) return
    setBusyAction(`open:${document.id}`)
    try {
      if (await p.onOpenDocument(document)) p.onOpenChange(false)
    } finally {
      setBusyAction(null)
    }
  }

  async function handleDelete(document: EditorDocumentV2) {
    if (busyAction) return
    if (confirmDeleteId !== document.id) {
      setConfirmDeleteId(document.id)
      return
    }

    setBusyAction(`delete:${document.id}`)
    try {
      if (await p.onDeleteDocument(document)) setConfirmDeleteId(null)
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <Dialog open={p.open} onOpenChange={handleOpenChange}>
      <DialogContent
        description="草稿管理"
        className="grid-cols-1 border border-neutral-700 bg-neutral-900 text-neutral-100 sm:max-w-2xl"
      >
        <DialogHeader>
          <DialogTitle>草稿</DialogTitle>
        </DialogHeader>

        <div className="rounded-lg border border-neutral-700 bg-neutral-800/70 p-4">
          <div className="text-xs text-neutral-400">当前编辑</div>
          <div className="mt-1 truncate text-base font-medium text-neutral-100">
            {p.activeDocumentTitle || '未命名草稿'}
          </div>
          <div className="mt-1 text-xs text-neutral-500">
            正文、样式、背景和 Logo 会在停止编辑后自动保存。
          </div>
        </div>

        {p.storageError && (
          <div
            role="alert"
            className="rounded-lg border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-200"
          >
            {p.storageError}
          </div>
        )}

        <div className="rounded-lg border border-neutral-700 p-4">
          <label htmlFor="draft-title" className="text-sm text-neutral-200">
            将当前内容另存为新草稿
          </label>
          <div className="mt-3 flex gap-2">
            <input
              id="draft-title"
              type="text"
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void handleSaveAs()
              }}
              placeholder="例如：行政执法卷第一题"
              className="min-w-0 flex-1 rounded border border-neutral-600 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-blue-500"
            />
            <button
              type="button"
              onClick={() => void handleSaveAs()}
              disabled={!newTitle.trim() || busyAction !== null}
              className="rounded border border-blue-600 bg-blue-700 px-4 py-2 text-sm text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busyAction === 'save-as' ? '保存中…' : '另存为'}
            </button>
          </div>
        </div>

        <section aria-labelledby="draft-list-heading">
          <div className="mb-2 flex items-center justify-between">
            <h3 id="draft-list-heading" className="text-sm text-neutral-200">
              已保存草稿
            </h3>
            <span className="text-xs text-neutral-500">
              {p.documents.length} 份
            </span>
          </div>

          {p.documents.length === 0 ? (
            <div className="rounded-lg border border-dashed border-neutral-700 py-8 text-center text-sm text-neutral-500">
              尚无已保存草稿，当前内容会自动创建第一份。
            </div>
          ) : (
            <div className="max-h-[340px] space-y-2 overflow-y-auto pr-1">
              {p.documents.map((document) => {
                const isActive = document.id === p.activeDocumentId
                const confirming = confirmDeleteId === document.id
                const busy = busyAction?.endsWith(document.id) ?? false
                return (
                  <article
                    key={document.id}
                    className={
                      'flex items-center gap-3 rounded-lg border px-3 py-3 ' +
                      (isActive
                        ? 'border-blue-600 bg-blue-950/30'
                        : 'border-neutral-700 bg-neutral-800/40')
                    }
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-neutral-100">
                          {document.title}
                        </span>
                        {isActive && (
                          <span className="shrink-0 rounded bg-blue-900 px-1.5 py-0.5 text-[10px] text-blue-200">
                            当前
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-neutral-500">
                        更新于 {dateFormatter.format(new Date(document.updatedAt))}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleOpen(document)}
                      disabled={isActive || busyAction !== null}
                      className="rounded border border-neutral-600 bg-neutral-800 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {busyAction === `open:${document.id}` ? '打开中…' : '打开'}
                    </button>

                    {confirming ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void handleDelete(document)}
                          disabled={busyAction !== null}
                          className="rounded bg-red-700 px-2 py-1.5 text-xs text-white hover:bg-red-600 disabled:opacity-40"
                        >
                          {busy ? '删除中…' : '确认'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          disabled={busyAction !== null}
                          className="rounded px-2 py-1.5 text-xs text-neutral-400 hover:bg-neutral-800"
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handleDelete(document)}
                        disabled={busyAction !== null}
                        className="rounded px-2 py-1.5 text-xs text-neutral-500 hover:bg-red-950/50 hover:text-red-300 disabled:opacity-40"
                      >
                        删除
                      </button>
                    )}
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </DialogContent>
    </Dialog>
  )
}
