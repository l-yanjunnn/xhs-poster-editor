import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  clearEditorDocumentRecovery,
  discardEditorDocumentRecovery,
  deleteEditorDocument,
  EDITOR_DOCUMENT_SCHEMA_VERSION,
  EDITOR_DOCUMENT_SCHEMA_VERSION_V1,
  getActiveDocumentId,
  getActiveEditorDocument,
  getEditorDocument,
  listEditorDocuments,
  putEditorDocument,
  readEditorDocumentRecovery,
  setActiveDocumentId,
  setDocumentStoreBackendForTests,
  writeEditorDocumentRecovery,
  type DocumentStoreBackend,
  type EditorDocumentV1,
  type EditorDocumentV2,
} from './documentStore'

const RECOVERY_STORAGE_KEY_V1 = 'xhs-poster-active-document-recovery-v1'
const RECOVERY_STORAGE_KEY_V2 = 'xhs-poster-active-document-recovery-v2'

function makeDocument(
  id: string,
  updatedAt: number,
  title = id,
): EditorDocumentV2 {
  return {
    schemaVersion: EDITOR_DOCUMENT_SCHEMA_VERSION,
    id,
    recoveryId: `recovery-${id}-${updatedAt}`,
    revision: updatedAt,
    title,
    createdAt: 100,
    updatedAt,
    contentJSON: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: title }] }],
    },
    style: {
      themeClass: '',
      overlay: 'none',
      h1Width: '66%',
      fontH1: 'serif',
      fontH2: 'serif',
      fontH3: 'sans-serif',
      fontBody: 'sans-serif',
      h1Bold: true,
      h2Bold: true,
      h3Bold: true,
      fontSize: 40,
      density: 'normal',
      logoStrategy: 'every',
      bgAssetId: 'builtin-bg-xuan',
      logoAssetId: 'builtin-logo-cat',
      coverBgAssetId: 'builtin-bg-cover',
      coverTitleColor: '#6D136C',
      coverSubtitleColor: '#5A465F',
    },
  }
}

function makeLegacyDocument(
  id: string,
  updatedAt: number,
  themeClass: EditorDocumentV1['style']['themeClass'] = '',
  bgAssetId = 'builtin-bg-xuan',
): EditorDocumentV1 {
  const document = makeDocument(id, updatedAt)
  const legacyStyle = { ...document.style } as Partial<EditorDocumentV2['style']>
  delete legacyStyle.coverBgAssetId
  delete legacyStyle.coverTitleColor
  delete legacyStyle.coverSubtitleColor
  return {
    ...document,
    schemaVersion: EDITOR_DOCUMENT_SCHEMA_VERSION_V1,
    style: {
      ...(legacyStyle as EditorDocumentV1['style']),
      themeClass,
      bgAssetId,
    },
  }
}

function migratedLegacyDocument(document: EditorDocumentV1): EditorDocumentV2 {
  const primaryColor = ({
    '': '#1A1A1A',
    'theme-minimal-white': '#111111',
    'theme-dark-night': '#F0F0F0',
  } as Record<string, string>)[document.style.themeClass] ?? '#1A1A1A'
  return {
    ...document,
    schemaVersion: EDITOR_DOCUMENT_SCHEMA_VERSION,
    style: {
      ...document.style,
      coverBgAssetId: document.style.bgAssetId,
      coverTitleColor: primaryColor,
      coverSubtitleColor: primaryColor,
    },
  }
}

describe('documentStore', () => {
  beforeEach(() => {
    setDocumentStoreBackendForTests(createMemoryBackend())
    localStorage.clear()
  })

  afterEach(() => {
    setDocumentStoreBackendForTests(null)
  })

  it('保存文档并原子地记住最后活动草稿', async () => {
    const document = makeDocument('draft-a', 200, '申论草稿')

    await putEditorDocument(document)

    expect(await getActiveDocumentId()).toBe('draft-a')
    expect(await getActiveEditorDocument()).toEqual(document)
    expect(await getEditorDocument('draft-a')).toEqual(document)
  })

  it('同 id 自动保存会覆盖快照，不会生成重复草稿', async () => {
    await putEditorDocument(makeDocument('draft-a', 200, '初稿'))
    await putEditorDocument(makeDocument('draft-a', 300, '修改稿'))

    const documents = await listEditorDocuments()
    expect(documents).toHaveLength(1)
    expect(documents[0].title).toBe('修改稿')
    expect(documents[0].updatedAt).toBe(300)
  })

  it('发布文案与导入来源随草稿快照原子保存', async () => {
    const document = {
      ...makeDocument('imported', 350, '导入草稿'),
      publication: {
        releaseCopy: '发布文案\n#申论',
        sourceName: '申论文稿.md',
        importedAt: 1_786_464_000_000,
      },
    }

    await putEditorDocument(document)

    expect((await getEditorDocument(document.id))?.publication).toEqual(
      document.publication,
    )
  })

  it('草稿列表按最近修改时间倒序排列', async () => {
    await putEditorDocument(makeDocument('older', 200), false)
    await putEditorDocument(makeDocument('newer', 400), false)
    await putEditorDocument(makeDocument('middle', 300), false)

    expect((await listEditorDocuments()).map((d) => d.id)).toEqual([
      'newer',
      'middle',
      'older',
    ])
  })

  it('删除活动草稿时清除活动指针，其他草稿不受影响', async () => {
    await putEditorDocument(makeDocument('keep', 200), false)
    await putEditorDocument(makeDocument('active', 300))

    await deleteEditorDocument('active')

    expect(await getActiveDocumentId()).toBeNull()
    expect(await getEditorDocument('active')).toBeNull()
    expect((await listEditorDocuments()).map((d) => d.id)).toEqual(['keep'])
  })

  it('可以只切换活动草稿，不改写文档内容', async () => {
    const first = makeDocument('first', 200)
    const second = makeDocument('second', 300)
    await putEditorDocument(first, false)
    await putEditorDocument(second, false)

    await setActiveDocumentId('first')

    expect(await getActiveEditorDocument()).toEqual(first)
    expect(await getEditorDocument('second')).toEqual(second)
  })

  it.each([
    ['', '#1A1A1A'],
    ['theme-minimal-white', '#111111'],
    ['theme-dark-night', '#F0F0F0'],
  ] as const)(
    'V1 %s 草稿读取后统一迁移为 V2，保持原底图与主色',
    async (themeClass, primaryColor) => {
      const legacy = makeLegacyDocument(
        `legacy-${themeClass || 'elegant'}`,
        450,
        themeClass,
        themeClass ? '' : 'builtin-bg-xuan',
      )
      setDocumentStoreBackendForTests(createMemoryBackend([legacy]))

      const restored = await getEditorDocument(legacy.id)

      expect(restored?.schemaVersion).toBe(EDITOR_DOCUMENT_SCHEMA_VERSION)
      expect(restored?.style.coverBgAssetId).toBe(legacy.style.bgAssetId)
      expect(restored?.style.coverTitleColor).toBe(primaryColor)
      expect(restored?.style.coverSubtitleColor).toBe(primaryColor)
      expect(await listEditorDocuments()).toEqual([
        migratedLegacyDocument(legacy),
      ])
    },
  )

  it('拒绝未知 schema 和缺失样式字段，避免损坏数据覆盖好草稿', async () => {
    const future = { ...makeDocument('future', 500), schemaVersion: 3 }
    await expect(
      putEditorDocument(future as unknown as EditorDocumentV2),
    ).rejects.toThrow('暂不支持草稿版本')

    const incomplete = makeDocument('incomplete', 600)
    const incompleteStyle = { ...incomplete.style } as Partial<
      EditorDocumentV2['style']
    >
    delete incompleteStyle.fontBody
    await expect(
      putEditorDocument({
        ...incomplete,
        style: incompleteStyle,
      } as unknown as EditorDocumentV2),
    ).rejects.toThrow('样式字段不完整')
  })

  it('V1 parser 仍严格拒绝缺失字段的旧草稿', async () => {
    const legacy = makeLegacyDocument('broken-legacy', 650)
    const style = { ...legacy.style } as Partial<EditorDocumentV1['style']>
    delete style.fontBody
    setDocumentStoreBackendForTests(
      createMemoryBackend([{ ...legacy, style }]),
    )

    await expect(getEditorDocument(legacy.id)).rejects.toThrow(
      '样式字段不完整',
    )
  })

  it('V2 parser 要求双底图与两个颜色字段全部存在', async () => {
    const document = makeDocument('incomplete-v2', 665)
    const style = { ...document.style } as Partial<EditorDocumentV2['style']>
    delete style.coverBgAssetId

    await expect(
      putEditorDocument({ ...document, style } as unknown as EditorDocumentV2),
    ).rejects.toThrow('V2 封面样式字段不完整')
  })

  it('V2 parser 拒绝损坏的发布文案元数据', async () => {
    const document = makeDocument('broken-publication', 670)
    await expect(
      putEditorDocument({
        ...document,
        publication: {
          releaseCopy: '文案',
          sourceName: null,
          importedAt: 'not-a-time',
        },
      } as unknown as EditorDocumentV2),
    ).rejects.toThrow('发布文案字段不完整')
  })

  it.each(['#6d136c', '#ABC', '6D136C', '#6D136C00', '#GGGGGG'])(
    'V2 拒绝非规范六位 HEX：%s',
    async (invalidColor) => {
      const document = makeDocument(`bad-color-${invalidColor}`, 675)
      await expect(
        putEditorDocument({
          ...document,
          style: { ...document.style, coverTitleColor: invalidColor },
        }),
      ).rejects.toThrow('封面颜色必须是规范六位 HEX')
    },
  )

  it('拒绝损坏的样式枚举和不合理字号', async () => {
    const badDensity = makeDocument('bad-density', 700)
    await expect(
      putEditorDocument({
        ...badDensity,
        style: { ...badDensity.style, density: 'broken-density' },
      } as unknown as EditorDocumentV2),
    ).rejects.toThrow('样式枚举值无效')

    const badOverlay = makeDocument('bad-overlay', 800)
    await expect(
      putEditorDocument({
        ...badOverlay,
        style: { ...badOverlay.style, overlay: 'transparent-ish' },
      } as unknown as EditorDocumentV2),
    ).rejects.toThrow('样式枚举值无效')

    const badFontSize = makeDocument('bad-font-size', 900)
    await expect(
      putEditorDocument({
        ...badFontSize,
        style: { ...badFontSize.style, fontSize: 1000 },
      }),
    ).rejects.toThrow('样式字段不完整')
  })

  it('单条损坏草稿不会阻断其余健康草稿列表与活动草稿回退', async () => {
    const valid = makeDocument('valid', 1000, '健康草稿')
    const broken = { ...makeDocument('broken', 1100), schemaVersion: 99 }
    const originalWarn = console.warn
    console.warn = () => undefined
    setDocumentStoreBackendForTests({
      async put() {},
      async list() {
        return [broken, valid]
      },
      async get(id) {
        return id === 'broken' ? broken : valid
      },
      async getActiveId() {
        return 'broken'
      },
      async setActiveId() {},
      async delete() {},
    })

    try {
      expect(await listEditorDocuments()).toEqual([valid])
      expect(await getActiveEditorDocument()).toBeNull()
    } finally {
      console.warn = originalWarn
    }
  })

  it('同步恢复日志仅在对应版本已落盘后清除', () => {
    const recovery = makeDocument('draft-a', 1200, '关页前最后输入')
    expect(writeEditorDocumentRecovery(recovery)).toBe(true)
    expect(readEditorDocumentRecovery()).toEqual(recovery)

    clearEditorDocumentRecovery('draft-a', 'older-recovery')
    expect(readEditorDocumentRecovery()).toEqual(recovery)

    clearEditorDocumentRecovery('other-draft', recovery.recoveryId)
    expect(readEditorDocumentRecovery()).toEqual(recovery)

    clearEditorDocumentRecovery('draft-a', recovery.recoveryId)
    expect(readEditorDocumentRecovery()).toBeNull()
  })

  it('新 WAL 写入 v2 key 并主动清掉旧 v1 key', () => {
    const staleLegacy = makeLegacyDocument('draft-a', 1100)
    const recovery = makeDocument('draft-a', 1200, '新版待恢复')
    localStorage.setItem(RECOVERY_STORAGE_KEY_V1, JSON.stringify(staleLegacy))

    expect(writeEditorDocumentRecovery(recovery)).toBe(true)

    expect(localStorage.getItem(RECOVERY_STORAGE_KEY_V1)).toBeNull()
    expect(JSON.parse(localStorage.getItem(RECOVERY_STORAGE_KEY_V2)!)).toEqual(
      recovery,
    )
  })

  it('WAL 读取 v2 优先，v2 缺失时才兼容迁移 v1', () => {
    const legacy = makeLegacyDocument('legacy', 1150, 'theme-dark-night', '')
    const current = makeDocument('current', 1250)
    localStorage.setItem(RECOVERY_STORAGE_KEY_V1, JSON.stringify(legacy))
    localStorage.setItem(RECOVERY_STORAGE_KEY_V2, JSON.stringify(current))

    expect(readEditorDocumentRecovery()).toEqual(current)

    localStorage.removeItem(RECOVERY_STORAGE_KEY_V2)
    expect(readEditorDocumentRecovery()).toEqual(migratedLegacyDocument(legacy))
  })

  it('损坏的 v2 WAL 会被移除，并继续回退读取健康 v1 WAL', () => {
    const originalWarn = console.warn
    console.warn = () => undefined
    const legacy = makeLegacyDocument('legacy-fallback', 1175)
    localStorage.setItem(RECOVERY_STORAGE_KEY_V1, JSON.stringify(legacy))
    localStorage.setItem(RECOVERY_STORAGE_KEY_V2, '{not-json')

    try {
      expect(readEditorDocumentRecovery()).toEqual(
        migratedLegacyDocument(legacy),
      )
      expect(localStorage.getItem(RECOVERY_STORAGE_KEY_V2)).toBeNull()
    } finally {
      console.warn = originalWarn
    }
  })

  it('清理已提交 v2 WAL 时一并删除同文档的更旧 v1 WAL', () => {
    const staleLegacy = makeLegacyDocument('draft-a', 1190)
    const recovery = makeDocument('draft-a', 1200, '已提交')
    localStorage.setItem(RECOVERY_STORAGE_KEY_V1, JSON.stringify(staleLegacy))
    localStorage.setItem(RECOVERY_STORAGE_KEY_V2, JSON.stringify(recovery))

    clearEditorDocumentRecovery('draft-a', recovery.recoveryId)

    expect(localStorage.getItem(RECOVERY_STORAGE_KEY_V2)).toBeNull()
    expect(localStorage.getItem(RECOVERY_STORAGE_KEY_V1)).toBeNull()
    expect(readEditorDocumentRecovery()).toBeNull()
  })

  it('旧 IDB 写入完成不会清掉同一毫秒产生的新恢复日志', () => {
    const oldSnapshot = makeDocument('draft-a', 1200, '旧内容')
    const newSnapshot = {
      ...makeDocument('draft-a', 1200, '新内容'),
      recoveryId: 'new-recovery-id',
    }
    expect(writeEditorDocumentRecovery(newSnapshot)).toBe(true)

    clearEditorDocumentRecovery('draft-a', oldSnapshot.recoveryId)
    expect(readEditorDocumentRecovery()).toEqual(newSnapshot)
  })

  it('明确删除草稿时丢弃该文档的未提交恢复日志', () => {
    const recovery = makeDocument('draft-a', 1300, '待删除')
    const legacy = makeLegacyDocument('draft-a', 1200)
    localStorage.setItem(RECOVERY_STORAGE_KEY_V1, JSON.stringify(legacy))
    localStorage.setItem(RECOVERY_STORAGE_KEY_V2, JSON.stringify(recovery))
    discardEditorDocumentRecovery('other-draft')
    expect(readEditorDocumentRecovery()).toEqual(recovery)
    discardEditorDocumentRecovery('draft-a')
    expect(localStorage.getItem(RECOVERY_STORAGE_KEY_V1)).toBeNull()
    expect(localStorage.getItem(RECOVERY_STORAGE_KEY_V2)).toBeNull()
    expect(readEditorDocumentRecovery()).toBeNull()
  })

  it('损坏恢复日志不会阻断正式草稿读取', () => {
    const originalWarn = console.warn
    console.warn = () => undefined
    localStorage.setItem(
      RECOVERY_STORAGE_KEY_V2,
      '{not-json',
    )
    try {
      expect(readEditorDocumentRecovery()).toBeNull()
      expect(localStorage.getItem(RECOVERY_STORAGE_KEY_V2)).toBeNull()
    } finally {
      console.warn = originalWarn
    }
  })
})

function createMemoryBackend(initialDocuments: unknown[] = []): DocumentStoreBackend {
  const documents = new Map<string, unknown>()
  for (const document of initialDocuments) {
    if (
      document &&
      typeof document === 'object' &&
      typeof (document as { id?: unknown }).id === 'string'
    ) {
      documents.set(
        (document as { id: string }).id,
        structuredClone(document),
      )
    }
  }
  let activeId: string | null = null

  return {
    async put(document, makeActive) {
      documents.set(document.id, structuredClone(document))
      if (makeActive) activeId = document.id
    },
    async list() {
      return [...documents.values()].map((document) => structuredClone(document))
    },
    async get(id) {
      const document = documents.get(id)
      return document === undefined ? undefined : structuredClone(document)
    },
    async getActiveId() {
      return activeId
    },
    async setActiveId(id) {
      activeId = id
    },
    async delete(id) {
      documents.delete(id)
      if (activeId === id) activeId = null
    },
  }
}
