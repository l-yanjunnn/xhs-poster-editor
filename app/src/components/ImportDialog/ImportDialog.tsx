import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardPaste,
  FileText,
  FileUp,
  Layers3,
  LoaderCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  ImportDocumentError,
  analyzeImportDocument,
  applySeparatorDecision,
  validateImportFilename,
  type ImportAnalysis,
  type SeparatorMode,
} from '@/lib/importDocument'
import { ORDINARY_POST_IMAGE_LIMIT } from '@/lib/productConfig'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onGenerate: (analysis: ImportAnalysis) => Promise<void>
}

type ImportStep = 'source' | 'review' | 'saving'
type InputMode = 'file' | 'paste'

const MAX_FILE_BYTES = 5 * 1024 * 1024
const FIXTURES = [
  {
    name: '申论还原型概括题.md',
    path: '/fixtures/申论还原型概括题.md',
    badge: `${ORDINARY_POST_IMAGE_LIMIT} 页`,
    description: '真实文稿，体验当前普通图文单篇上限',
  },
  {
    name: '超限19页导出演示.md',
    path: '/fixtures/超限19页导出演示.md',
    badge: `${ORDINARY_POST_IMAGE_LIMIT + 1}+ 页`,
    description: '体验超限仍完整生成一个可编辑草稿',
  },
] as const

export function ImportDialog({
  open,
  onOpenChange,
  onGenerate,
}: Props) {
  const [step, setStep] = useState<ImportStep>('source')
  const [inputMode, setInputMode] = useState<InputMode>('file')
  const [pasteValue, setPasteValue] = useState('')
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const readRequestRef = useRef(0)

  /* eslint-disable react-hooks/set-state-in-effect -- opening the controlled dialog starts a fresh import transaction. */
  useEffect(() => {
    // 关闭、重开或开始新读取都会使旧 File.text()/fetch 结果失效，
    // 防止慢请求在下一轮导入中把新内容换回旧文稿。
    readRequestRef.current += 1
    if (!open) return
    setStep('source')
    setInputMode('file')
    setPasteValue('')
    setAnalysis(null)
    setError(null)
    setReading(false)
    setDragging(false)
  }, [open])
  /* eslint-enable react-hooks/set-state-in-effect */

  function parseSource(source: string, sourceName: string) {
    try {
      const result = analyzeImportDocument(source, { sourceName })
      setAnalysis(result)
      setError(null)
      setStep('review')
    } catch (cause) {
      setError(importErrorMessage(cause))
      setStep('source')
    }
  }

  async function readFile(file: File) {
    const requestId = ++readRequestRef.current
    setReading(true)
    setError(null)
    try {
      validateImportFilename(file.name)
      if (file.size > MAX_FILE_BYTES) {
        throw new Error('文稿超过 5 MB，请先移除非文字内容后再导入。')
      }
      const source = await file.text()
      if (requestId !== readRequestRef.current) return
      parseSource(source, file.name)
    } catch (cause) {
      if (requestId === readRequestRef.current) {
        setError(importErrorMessage(cause))
      }
    } finally {
      if (requestId === readRequestRef.current) setReading(false)
    }
  }

  async function loadFixture(path: string, name: string) {
    const requestId = ++readRequestRef.current
    setReading(true)
    setError(null)
    try {
      const response = await fetch(path)
      if (!response.ok) throw new Error('示例文稿读取失败，请刷新后重试。')
      const source = await response.text()
      if (requestId !== readRequestRef.current) return
      parseSource(source, name)
    } catch (cause) {
      if (requestId === readRequestRef.current) {
        setError(importErrorMessage(cause))
      }
    } finally {
      if (requestId === readRequestRef.current) setReading(false)
    }
  }

  function chooseSeparatorMode(mode: SeparatorMode) {
    if (!analysis) return
    try {
      setAnalysis(applySeparatorDecision(analysis, mode))
      setError(null)
    } catch (cause) {
      setError(importErrorMessage(cause))
    }
  }

  async function generateDraft() {
    if (!analysis?.decisionResolved || step === 'saving') return
    setStep('saving')
    setError(null)
    try {
      await onGenerate(analysis)
      onOpenChange(false)
    } catch (cause) {
      setError(importErrorMessage(cause))
      setStep('review')
    }
  }

  const review = step !== 'source' && analysis !== null

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        // 新草稿完成原子落盘和 UI 切换前不允许把事务界面关掉。
        if (step !== 'saving') onOpenChange(nextOpen)
      }}
    >
      <DialogContent
        className={`grid max-h-[calc(100dvh-56px)] grid-cols-1 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden p-0 ${
          review ? 'sm:max-w-[1160px]' : 'sm:max-w-[780px]'
        }`}
        description="导入 Markdown 或纯文本，确认解析后生成可编辑的新草稿"
      >
        <DialogHeader className="border-b border-neutral-200 px-6 py-5 pr-14">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-blue-50 text-blue-700">
              <FileUp className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <DialogTitle className="text-lg font-semibold">
                {review ? '确认解析结果' : '导入文稿'}
              </DialogTitle>
              <p className="mt-1 text-xs leading-5 text-neutral-500">
                {review
                  ? '确认页数、封面和风险后，再生成到独立新草稿。'
                  : '选择文件或粘贴全文；解析不会改动当前草稿。'}
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto px-6 py-5" aria-busy={reading || step === 'saving'}>
          {review ? (
            <ReviewAnalysis
              analysis={analysis}
              onSeparatorMode={chooseSeparatorMode}
            />
          ) : (
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-neutral-100 p-1" role="tablist" aria-label="导入方式">
                <button
                  type="button"
                  role="tab"
                  aria-selected={inputMode === 'file'}
                  className={`flex h-10 items-center justify-center gap-2 rounded-lg text-xs font-semibold transition ${
                    inputMode === 'file'
                      ? 'bg-white text-neutral-900 shadow-sm'
                      : 'text-neutral-500 hover:text-neutral-800'
                  }`}
                  onClick={() => setInputMode('file')}
                >
                  <FileUp className="h-4 w-4" aria-hidden="true" />
                  选择 .md / .txt
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={inputMode === 'paste'}
                  className={`flex h-10 items-center justify-center gap-2 rounded-lg text-xs font-semibold transition ${
                    inputMode === 'paste'
                      ? 'bg-white text-neutral-900 shadow-sm'
                      : 'text-neutral-500 hover:text-neutral-800'
                  }`}
                  onClick={() => setInputMode('paste')}
                >
                  <ClipboardPaste className="h-4 w-4" aria-hidden="true" />
                  粘贴全文
                </button>
              </div>

              {inputMode === 'file' ? (
                <>
                  <button
                    type="button"
                    className={`flex min-h-52 flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 text-center transition ${
                      dragging
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-neutral-300 bg-neutral-50 hover:border-blue-400 hover:bg-blue-50/50'
                    }`}
                    onClick={() => fileInputRef.current?.click()}
                    onDragEnter={(event) => {
                      event.preventDefault()
                      setDragging(true)
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(event) => {
                      event.preventDefault()
                      setDragging(false)
                      const file = event.dataTransfer.files[0]
                      if (file) void readFile(file)
                    }}
                  >
                    {reading ? (
                      <LoaderCircle className="h-8 w-8 animate-spin text-blue-600" aria-hidden="true" />
                    ) : (
                      <FileText className="h-8 w-8 text-blue-600" aria-hidden="true" />
                    )}
                    <strong className="mt-3 text-sm">
                      {reading ? '正在读取文稿…' : '把文稿拖到这里，或点击选择'}
                    </strong>
                    <span className="mt-1 text-xs text-neutral-500">
                      UTF-8 Markdown / 纯文本，最大 5 MB
                    </span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".md,.txt,text/markdown,text/plain"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0]
                        if (file) void readFile(file)
                        event.currentTarget.value = ''
                      }}
                    />
                  </button>

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <strong className="text-xs text-neutral-700">示例文稿</strong>
                      <span className="text-[10px] text-neutral-400">
                        体验 {ORDINARY_POST_IMAGE_LIMIT} / {ORDINARY_POST_IMAGE_LIMIT + 1}+ 页完整流程
                      </span>
                    </div>
                    <div className="grid gap-2">
                      {FIXTURES.map((fixture) => (
                        <button
                          key={fixture.path}
                          type="button"
                          className="flex min-w-0 items-center gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-3 text-left hover:border-blue-300 hover:bg-blue-50/40"
                          onClick={() => void loadFixture(fixture.path, fixture.name)}
                          disabled={reading}
                        >
                          <span className="flex-none rounded-md bg-neutral-100 px-2 py-1 text-[10px] font-bold text-neutral-600">
                            {fixture.badge}
                          </span>
                          <span className="min-w-0 flex-1">
                            <strong className="block truncate text-xs text-neutral-800">{fixture.name}</strong>
                            <small className="mt-0.5 block truncate text-[10px] text-neutral-500">{fixture.description}</small>
                          </span>
                          <span className="text-xs font-semibold text-blue-700">载入</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <label className="flex flex-col gap-2 text-xs font-semibold text-neutral-700">
                  粘贴整篇文稿
                  <textarea
                    className="min-h-80 resize-y rounded-xl border border-neutral-300 bg-white p-4 font-mono text-xs font-normal leading-6 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
                    value={pasteValue}
                    onChange={(event) => setPasteValue(event.currentTarget.value)}
                    placeholder={'# 封面\n## 封面主标题\n\n## 封面副标题\n\n---\n\n下一页……\n\n# 正文\n这里是独立发布文案'}
                    autoFocus
                  />
                </label>
              )}
            </div>
          )}

          {error ? (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs leading-5 text-red-800" role="alert">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
              {error}
            </div>
          ) : null}
        </div>

        <DialogFooter className="mx-0 mb-0 rounded-none px-6 py-4">
          <div className="mr-auto flex items-center gap-2 text-[10px] text-neutral-500">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
            当前草稿会先保存并原样保留。
          </div>
          {review ? (
            <Button
              variant="outline"
              onClick={() => {
                setStep('source')
                setAnalysis(null)
                setError(null)
              }}
              disabled={step === 'saving'}
            >
              <ArrowLeft aria-hidden="true" />
              重新选择
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={step === 'saving'}>
            取消
          </Button>
          {review ? (
            <Button
              onClick={() => void generateDraft()}
              disabled={!analysis.decisionResolved || step === 'saving'}
            >
              {step === 'saving' ? (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              ) : (
                <Layers3 aria-hidden="true" />
              )}
              {step === 'saving' ? '正在生成新草稿…' : '生成到新草稿'}
            </Button>
          ) : inputMode === 'paste' ? (
            <Button
              onClick={() => parseSource(pasteValue, '粘贴的文稿')}
              disabled={!pasteValue.trim() || reading}
            >
              解析并预览
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ReviewAnalysis({
  analysis,
  onSeparatorMode,
}: {
  analysis: ImportAnalysis
  onSeparatorMode: (mode: SeparatorMode) => void
}) {
  const statusTone = {
    ok: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    limit: 'border-amber-200 bg-amber-50 text-amber-900',
    over: 'border-orange-200 bg-orange-50 text-orange-900',
  }[analysis.platformStatus.tone]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
        <FileText className="h-5 w-5 flex-none text-neutral-500" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <strong className="block truncate text-xs text-neutral-900">{analysis.sourceName}</strong>
          <span className="text-[10px] text-neutral-500">{analysis.structureLabel}</span>
        </div>
        <span className={`rounded-full border px-3 py-1 text-[10px] font-semibold ${statusTone}`}>
          {analysis.platformStatus.label}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.25fr_0.85fr]">
        <section className="rounded-2xl border border-neutral-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-900">结构识别</h2>
            <span className="text-[10px] text-neutral-400">原文不改写</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {[
              [analysis.pageCount, '张图片'],
              [analysis.separatorCount, '处分隔'],
              [analysis.innerPageCount, '张内页'],
              [analysis.hashtagCount, '个话题'],
            ].map(([value, label]) => (
              <div key={label} className="rounded-xl bg-neutral-50 px-3 py-3">
                <strong className="block text-xl tabular-nums text-neutral-900">{value}</strong>
                <span className="text-[10px] text-neutral-500">{label}</span>
              </div>
            ))}
          </div>
          <dl className="mt-4 grid gap-3 text-xs">
            <div>
              <dt className="text-[10px] text-neutral-400">封面主标题</dt>
              <dd className="mt-1 font-semibold text-neutral-800">{analysis.cover.title || '未识别'}</dd>
            </div>
            <div>
              <dt className="text-[10px] text-neutral-400">封面副标题</dt>
              <dd className="mt-1 text-neutral-700">{analysis.cover.subtitle || '未识别'}</dd>
            </div>
          </dl>
          {analysis.needsSeparatorDecision ? (
            <fieldset className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <legend className="px-1 text-xs font-semibold text-amber-950">请一次性确认 ---</legend>
              <p className="mb-3 mt-1 text-[10px] leading-4 text-amber-800">将对全文 {analysis.separatorCount} 处分隔统一生效。</p>
              <label className="flex cursor-pointer items-start gap-2 text-xs text-amber-950">
                <input
                  type="radio"
                  name="import-separator-mode"
                  checked={analysis.separatorMode === 'pages'}
                  onChange={() => onSeparatorMode('pages')}
                />
                <span><strong>作为分页</strong><small className="block text-[10px] font-normal">推荐用于长图文稿</small></span>
              </label>
              <label className="mt-2 flex cursor-pointer items-start gap-2 text-xs text-amber-950">
                <input
                  type="radio"
                  name="import-separator-mode"
                  checked={analysis.separatorMode === 'divider'}
                  onChange={() => onSeparatorMode('divider')}
                />
                <span><strong>保留为普通分隔线</strong><small className="block text-[10px] font-normal">全文仍在同一页</small></span>
              </label>
            </fieldset>
          ) : null}
        </section>

        <section className="rounded-2xl border border-neutral-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-900">将生成的页面</h2>
            <span className="text-[10px] text-neutral-400">全部位于同一新草稿</span>
          </div>
          <div className="mt-3 grid max-h-[420px] grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4 xl:grid-cols-5">
            {analysis.pages.map((page) => (
              <div
                key={page.number}
                className={`relative aspect-[3/5] overflow-hidden rounded-lg border p-2 ${
                  page.mayOverflow
                    ? 'border-amber-300 bg-amber-50'
                    : 'border-neutral-200 bg-gradient-to-b from-stone-50 to-stone-100'
                }`}
                title={`第 ${page.number} 页：${page.outlineLabel}`}
              >
                <span className="absolute left-2 top-2 rounded bg-white/90 px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-neutral-700 shadow-sm">
                  {String(page.number).padStart(2, '0')}
                </span>
                <div className="mt-6 line-clamp-3 text-[9px] font-semibold leading-3 text-neutral-700">
                  {page.outlineLabel}
                </div>
                <div className="mt-2 space-y-1 opacity-50" aria-hidden="true">
                  <span className="block h-1 rounded bg-neutral-400" />
                  <span className="block h-1 w-4/5 rounded bg-neutral-300" />
                  <span className="block h-1 rounded bg-neutral-300" />
                </div>
                <span className="absolute bottom-2 left-2 text-[8px] text-neutral-400">
                  {page.role === 'cover' ? '封面' : '内页'}
                </span>
              </div>
            ))}
          </div>
          {analysis.overflowPages.length > 0 ? (
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[10px] leading-4 text-amber-800">
              <AlertTriangle className="h-3.5 w-3.5 flex-none" aria-hidden="true" />
              第 {analysis.overflowPages.join('、')} 页文字较多；生成后请在 1080×1800 画布中手动调整。
            </p>
          ) : null}
        </section>

        <section className="rounded-2xl border border-neutral-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-900">发布文案</h2>
            <span className="text-[10px] text-neutral-400">右栏独立保存</span>
          </div>
          <div className="mt-3 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-xl bg-neutral-50 p-3 text-[10px] leading-5 text-neutral-700">
            {analysis.releaseCopy || '未检测到独立发布文案。'}
          </div>
          <div className="mt-4 space-y-2 text-[10px] leading-4 text-neutral-500">
            <p className="flex gap-2"><CheckCircle2 className="h-3.5 w-3.5 flex-none text-emerald-600" aria-hidden="true" />不混入图片正文</p>
            <p className="flex gap-2"><CheckCircle2 className="h-3.5 w-3.5 flex-none text-emerald-600" aria-hidden="true" />不自动复制成多份</p>
            <p className="flex gap-2"><CheckCircle2 className="h-3.5 w-3.5 flex-none text-emerald-600" aria-hidden="true" />不添加“上/下篇”文字</p>
          </div>
        </section>
      </div>

      <div className={`rounded-xl border px-4 py-3 text-xs ${statusTone}`}>
        <strong>{analysis.platformStatus.label}</strong>
        <p className="mt-1 text-[10px] leading-4 opacity-80">
          {ORDINARY_POST_IMAGE_LIMIT} 只是普通图文单篇上传兼容线；不限制本编辑器的完整生成、手动调整或一次导出。
        </p>
      </div>
    </div>
  )
}

function importErrorMessage(cause: unknown): string {
  if (cause instanceof ImportDocumentError || cause instanceof Error) {
    return cause.message
  }
  return '文稿读取失败，请换一个文件后重试。'
}
