import { describe, expect, it } from 'vitest'
import {
  EXPORT_DELIVERY_MODE,
  EXPORT_MANIFEST_FILE_NAME,
  ExportPlanError,
  cleanDocumentName,
  createDeliveryPlan,
  createDirectoryResumePlan,
  createFolderExportPlan,
  createZipArtifactName,
  formatPageNumber,
  formatPageSelection,
  getOrdinaryPostStatus,
  parsePageSelection,
  recommendDeliveryMode,
  requiresAllPagesConfirmation,
  togglePageSelection,
} from './exportPlan'

const exportedAt = new Date('2026-08-11T14:30:25+08:00')

describe('普通图文兼容线', () => {
  it('17 / 18 / 19 页使用精确文案，18 不会变成导出上限', () => {
    expect(getOrdinaryPostStatus(17)).toMatchObject({
      kind: 'within-limit',
      label: '可作为一篇普通图文发布',
    })
    expect(getOrdinaryPostStatus(18)).toMatchObject({
      kind: 'at-limit',
      label: '18 张，达到当前普通图文单篇上限',
    })
    expect(getOrdinaryPostStatus(19)).toMatchObject({
      kind: 'over-limit',
      label: '共 19 张，超过普通图文单篇上限 18 张；仍会完整生成',
    })
    expect(getOrdinaryPostStatus(11, 10).kind).toBe('over-limit')
  })

  it('只有超限的全量导出需要二次确认', () => {
    expect(requiresAllPagesConfirmation(17)).toBe(false)
    expect(requiresAllPagesConfirmation(18)).toBe(false)
    expect(requiresAllPagesConfirmation(19)).toBe(true)
    expect(requiresAllPagesConfirmation(11, 10)).toBe(true)
  })
})

describe('页码输入与缩略图选择', () => {
  it('支持中英文分隔、范围归并与自动去重', () => {
    const result = parsePageSelection('1-3，5, 7–9, 9', 19)
    expect(result.pages).toEqual([1, 2, 3, 5, 7, 8, 9])
    expect(result.ranges.map(({ start, end }) => ({ start, end }))).toEqual([
      { start: 1, end: 3 },
      { start: 5, end: 5 },
      { start: 7, end: 9 },
    ])
    expect(result.inputValue).toBe('1-3, 5, 7-9')
    expect(result.label).toBe('第 1–3、5、7–9 页')
  })

  it('缩略图点选始终保持原页码升序去重，且允许暂时空选', () => {
    expect(togglePageSelection([19, 3, 3, 1], 8, 19)).toEqual([1, 3, 8, 19])
    expect(togglePageSelection([1, 3, 8, 19], 3, 19)).toEqual([1, 8, 19])
    expect(togglePageSelection([1], 1, 19)).toEqual([])
    expect(formatPageSelection([9, 3, 2, 1, 9, 5], 19)).toBe('1-3, 5, 9')
  })

  it('拒绝空输入、越界、倒序和错误格式', () => {
    const cases: Array<[() => unknown, string]> = [
      [() => parsePageSelection('', 19), 'EMPTY_SELECTION'],
      [() => parsePageSelection('20', 19), 'SELECTION_OUT_OF_RANGE'],
      [() => parsePageSelection('9-7', 19), 'DESCENDING_SELECTION_RANGE'],
      [() => parsePageSelection('1-a', 19), 'INVALID_SELECTION_FORMAT'],
      [() => togglePageSelection([], 0, 19), 'PAGE_OUT_OF_RANGE'],
    ]
    for (const [run, code] of cases) {
      expect(run).toThrowError(
        expect.objectContaining<Partial<ExportPlanError>>({ code }),
      )
    }
  })
})

describe('导出命名与清单', () => {
  it('19 页可一次完整计划到同一文件夹，页码无丢失无重复', () => {
    const plan = createFolderExportPlan({
      sourceName: '夏日露营.md',
      pageCount: 19,
      exportedAt,
    })
    expect(plan.mode).toBe('all')
    expect(plan.folderName).toBe('夏日露营__全部__19张__20260811-143025')
    expect(plan.pages).toEqual(Array.from({ length: 19 }, (_, index) => index + 1))
    expect(plan.files[0]).toEqual({
      pageNumber: 1,
      role: 'cover',
      fileName: '01_夏日露营_cover.png',
    })
    expect(plan.files.at(-1)).toEqual({
      pageNumber: 19,
      role: 'inner',
      fileName: '19_夏日露营_inner.png',
    })
    expect(new Set(plan.files.map(({ fileName }) => fileName)).size).toBe(19)
    expect(plan.manifest.ordinaryPostCompatibility).toEqual({
      limit: 18,
      isCompatible: false,
    })
    expect(plan.manifestFile.fileName).toBe(EXPORT_MANIFEST_FILE_NAME)
    expect(plan.manifestJson.endsWith('\n')).toBe(true)
    expect(JSON.parse(plan.manifestJson)).toEqual(plan.manifest)
  })

  it('范围和非连续自选均保留原稿页码，不从 01 重编', () => {
    const range = createFolderExportPlan({
      sourceName: '夏日露营',
      pageCount: 19,
      selectedPages: [12, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      exportedAt,
    })
    expect(range.mode).toBe('range')
    expect(range.folderName).toContain('范围-p03-p12')
    expect(range.files[0].fileName).toBe('03_夏日露营_inner.png')

    const selected = createFolderExportPlan({
      sourceName: '夏日露营',
      pageCount: 19,
      selectedPages: [19, 3, 8, 3, 1, 12],
      exportedAt,
    })
    expect(selected.mode).toBe('selection')
    expect(selected.pages).toEqual([1, 3, 8, 12, 19])
    expect(selected.files.map(({ fileName }) => fileName)).toEqual([
      '01_夏日露营_cover.png',
      '03_夏日露营_inner.png',
      '08_夏日露营_inner.png',
      '12_夏日露营_inner.png',
      '19_夏日露营_inner.png',
    ])
    expect(selected.manifest.sourcePages).toEqual(selected.pages)
  })

  it('页码至少两位，并随原稿总页数扩展', () => {
    expect(formatPageNumber(1, 9)).toBe('01')
    expect(formatPageNumber(1, 19)).toBe('01')
    expect(formatPageNumber(1, 120)).toBe('001')
    expect(formatPageNumber(120, 120)).toBe('120')
  })

  it('重复导出为文件夹与 ZIP 追加 -02 / -03', () => {
    const second = createFolderExportPlan({
      sourceName: '夏日露营',
      pageCount: 19,
      exportedAt,
      collisionIndex: 2,
    })
    expect(second.folderName).toMatch(/-02$/)
    expect(second.manifest.folderName).toBe(second.folderName)
    expect(createZipArtifactName('我的导出.zip', second.folderName, 2)).toBe(
      '我的导出-02.zip',
    )
    expect(createZipArtifactName('申论/导出:包', second.folderName, 3)).toBe(
      '申论-导出-包-03.zip',
    )
  })

  it('长中文主题与 ZIP 名按 UTF-8 字节安全截断', () => {
    const longTopic = `  ${'题'.repeat(100)}.md  `
    const cleaned = cleanDocumentName(longTopic)
    const plan = createFolderExportPlan({
      sourceName: longTopic,
      pageCount: 19,
      exportedAt,
    })
    const zipName = createZipArtifactName(
      `${'包'.repeat(100)}.zip`,
      plan.folderName,
      2,
    )
    const bytes = (value: string) => new TextEncoder().encode(value).byteLength

    expect(bytes(cleaned)).toBeLessThanOrEqual(120)
    expect(cleaned).toBe('题'.repeat(40))
    expect(plan.files.every(({ fileName }) => bytes(fileName) <= 255)).toBe(true)
    expect(bytes(plan.folderName)).toBeLessThanOrEqual(255)
    expect(bytes(zipName)).toBeLessThanOrEqual(255)
    expect(zipName).toMatch(/-02\.zip$/)
  })
})

describe('直接文件夹与兼容 ZIP', () => {
  it('支持目录时优先直写，不支持时只切换交付容器', () => {
    expect(recommendDeliveryMode(true)).toBe(EXPORT_DELIVERY_MODE.DIRECTORY)
    expect(recommendDeliveryMode(false)).toBe(EXPORT_DELIVERY_MODE.COMPATIBILITY_ZIP)
  })

  it('37 页 ZIP 仍只有一个顶层文件夹，不按 18 页分批', () => {
    const plan = createFolderExportPlan({
      sourceName: '37页文稿',
      pageCount: 37,
      exportedAt,
      deliveryMode: EXPORT_DELIVERY_MODE.COMPATIBILITY_ZIP,
    })
    const delivery = createDeliveryPlan(plan, EXPORT_DELIVERY_MODE.COMPATIBILITY_ZIP)
    expect(delivery.pngCount).toBe(37)
    expect(delivery.childNames).toHaveLength(38)
    expect(delivery.topLevelFolderCount).toBe(1)
    expect(delivery.isSplit).toBe(false)
    expect(new Set(delivery.entryPaths.map((path) => path.split('/')[0])).size).toBe(1)
    expect(delivery.entryPaths.at(-1)).toBe(
      `${plan.folderName}/${EXPORT_MANIFEST_FILE_NAME}`,
    )
  })

  it('目录与 ZIP 的页码、文件和清单映射完全一致', () => {
    const direct = createFolderExportPlan({
      sourceName: '申论主题',
      pageCount: 19,
      selectedPages: [19, 1, 3, 8],
      exportedAt,
      deliveryMode: EXPORT_DELIVERY_MODE.DIRECTORY,
    })
    const zipped = createFolderExportPlan({
      sourceName: '申论主题',
      pageCount: 19,
      selectedPages: [19, 1, 3, 8],
      exportedAt,
      deliveryMode: EXPORT_DELIVERY_MODE.COMPATIBILITY_ZIP,
    })
    const directDelivery = createDeliveryPlan(direct, EXPORT_DELIVERY_MODE.DIRECTORY)
    const zipDelivery = createDeliveryPlan(
      zipped,
      EXPORT_DELIVERY_MODE.COMPATIBILITY_ZIP,
      { zipFileName: '自定义导出包.zip' },
    )
    expect(direct.files).toEqual(zipped.files)
    expect(direct.pages).toEqual(zipped.pages)
    expect(directDelivery.childNames).toEqual(zipDelivery.childNames)
    expect(directDelivery.entryPaths).toEqual(zipDelivery.entryPaths)
    expect(zipDelivery.artifactName).toBe('自定义导出包.zip')
  })
})

describe('目录写入中断续写', () => {
  it('19 页在前 6 页完成后只续写 7–19，合并后无丢页无重复', () => {
    const plan = createFolderExportPlan({
      sourceName: '断点续写',
      pageCount: 19,
      exportedAt,
      deliveryMode: EXPORT_DELIVERY_MODE.DIRECTORY,
    })
    const resume = createDirectoryResumePlan(plan, [6, 4, 2, 1, 6, 5, 3])
    expect(resume.completed).toEqual([1, 2, 3, 4, 5, 6])
    expect(resume.remaining).toEqual(
      Array.from({ length: 13 }, (_, index) => index + 7),
    )
    expect(resume.resumePlan.folderName).toBe(plan.folderName)
    expect(resume.resumePlan.files.map(({ pageNumber }) => pageNumber)).toEqual(
      resume.remaining,
    )
    const merged = [...resume.completed, ...resume.remaining].sort((a, b) => a - b)
    expect(merged).toEqual(plan.pages)
    expect(new Set(merged).size).toBe(plan.pages.length)
  })

  it('自选页续写不重编，ZIP 不伪装成可续写任务', () => {
    const direct = createFolderExportPlan({
      sourceName: '断点续写',
      pageCount: 19,
      selectedPages: [19, 3, 8, 1, 12],
      exportedAt,
      deliveryMode: EXPORT_DELIVERY_MODE.DIRECTORY,
    })
    const resume = createDirectoryResumePlan(direct, [12, 1, 12])
    expect(resume.completed).toEqual([1, 12])
    expect(resume.remaining).toEqual([3, 8, 19])
    expect(resume.remainingFiles.map(({ fileName }) => fileName)).toEqual([
      '03_断点续写_inner.png',
      '08_断点续写_inner.png',
      '19_断点续写_inner.png',
    ])

    const zipped = createFolderExportPlan({
      sourceName: '断点续写',
      pageCount: 19,
      exportedAt,
      deliveryMode: EXPORT_DELIVERY_MODE.COMPATIBILITY_ZIP,
    })
    expect(() => createDirectoryResumePlan(zipped, [1, 2])).toThrowError(
      expect.objectContaining<Partial<ExportPlanError>>({
        code: 'UNSUPPORTED_DELIVERY_MODE',
      }),
    )
  })
})
