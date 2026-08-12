import JSZip from 'jszip'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderPagePngBlob } from './exportPng'
import {
  DirectoryExportInterruptedError,
  executeDirectoryExport,
  executeZipExport,
  getExportDestinationCapabilities,
  resumeDirectoryExport,
  type ExportDirectoryHandle,
  type ExportFileHandle,
  type ExportWritableFileStream,
} from './exportDelivery'
import {
  EXPORT_DELIVERY_MODE,
  createFolderExportPlan,
} from './exportPlan'

vi.mock('./exportPng', () => ({
  buildExportBatchCss: vi.fn(() => ''),
  renderPagePngBlob: vi.fn(async (page: HTMLElement) =>
    new Blob([page.dataset.page ?? 'unknown'], { type: 'image/png' }),
  ),
}))

interface WrittenEntry {
  name: string
  data: Blob | string
  closed: boolean
}

class MemoryFileHandle implements ExportFileHandle {
  private readonly name: string
  private readonly entries: WrittenEntry[]
  private readonly failClose: () => boolean

  constructor(
    name: string,
    entries: WrittenEntry[],
    failClose: () => boolean = () => false,
  ) {
    this.name = name
    this.entries = entries
    this.failClose = failClose
  }

  async createWritable(): Promise<ExportWritableFileStream> {
    const entry: WrittenEntry = { name: this.name, data: '', closed: false }
    this.entries.push(entry)
    return {
      async write(data) {
        entry.data = data
      },
      close: async () => {
        if (this.failClose()) throw new Error(`close failed: ${this.name}`)
        entry.closed = true
      },
    }
  }
}

class MemoryDirectoryHandle implements ExportDirectoryHandle {
  readonly directories = new Map<string, MemoryDirectoryHandle>()
  readonly files = new Set<string>()
  readonly entries: WrittenEntry[] = []
  failFileName: string | null = null
  childFailFileName: string | null = null

  async getDirectoryHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<ExportDirectoryHandle> {
    if (this.files.has(name)) {
      throw new DOMException('file occupies this name', 'TypeMismatchError')
    }
    const existing = this.directories.get(name)
    if (existing) return existing
    if (!options?.create) throw new DOMException('missing', 'NotFoundError')
    const directory = new MemoryDirectoryHandle()
    directory.failFileName = this.childFailFileName
    this.directories.set(name, directory)
    return directory
  }

  async getFileHandle(
    name: string,
  ): Promise<ExportFileHandle> {
    return new MemoryFileHandle(
      name,
      this.entries,
      () => this.failFileName === name,
    )
  }
}

function makePages(count: number): HTMLElement[] {
  return Array.from({ length: count }, (_value, index) => {
    const page = document.createElement('div')
    page.dataset.page = String(index + 1)
    document.body.appendChild(page)
    return page
  })
}

afterEach(() => {
  document.body.replaceChildren()
  vi.clearAllMocks()
})

describe('exportDelivery', () => {
  it('检测目录与系统另存为能力', () => {
    expect(getExportDestinationCapabilities({})).toEqual({
      directory: false,
      nativeSaveFile: false,
    })
    expect(
      getExportDestinationCapabilities({
        showDirectoryPicker: vi.fn(),
        showSaveFilePicker: vi.fn(),
      }),
    ).toEqual({ directory: true, nativeSaveFile: true })
  })

  it('已有同名目录时自动使用 -02，清单在所有 PNG 关闭后最后写入', async () => {
    const parent = new MemoryDirectoryHandle()
    const exportedAt = new Date('2026-08-11T14:30:25+08:00')
    const base = createFolderExportPlan({
      sourceName: '申论',
      pageCount: 3,
      exportedAt,
      deliveryMode: EXPORT_DELIVERY_MODE.DIRECTORY,
    })
    parent.directories.set(base.folderName, new MemoryDirectoryHandle())

    const completed = await executeDirectoryExport({
      parentHandle: parent,
      createPlanOptions: {
        sourceName: '申论',
        pageCount: 3,
        exportedAt,
        deliveryMode: EXPORT_DELIVERY_MODE.DIRECTORY,
      },
      createPlan: createFolderExportPlan,
      pageElements: makePages(3),
    })

    expect(completed.folderName).toMatch(/-02$/)
    const directory = parent.directories.get(completed.folderName)!
    expect(directory.entries.map(({ name }) => name)).toEqual([
      '01_申论_cover.png',
      '02_申论_inner.png',
      '03_申论_inner.png',
      '导出清单.json',
    ])
    expect(directory.entries.every(({ closed }) => closed)).toBe(true)
  })

  it('同名普通文件占位时也使用 -02，不以 TypeMismatchError 中断', async () => {
    const parent = new MemoryDirectoryHandle()
    const exportedAt = new Date('2026-08-11T14:30:25+08:00')
    const base = createFolderExportPlan({
      sourceName: '申论',
      pageCount: 2,
      exportedAt,
      deliveryMode: EXPORT_DELIVERY_MODE.DIRECTORY,
    })
    parent.files.add(base.folderName)

    const completed = await executeDirectoryExport({
      parentHandle: parent,
      createPlanOptions: {
        sourceName: '申论',
        pageCount: 2,
        exportedAt,
        deliveryMode: EXPORT_DELIVERY_MODE.DIRECTORY,
      },
      createPlan: createFolderExportPlan,
      pageElements: makePages(2),
    })

    expect(completed.folderName).toMatch(/-02$/)
    expect(parent.directories.has(completed.folderName)).toBe(true)
  })

  it('目录中断只把 close 成功页记为完成，续写不重复第 1 页', async () => {
    const parent = new MemoryDirectoryHandle()
    const pages = makePages(3)
    let interruption: DirectoryExportInterruptedError | null = null
    parent.childFailFileName = '02_中断_inner.png'

    try {
      await executeDirectoryExport({
        parentHandle: parent,
        createPlanOptions: {
          sourceName: '中断',
          pageCount: 3,
          exportedAt: new Date('2026-08-11T14:30:25+08:00'),
          deliveryMode: EXPORT_DELIVERY_MODE.DIRECTORY,
        },
        createPlan: createFolderExportPlan,
        pageElements: pages,
      })
    } catch (error) {
      interruption = error as DirectoryExportInterruptedError
    }

    expect(interruption).toBeInstanceOf(DirectoryExportInterruptedError)
    expect(interruption!.resumeToken.completedPages).toEqual([1])
    const directory = interruption!.resumeToken.directoryHandle as MemoryDirectoryHandle
    directory.failFileName = null
    await resumeDirectoryExport(interruption!.resumeToken, pages)

    expect(
      directory.entries.filter(({ name, closed }) =>
        name === '01_中断_cover.png' && closed,
      ),
    ).toHaveLength(1)
    expect(directory.entries.at(-1)?.name).toBe('导出清单.json')
  })

  it('只有清单写入失败时保留全部已完成页，续写只重试清单', async () => {
    const parent = new MemoryDirectoryHandle()
    const pages = makePages(2)
    let interruption: DirectoryExportInterruptedError | null = null
    parent.childFailFileName = '导出清单.json'

    try {
      await executeDirectoryExport({
        parentHandle: parent,
        createPlanOptions: {
          sourceName: '清单续写',
          pageCount: 2,
          exportedAt: new Date('2026-08-11T14:30:25+08:00'),
          deliveryMode: EXPORT_DELIVERY_MODE.DIRECTORY,
        },
        createPlan: createFolderExportPlan,
        pageElements: pages,
      })
    } catch (error) {
      interruption = error as DirectoryExportInterruptedError
    }

    expect(interruption).toBeInstanceOf(DirectoryExportInterruptedError)
    expect(interruption!.resumeToken.completedPages).toEqual([1, 2])
    expect(interruption!.message).toContain('导出清单尚未完成')
    expect(renderPagePngBlob).toHaveBeenCalledTimes(2)

    const directory = interruption!.resumeToken.directoryHandle as MemoryDirectoryHandle
    directory.failFileName = null
    await resumeDirectoryExport(interruption!.resumeToken, pages)

    expect(renderPagePngBlob).toHaveBeenCalledTimes(2)
    expect(directory.entries.filter(({ name, closed }) =>
      name === '导出清单.json' && closed,
    )).toHaveLength(1)
  })

  it('兼容 ZIP 仅包含一个顶层文件夹和一份清单', async () => {
    const plan = createFolderExportPlan({
      sourceName: '19页文稿',
      pageCount: 3,
      exportedAt: new Date('2026-08-11T14:30:25+08:00'),
      deliveryMode: EXPORT_DELIVERY_MODE.COMPATIBILITY_ZIP,
    })
    const writes: WrittenEntry[] = []
    const saveHandle = new MemoryFileHandle('bundle.zip', writes)

    await executeZipExport({
      plan,
      pageElements: makePages(3),
      saveFileHandle: saveHandle,
    })

    expect(renderPagePngBlob).toHaveBeenCalledTimes(3)
    expect(writes).toHaveLength(1)
    const zip = await JSZip.loadAsync(
      await (writes[0].data as Blob).arrayBuffer(),
    )
    const paths = Object.keys(zip.files)
    expect(paths.filter((path) => !path.endsWith('/'))).toEqual([
      `${plan.folderName}/01_19页文稿_cover.png`,
      `${plan.folderName}/02_19页文稿_inner.png`,
      `${plan.folderName}/03_19页文稿_inner.png`,
      `${plan.folderName}/导出清单.json`,
    ])
  })
})
