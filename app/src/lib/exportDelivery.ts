import JSZip from 'jszip'
import { renderPagePngBlob } from './exportPng'
import {
  EXPORT_DELIVERY_MODE,
  createDeliveryPlan,
  createDirectoryResumePlan,
  type CreateFolderExportPlanOptions,
  type FolderExportPlan,
} from './exportPlan'

export interface ExportWritableFileStream {
  write(data: Blob | string): Promise<void>
  close(): Promise<void>
  abort?(reason?: unknown): Promise<void>
}

export interface ExportFileHandle {
  createWritable(): Promise<ExportWritableFileStream>
}

export interface ExportDirectoryHandle {
  getDirectoryHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<ExportDirectoryHandle>
  getFileHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<ExportFileHandle>
}

export interface ExportPickerWindow {
  showDirectoryPicker?: (options?: {
    id?: string
    mode?: 'read' | 'readwrite'
    startIn?: string
  }) => Promise<ExportDirectoryHandle>
  showSaveFilePicker?: (options?: {
    id?: string
    suggestedName?: string
    types?: Array<{
      description?: string
      accept: Record<string, string[]>
    }>
  }) => Promise<ExportFileHandle>
}

export interface ExportDestinationCapabilities {
  directory: boolean
  nativeSaveFile: boolean
}

export interface DirectoryExportResumeToken {
  plan: FolderExportPlan
  directoryHandle: ExportDirectoryHandle
  completedPages: number[]
  /** 用户已确认「按当前预览强制导出」的 warning 白名单跟随续写。 */
  allowWarnings?: boolean
}

export class DirectoryExportInterruptedError extends Error {
  readonly resumeToken: DirectoryExportResumeToken
  readonly cause: unknown

  constructor(resumeToken: DirectoryExportResumeToken, cause: unknown) {
    const completed = resumeToken.completedPages.length
    const total = resumeToken.plan.pages.length
    super(
      completed === total
        ? '全部图片已写入，但导出清单尚未完成，可继续写入清单。'
        : completed > 0
          ? `目录写入在完成 ${completed} 张后中断，可继续剩余页面。`
          : '目录写入已中断，可在同一文件夹继续这次任务。',
    )
    this.name = 'DirectoryExportInterruptedError'
    this.resumeToken = resumeToken
    this.cause = cause
  }
}

interface BaseExecutionOptions {
  pageElements: readonly HTMLElement[]
  onProgress?: (current: number, total: number) => void
  /** 仅放行 warning 级排版问题的强制导出；硬阻断仍会渲染失败。 */
  allowWarnings?: boolean
}

export interface ExecuteDirectoryExportOptions extends BaseExecutionOptions {
  parentHandle: ExportDirectoryHandle
  createPlanOptions: CreateFolderExportPlanOptions
  createPlan: (
    options: CreateFolderExportPlanOptions,
  ) => FolderExportPlan
  startCollisionIndex?: number
}

export interface ExecuteZipExportOptions extends BaseExecutionOptions {
  plan: FolderExportPlan
  zipFileName?: string
  collisionIndex?: number
  saveFileHandle?: ExportFileHandle
}

export function getExportDestinationCapabilities(
  target: ExportPickerWindow = window as unknown as ExportPickerWindow,
): ExportDestinationCapabilities {
  return {
    directory: typeof target.showDirectoryPicker === 'function',
    nativeSaveFile: typeof target.showSaveFilePicker === 'function',
  }
}

/**
 * 在用户选中的父目录下创建独立文件夹。若同名已存在，自动试探 -02/-03，
 * 不覆盖也不删除任何旧导出。
 */
export async function executeDirectoryExport({
  parentHandle,
  createPlanOptions,
  createPlan,
  pageElements,
  onProgress,
  allowWarnings,
  startCollisionIndex = 1,
}: ExecuteDirectoryExportOptions): Promise<FolderExportPlan> {
  const resolved = await createUniqueDirectory(
    parentHandle,
    createPlanOptions,
    createPlan,
    startCollisionIndex,
  )
  await writeDirectoryPlan({
    plan: resolved.plan,
    directoryHandle: resolved.directoryHandle,
    completedPages: [],
    pageElements,
    onProgress,
    allowWarnings,
  })
  return resolved.plan
}

/** 同页会话内续写：严格取已完成页的差集，不重排、不换目录。 */
export async function resumeDirectoryExport(
  token: DirectoryExportResumeToken,
  pageElements: readonly HTMLElement[],
  onProgress?: (current: number, total: number) => void,
): Promise<FolderExportPlan> {
  await writeDirectoryPlan({
    ...token,
    pageElements,
    onProgress,
  })
  return token.plan
}

export async function executeZipExport({
  plan,
  pageElements,
  zipFileName,
  collisionIndex = 1,
  saveFileHandle,
  onProgress,
  allowWarnings,
}: ExecuteZipExportOptions): Promise<FolderExportPlan> {
  assertPageElements(plan, pageElements)
  const totalSteps = plan.pages.length + 1
  const zip = new JSZip()
  const folder = zip.folder(plan.folderName)
  if (!folder) throw new Error('无法创建 ZIP 顶层文件夹')

  for (let index = 0; index < plan.files.length; index += 1) {
    const file = plan.files[index]
    const page = pageElements[file.pageNumber - 1]
    const blob = await renderPagePngBlob(page, { allowWarnings })
    folder.file(file.fileName, blob)
    onProgress?.(index + 1, totalSteps)
  }
  folder.file(plan.manifestFile.fileName, plan.manifestFile.content)
  const zipBlob = await zip.generateAsync({ type: 'blob' })
  onProgress?.(totalSteps, totalSteps)

  if (saveFileHandle) {
    await writeFileHandle(saveFileHandle, zipBlob)
  } else {
    const artifact = createDeliveryPlan(
      plan,
      EXPORT_DELIVERY_MODE.COMPATIBILITY_ZIP,
      { zipFileName, collisionIndex },
    )
    triggerBrowserDownload(zipBlob, artifact.artifactName)
  }
  return plan
}

async function createUniqueDirectory(
  parentHandle: ExportDirectoryHandle,
  baseOptions: CreateFolderExportPlanOptions,
  createPlan: (options: CreateFolderExportPlanOptions) => FolderExportPlan,
  startCollisionIndex: number,
): Promise<{
  plan: FolderExportPlan
  directoryHandle: ExportDirectoryHandle
}> {
  for (
    let collisionIndex = Math.max(1, startCollisionIndex);
    collisionIndex < startCollisionIndex + 1_000;
    collisionIndex += 1
  ) {
    const plan = createPlan({ ...baseOptions, collisionIndex })
    if (await directoryExists(parentHandle, plan.folderName)) continue
    try {
      const directoryHandle = await parentHandle.getDirectoryHandle(
        plan.folderName,
        { create: true },
      )
      return { plan, directoryHandle }
    } catch (error) {
      // Why: 同名普通文件也占用了这个路径段；当作命名碰撞
      // 继续试 -02/-03，不让一个无扩展名文件中断整次导出。
      if (isTypeMismatchError(error)) continue
      throw error
    }
  }
  throw new Error('无法为这次导出生成唯一文件夹名')
}

async function directoryExists(
  parentHandle: ExportDirectoryHandle,
  name: string,
): Promise<boolean> {
  try {
    await parentHandle.getDirectoryHandle(name)
    return true
  } catch (error) {
    if (isNotFoundError(error)) return false
    if (isTypeMismatchError(error)) return true
    throw error
  }
}

async function writeDirectoryPlan({
  plan,
  directoryHandle,
  completedPages,
  pageElements,
  onProgress,
  allowWarnings,
}: DirectoryExportResumeToken & BaseExecutionOptions): Promise<void> {
  assertPageElements(plan, pageElements)
  const resume = createDirectoryResumePlan(plan, completedPages)
  const completed = [...resume.completed]
  const totalSteps = plan.pages.length + 1
  onProgress?.(completed.length, totalSteps)

  try {
    for (const file of resume.remainingFiles) {
      const page = pageElements[file.pageNumber - 1]
      const blob = await renderPagePngBlob(page, { allowWarnings })
      const fileHandle = await directoryHandle.getFileHandle(file.fileName, {
        create: true,
      })
      await writeFileHandle(fileHandle, blob)
      // 只有 close() 成功后才记为完成，避免把半个 PNG 当成可续写成果。
      completed.push(file.pageNumber)
      completed.sort((left, right) => left - right)
      onProgress?.(completed.length, totalSteps)
    }

    const manifestHandle = await directoryHandle.getFileHandle(
      plan.manifestFile.fileName,
      { create: true },
    )
    // 清单最后落盘：它的存在即表示这个文件夹已完整交付。
    await writeFileHandle(manifestHandle, plan.manifestFile.content)
    onProgress?.(totalSteps, totalSteps)
  } catch (cause) {
    throw new DirectoryExportInterruptedError(
      { plan, directoryHandle, completedPages: completed, allowWarnings },
      cause,
    )
  }
}

async function writeFileHandle(
  fileHandle: ExportFileHandle,
  data: Blob | string,
): Promise<void> {
  const writable = await fileHandle.createWritable()
  try {
    await writable.write(data)
    await writable.close()
  } catch (error) {
    try {
      await writable.abort?.(error)
    } catch {
      // abort 只是尽力清理，原始写入错误必须保留。
    }
    throw error
  }
}

function assertPageElements(
  plan: FolderExportPlan,
  pageElements: readonly HTMLElement[],
): void {
  if (
    plan.pages.some(
      (pageNumber) =>
        !pageElements[pageNumber - 1] ||
        !pageElements[pageNumber - 1].isConnected,
    )
  ) {
    throw new Error('画布仍在更新，请稍候再试')
  }
}

function isNotFoundError(error: unknown): boolean {
  return (
    error instanceof DOMException && error.name === 'NotFoundError'
  ) || (
    !!error &&
    typeof error === 'object' &&
    'name' in error &&
    (error as { name?: unknown }).name === 'NotFoundError'
  )
}

function isTypeMismatchError(error: unknown): boolean {
  return (
    error instanceof DOMException && error.name === 'TypeMismatchError'
  ) || (
    !!error &&
    typeof error === 'object' &&
    'name' in error &&
    (error as { name?: unknown }).name === 'TypeMismatchError'
  )
}

function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  window.setTimeout(() => {
    anchor.remove()
    URL.revokeObjectURL(url)
  }, 60_000)
}
