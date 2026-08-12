import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  FileArchive,
  FolderOpen,
  Grid2X2Check,
  LoaderCircle,
  RotateCcw,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  ExportReadinessError,
  type ExportResourceIssue,
} from '@/lib/exportReadiness'
import {
  EXPORT_DELIVERY_MODE,
  ORDINARY_POST_IMAGE_LIMIT,
  cleanDocumentName,
  createZipArtifactName,
  formatPageNumber,
  formatPageSelection,
  getOrdinaryPostStatus,
  parsePageSelection,
  recommendDeliveryMode,
  requiresAllPagesConfirmation,
  togglePageSelection,
  type ExportDeliveryMode,
} from '@/lib/exportPlan'
import {
  DirectoryExportInterruptedError,
  getExportDestinationCapabilities,
  type DirectoryExportResumeToken,
  type ExportDirectoryHandle,
  type ExportFileHandle,
  type ExportPickerWindow,
} from '@/lib/exportDelivery'

export interface ExportRequest {
  filename: string
  selectedPages: number[]
  deliveryMode: ExportDeliveryMode
  collisionIndex: number
  zipFileName: string
  directoryParent?: ExportDirectoryHandle
  saveFileHandle?: ExportFileHandle
  resumeToken?: DirectoryExportResumeToken
}

interface Props {
  open: boolean
  onOpenChange: (value: boolean) => void
  defaultFilename: string
  pageCount: number
  onExport: (
    request: ExportRequest,
    onProgress: (current: number, total: number) => void,
    options?: { skipReadiness?: boolean },
  ) => Promise<void>
}

type PageMode = 'all' | 'selection'

export function ExportDialog({
  open,
  onOpenChange,
  defaultFilename,
  pageCount,
  onExport,
}: Props) {
  const capabilities = useMemo(() => getExportDestinationCapabilities(), [])
  const [filename, setFilename] = useState(defaultFilename)
  const [pageMode, setPageMode] = useState<PageMode>('all')
  const [selectionInput, setSelectionInput] = useState(`1-${pageCount}`)
  const [selectedPages, setSelectedPages] = useState<number[]>([])
  const [selectionError, setSelectionError] = useState<string | null>(null)
  const [deliveryMode, setDeliveryMode] = useState<ExportDeliveryMode>(
    recommendDeliveryMode(capabilities.directory),
  )
  const [zipFileName, setZipFileName] = useState(`${defaultFilename}.zip`)
  const [confirmAll, setConfirmAll] = useState(false)
  const [confirmedAll, setConfirmedAll] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [readinessIssues, setReadinessIssues] = useState<
    ExportResourceIssue[]
  >([])
  const [exportError, setExportError] = useState<string | null>(null)
  const [resumeToken, setResumeToken] =
    useState<DirectoryExportResumeToken | null>(null)
  const directoryParentRef = useRef<ExportDirectoryHandle | null>(null)
  const saveFileHandleRef = useRef<ExportFileHandle | null>(null)
  const collisionByTopicRef = useRef<Map<string, number>>(new Map())

  /* eslint-disable react-hooks/set-state-in-effect -- controlled open defines a new export transaction and resets all prepared handles. */
  useEffect(() => {
    if (!open) return
    const allPages = Array.from({ length: pageCount }, (_, index) => index + 1)
    setFilename(defaultFilename)
    setPageMode('all')
    setSelectionInput(pageCount > 0 ? `1-${pageCount}` : '')
    setSelectedPages(allPages)
    setSelectionError(null)
    setDeliveryMode(recommendDeliveryMode(capabilities.directory))
    setZipFileName(`${defaultFilename}.zip`)
    setConfirmAll(false)
    setConfirmedAll(false)
    setExporting(false)
    setProgress({ current: 0, total: 0 })
    setReadinessIssues([])
    setExportError(null)
    setResumeToken(null)
    directoryParentRef.current = null
    saveFileHandleRef.current = null
  }, [capabilities.directory, defaultFilename, open, pageCount])
  /* eslint-enable react-hooks/set-state-in-effect */

  const pages = pageMode === 'all'
    ? Array.from({ length: pageCount }, (_, index) => index + 1)
    : selectedPages
  const pageStatus = pages.length > 0
    ? getOrdinaryPostStatus(pages.length)
    : null
  const trimmedFilename = filename.trim()
  const canExport =
    trimmedFilename.length > 0 &&
    pages.length > 0 &&
    pageCount > 0 &&
    !exporting
  const hasBlockingReadinessIssue = readinessIssues.some(
    (issue) => issue.kind === 'font' || issue.kind === 'layout',
  )
  const topic = cleanDocumentName(trimmedFilename || defaultFilename)
  const exampleFirstPage = pages[0] ?? 1
  const exampleLastPage = pages.at(-1) ?? Math.max(1, pageCount)
  const exampleStart = `${formatPageNumber(exampleFirstPage, Math.max(1, pageCount))}_${topic}_${exampleFirstPage === 1 ? 'cover' : 'inner'}.png`
  const exampleEnd = `${formatPageNumber(exampleLastPage, Math.max(1, pageCount))}_${topic}_${exampleLastPage === 1 ? 'cover' : 'inner'}.png`

  function invalidatePreparedDestination() {
    directoryParentRef.current = null
    saveFileHandleRef.current = null
    setResumeToken(null)
    setReadinessIssues([])
    setExportError(null)
    setConfirmAll(false)
    setConfirmedAll(false)
  }

  function updateSelectionInput(value: string) {
    setSelectionInput(value)
    try {
      const result = parsePageSelection(value, pageCount)
      setSelectedPages(result.pages)
      setSelectionError(null)
    } catch (cause) {
      setSelectedPages([])
      setSelectionError(
        cause instanceof Error ? cause.message : '请输入有效页码。',
      )
    }
    invalidatePreparedDestination()
  }

  function togglePage(pageNumber: number) {
    try {
      const next = togglePageSelection(selectedPages, pageNumber, pageCount)
      setSelectedPages(next)
      setSelectionInput(formatPageSelection(next, pageCount))
      setSelectionError(next.length === 0 ? '至少选择一页导出。' : null)
    } catch (cause) {
      setSelectionError(
        cause instanceof Error ? cause.message : '无法更新页码选择。',
      )
    }
    invalidatePreparedDestination()
  }

  async function prepareDestination(): Promise<{
    directoryParent?: ExportDirectoryHandle
    saveFileHandle?: ExportFileHandle
  } | null> {
    const pickerWindow = window as unknown as ExportPickerWindow
    try {
      if (deliveryMode === EXPORT_DELIVERY_MODE.DIRECTORY) {
        if (!directoryParentRef.current) {
          const picker = pickerWindow.showDirectoryPicker
          if (!picker) throw new Error('当前浏览器不支持目录写入，请改用兼容 ZIP。')
          // 必须在点击的同步用户手势链中第一时间调用 picker。
          directoryParentRef.current = await picker.call(pickerWindow, {
            id: 'xhs-poster-export-directory',
            mode: 'readwrite',
          })
        }
        return { directoryParent: directoryParentRef.current }
      }

      if (capabilities.nativeSaveFile && !saveFileHandleRef.current) {
        const picker = pickerWindow.showSaveFilePicker
        if (picker) {
          saveFileHandleRef.current = await picker.call(pickerWindow, {
            id: 'xhs-poster-export-zip',
            suggestedName: appendZipCollisionSuffix(
              normalizeZipName(zipFileName || `${topic}.zip`),
              collisionByTopicRef.current.get(topic) ?? 1,
            ),
            types: [
              {
                description: 'ZIP 压缩包',
                accept: { 'application/zip': ['.zip'] },
              },
            ],
          })
        }
      }
      return { saveFileHandle: saveFileHandleRef.current ?? undefined }
    } catch (cause) {
      if (isAbortError(cause)) return null
      throw cause
    }
  }

  async function handleExport(
    skipReadiness = false,
    resume: DirectoryExportResumeToken | null = null,
    bypassAllConfirmation = false,
  ) {
    if (!canExport && !resume) return
    if (skipReadiness && !resume && hasBlockingReadinessIssue) {
      setExportError('字体或确定性排版未通过预检，修复后才能导出 PNG。')
      return
    }
    if (
      !resume &&
      pages.length === pageCount &&
      requiresAllPagesConfirmation(pageCount) &&
      !confirmedAll &&
      !bypassAllConfirmation
    ) {
      setConfirmAll(true)
      return
    }

    let destination: Awaited<ReturnType<typeof prepareDestination>> = {}
    if (!resume) {
      try {
        destination = await prepareDestination()
        if (!destination) return
      } catch (cause) {
        setExportError(cause instanceof Error ? cause.message : '无法打开导出位置。')
        return
      }
    }

    setExporting(true)
    setProgress({ current: resume?.completedPages.length ?? 0, total: 0 })
    setExportError(null)
    if (!skipReadiness) setReadinessIssues([])
    try {
      const collisionIndex = collisionByTopicRef.current.get(topic) ?? 1
      await onExport(
        {
          filename: trimmedFilename,
          selectedPages: resume?.plan.pages ?? pages,
          deliveryMode: resume
            ? EXPORT_DELIVERY_MODE.DIRECTORY
            : deliveryMode,
          collisionIndex,
          zipFileName: normalizeZipName(zipFileName || `${topic}.zip`),
          directoryParent: destination?.directoryParent,
          saveFileHandle: destination?.saveFileHandle,
          resumeToken: resume ?? undefined,
        },
        (current, total) => setProgress({ current, total }),
        { skipReadiness },
      )
      collisionByTopicRef.current.set(topic, collisionIndex + 1)
      directoryParentRef.current = null
      saveFileHandleRef.current = null
      setResumeToken(null)
      onOpenChange(false)
    } catch (cause) {
      if (cause instanceof ExportReadinessError) {
        setReadinessIssues(cause.issues)
      } else if (cause instanceof DirectoryExportInterruptedError) {
        setResumeToken(cause.resumeToken)
        const remaining = cause.resumeToken.plan.pages.length -
          cause.resumeToken.completedPages.length
        setExportError(
          remaining > 0 ? `${cause.message}剩余 ${remaining} 张。` : cause.message,
        )
      } else {
        console.error('导出失败', cause)
        setExportError(
          cause instanceof Error ? cause.message : '未知错误，请重试',
        )
      }
    } finally {
      setExporting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        // 长文档逐页写入期间保持进度与续写 token 可见，避免 Esc / 右上角关闭
        // 让用户误以为任务已取消，实际却仍在后台占用导出句柄。
        if (!exporting) onOpenChange(nextOpen)
      }}
    >
      <DialogContent
        className="grid max-h-[calc(100vh-56px)] grid-cols-1 overflow-hidden p-0 sm:max-w-[1080px]"
        description="选择全部或自选页码，导出到独立文件夹或单个兼容 ZIP"
      >
        <DialogHeader className="border-b border-neutral-200 px-6 py-5 pr-14">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-lg font-semibold">导出 PNG</DialogTitle>
              <p className="mt-1 text-xs leading-5 text-neutral-500">
                {pageCount > ORDINARY_POST_IMAGE_LIMIT
                  ? `${ORDINARY_POST_IMAGE_LIMIT} 张只是普通图文单篇上传兼容线，不是编辑器导出上限。`
                  : '可一次完整导出，也可按原稿页码选择。'}
              </p>
            </div>
            {pageStatus ? (
              <span className={`mr-4 rounded-full border px-3 py-1 text-[10px] font-semibold ${
                pageStatus.kind === 'over-limit'
                  ? 'border-orange-200 bg-orange-50 text-orange-800'
                  : pageStatus.kind === 'at-limit'
                    ? 'border-amber-200 bg-amber-50 text-amber-900'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-800'
              }`}>
                {pageStatus.label}
              </span>
            ) : null}
          </div>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto px-6 py-5">
          {confirmAll ? (
            <AllPagesConfirmation
              pageCount={pageCount}
              onBack={() => setConfirmAll(false)}
              onConfirm={() => {
                setConfirmedAll(true)
                setConfirmAll(false)
                void handleExport(false, null, true)
              }}
            />
          ) : (
            <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="flex min-w-0 flex-col gap-4">
                <div className="grid grid-cols-2 gap-2 rounded-xl bg-neutral-100 p-1" role="tablist" aria-label="导出页码方式">
                  <ModeButton
                    active={pageMode === 'all'}
                    title={`导出全部 ${pageCount} 张`}
                    description="一次操作，一个独立文件夹"
                    onClick={() => {
                      setPageMode('all')
                      invalidatePreparedDestination()
                    }}
                  />
                  <ModeButton
                    active={pageMode === 'selection'}
                    title="选择页码导出"
                    description="范围输入 + 缩略图多选"
                    onClick={() => {
                      setPageMode('selection')
                      invalidatePreparedDestination()
                    }}
                  />
                </div>

                {pageMode === 'selection' ? (
                  <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="min-w-52 flex-1 text-[10px] font-semibold text-neutral-600">
                        页码范围
                        <input
                          className="mt-1.5 h-10 w-full rounded-lg border border-neutral-300 px-3 font-mono text-xs outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
                          value={selectionInput}
                          onChange={(event) => updateSelectionInput(event.currentTarget.value)}
                          placeholder={`例如 1-6, 9, 12-${pageCount}`}
                        />
                      </label>
                      <Button
                        variant="outline"
                        onClick={() => updateSelectionInput(`1-${pageCount}`)}
                      >
                        全选
                      </Button>
                      <Button variant="outline" onClick={() => updateSelectionInput('')}>
                        清空
                      </Button>
                    </div>
                    {selectionError ? (
                      <p className="mt-2 text-[10px] text-red-700" role="alert">{selectionError}</p>
                    ) : (
                      <p className="mt-2 text-[10px] text-neutral-500">已选 {selectedPages.length} 张，文件名仍保留原稿页码。</p>
                    )}
                  </div>
                ) : null}

                <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <strong className="text-xs text-neutral-800">
                      {pageMode === 'all' ? '全部页面' : '点击缩略图多选'}
                    </strong>
                    <span className="text-[10px] text-neutral-500">共 {pages.length} 张</span>
                  </div>
                  <div className="grid max-h-[360px] grid-cols-6 gap-2 overflow-y-auto pr-1 sm:grid-cols-8 lg:grid-cols-9">
                    {Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => {
                      const selected = pages.includes(pageNumber)
                      const content = (
                        <>
                          <span className="absolute left-1.5 top-1.5 rounded bg-white/90 px-1 py-0.5 text-[8px] font-bold tabular-nums text-neutral-700">
                            {formatPageNumber(pageNumber, pageCount)}
                          </span>
                          <span className="absolute bottom-1.5 left-1.5 text-[7px] text-neutral-400">
                            {pageNumber === 1 ? 'cover' : 'inner'}
                          </span>
                          <span className="mx-2 mt-5 block h-1 rounded bg-neutral-300" />
                          <span className="mx-2 mt-1 block h-1 w-2/3 rounded bg-neutral-200" />
                        </>
                      )
                      const className = `relative aspect-[3/5] overflow-hidden rounded-lg border text-left transition ${
                        selected
                          ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100'
                          : 'border-neutral-200 bg-white opacity-55'
                      }`
                      return pageMode === 'selection' ? (
                        <button
                          key={pageNumber}
                          type="button"
                          className={className}
                          aria-pressed={selected}
                          aria-label={`${selected ? '取消选择' : '选择'}第 ${pageNumber} 页`}
                          onClick={() => togglePage(pageNumber)}
                        >
                          {content}
                        </button>
                      ) : (
                        <div key={pageNumber} className={className}>{content}</div>
                      )
                    })}
                  </div>
                </div>
              </div>

              <div className="flex min-w-0 flex-col gap-4">
                <section className="rounded-2xl border border-neutral-200 bg-white p-4">
                  <h2 className="text-sm font-semibold text-neutral-900">导出位置</h2>
                  <div className="mt-3 grid gap-2">
                    {capabilities.directory ? (
                      <DeliveryButton
                        active={deliveryMode === EXPORT_DELIVERY_MODE.DIRECTORY}
                        icon={<FolderOpen />}
                        title="独立文件夹（推荐）"
                        description="选择父目录后直接写入，超多页时占用内存更稳定"
                        onClick={() => {
                          setDeliveryMode(EXPORT_DELIVERY_MODE.DIRECTORY)
                          invalidatePreparedDestination()
                        }}
                      />
                    ) : null}
                    <DeliveryButton
                      active={deliveryMode === EXPORT_DELIVERY_MODE.COMPATIBILITY_ZIP}
                      icon={<FileArchive />}
                      title={capabilities.directory ? '兼容 ZIP' : '单个兼容 ZIP（当前浏览器回退）'}
                      description={`一个 ZIP 内只有一个顶层文件夹，不按 ${ORDINARY_POST_IMAGE_LIMIT} 张分包`}
                      onClick={() => {
                        setDeliveryMode(EXPORT_DELIVERY_MODE.COMPATIBILITY_ZIP)
                        invalidatePreparedDestination()
                      }}
                    />
                  </div>
                  <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-[10px] leading-4 text-blue-900">
                    {deliveryMode === EXPORT_DELIVERY_MODE.DIRECTORY
                      ? '点击导出后，浏览器会请你选择父目录；应用再自动创建一个新子文件夹。'
                      : capabilities.nativeSaveFile
                        ? '点击导出后会打开系统“另存为”，可现场修改 ZIP 名称与位置。'
                        : 'ZIP 名称可在下方设置；保存路径由浏览器下载设置决定。'}
                  </p>
                </section>

                <section className="rounded-2xl border border-neutral-200 bg-white p-4">
                  <label className="block text-[10px] font-semibold text-neutral-600">
                    文档主题
                    <input
                      className="mt-1.5 h-10 w-full rounded-lg border border-neutral-300 px-3 text-xs outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
                      value={filename}
                      onChange={(event) => {
                        setFilename(event.currentTarget.value)
                        invalidatePreparedDestination()
                      }}
                    />
                  </label>
                  {deliveryMode === EXPORT_DELIVERY_MODE.COMPATIBILITY_ZIP ? (
                    <label className="mt-3 block text-[10px] font-semibold text-neutral-600">
                      ZIP 默认名称
                      <input
                        className="mt-1.5 h-10 w-full rounded-lg border border-neutral-300 px-3 font-mono text-xs outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
                        value={zipFileName}
                        onChange={(event) => {
                          setZipFileName(event.currentTarget.value)
                          invalidatePreparedDestination()
                        }}
                      />
                    </label>
                  ) : null}
                  <div className="mt-3 rounded-xl bg-neutral-50 p-3 text-[9px] leading-4 text-neutral-500">
                    <strong className="block text-[10px] text-neutral-700">文件名示例</strong>
                    <code className="mt-1 block break-all">{exampleStart}</code>
                    {pages.length > 1 ? <code className="block break-all">… {exampleEnd}</code> : null}
                    <span className="mt-1 block">并附带《导出清单.json》；重复导出自动使用 -02 / -03。</span>
                  </div>
                </section>

                {readinessIssues.length > 0 ? (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-950" role="alert">
                    <strong>
                      {hasBlockingReadinessIssue
                        ? '字体或排版预检未通过，已阻止导出'
                        : '部分图片资源尚未就绪'}
                    </strong>
                    <ul className="mt-1.5 list-disc space-y-1 pl-4">
                      {readinessIssues.map((issue, index) => (
                        <li key={`${issue.kind}-${issue.label}-${index}`}>
                          {issue.label}：{issue.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {exportError ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-800" role="alert">
                    {exportError}
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="mx-0 mb-0 rounded-none px-6 py-4">
          <div className="mr-auto flex items-center gap-2 text-[10px] text-neutral-500">
            {exporting ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin text-blue-600" aria-hidden="true" />
                {progress.total > 0
                  ? `正在生成 ${progress.current} / ${progress.total}`
                  : '正在检查资源…'}
              </>
            ) : (
              <>
                <Grid2X2Check className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                页码使用原稿编号，不会丢页、重复或重编号。
              </>
            )}
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={exporting}>
            取消
          </Button>
          {resumeToken ? (
            <Button
              onClick={() => void handleExport(true, resumeToken)}
              disabled={exporting}
            >
              <RotateCcw aria-hidden="true" />
              {resumeToken.plan.pages.length === resumeToken.completedPages.length
                ? '继续写入导出清单'
                : `继续剩余 ${resumeToken.plan.pages.length - resumeToken.completedPages.length} 张`}
            </Button>
          ) : readinessIssues.length > 0 ? (
            <>
              {!hasBlockingReadinessIssue ? (
                <Button variant="outline" onClick={() => void handleExport(true)} disabled={!canExport}>
                  仍然导出
                </Button>
              ) : null}
              <Button onClick={() => void handleExport(false)} disabled={!canExport}>
                重新检查
              </Button>
            </>
          ) : confirmAll ? null : (
            <Button onClick={() => void handleExport(false)} disabled={!canExport}>
              {exporting
                ? '导出中…'
                : pageMode === 'all'
                  ? `导出全部 ${pageCount} 张`
                  : `导出所选 ${pages.length} 张`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ModeButton({
  active,
  title,
  description,
  onClick,
}: {
  active: boolean
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`rounded-lg px-3 py-2.5 text-left transition ${
        active ? 'bg-white shadow-sm' : 'text-neutral-500 hover:text-neutral-800'
      }`}
      onClick={onClick}
    >
      <strong className="block text-xs">{title}</strong>
      <span className="mt-0.5 block text-[9px] font-normal opacity-70">{description}</span>
    </button>
  )
}

function DeliveryButton({
  active,
  icon,
  title,
  description,
  onClick,
}: {
  active: boolean
  icon: React.ReactNode
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={`flex items-start gap-3 rounded-xl border p-3 text-left transition ${
        active
          ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100'
          : 'border-neutral-200 bg-white hover:border-neutral-300'
      }`}
      onClick={onClick}
      aria-pressed={active}
    >
      <span className={`mt-0.5 [&_svg]:h-4 [&_svg]:w-4 ${active ? 'text-blue-700' : 'text-neutral-400'}`} aria-hidden="true">
        {icon}
      </span>
      <span>
        <strong className="block text-xs text-neutral-800">{title}</strong>
        <small className="mt-0.5 block text-[9px] font-normal leading-4 text-neutral-500">{description}</small>
      </span>
    </button>
  )
}

function AllPagesConfirmation({
  pageCount,
  onBack,
  onConfirm,
}: {
  pageCount: number
  onBack: () => void
  onConfirm: () => void
}) {
  return (
    <div className="mx-auto max-w-2xl py-8">
      <div className="rounded-2xl border border-orange-200 bg-orange-50 p-6">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-orange-100 text-orange-700">
          <AlertTriangle className="h-5 w-5" aria-hidden="true" />
        </span>
        <h2 className="mt-4 text-lg font-semibold text-orange-950">确认导出全部 {pageCount} 张</h2>
        <p className="mt-2 text-sm leading-6 text-orange-900">
          可以一次性导出；这里确认的是上传边界，不是导出限制。
        </p>
        <ul className="mt-4 space-y-2 text-xs leading-5 text-orange-900">
          <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />全部页面会进入同一个独立文件夹；ZIP 模式则使用包内唯一顶层文件夹，不分批。</li>
          <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />内部仍会逐页生成，以控制资源占用。</li>
          <li className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />这 {pageCount} 张不能作为一篇普通图文一次上传，完整包仅作本地留存。</li>
        </ul>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onBack}>返回调整</Button>
          <Button onClick={onConfirm}>确认本地完整留存，继续</Button>
        </div>
      </div>
    </div>
  )
}

function normalizeZipName(value: string): string {
  return createZipArtifactName(value, '小红书长图导出')
}

function appendZipCollisionSuffix(filename: string, collisionIndex: number): string {
  if (collisionIndex <= 1) return filename
  return filename.replace(
    /\.zip$/i,
    `-${String(collisionIndex).padStart(2, '0')}.zip`,
  )
}

function isAbortError(cause: unknown): boolean {
  return (
    cause instanceof DOMException && cause.name === 'AbortError'
  ) || (
    !!cause &&
    typeof cause === 'object' &&
    'name' in cause &&
    (cause as { name?: unknown }).name === 'AbortError'
  )
}
