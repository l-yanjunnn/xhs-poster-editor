import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  clearEditorDocumentRecovery,
  deleteEditorDocument,
  EDITOR_DOCUMENT_SCHEMA_VERSION,
  getActiveDocumentId,
  getActiveEditorDocument,
  getEditorDocument,
  listEditorDocuments,
  putEditorDocument,
  readEditorDocumentRecovery,
  setActiveDocumentId,
  setDocumentStoreBackendForTests,
  writeEditorDocumentRecovery,
  discardEditorDocumentRecovery,
  type DocumentStoreBackend,
  type EditorDocumentV1,
} from './documentStore'

function makeDocument(
  id: string,
  updatedAt: number,
  title = id,
): EditorDocumentV1 {
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

  it('拒绝未知 schema 和缺失样式字段，避免损坏数据覆盖好草稿', async () => {
    const future = { ...makeDocument('future', 500), schemaVersion: 2 }
    await expect(
      putEditorDocument(future as unknown as EditorDocumentV1),
    ).rejects.toThrow('暂不支持草稿版本')

    const incomplete = makeDocument('incomplete', 600)
    const incompleteStyle = { ...incomplete.style } as Partial<
      EditorDocumentV1['style']
    >
    delete incompleteStyle.fontBody
    await expect(
      putEditorDocument({
        ...incomplete,
        style: incompleteStyle,
      } as unknown as EditorDocumentV1),
    ).rejects.toThrow('样式字段不完整')
  })

  it('拒绝损坏的样式枚举和不合理字号', async () => {
    const badDensity = makeDocument('bad-density', 700)
    await expect(
      putEditorDocument({
        ...badDensity,
        style: { ...badDensity.style, density: 'broken-density' },
      } as unknown as EditorDocumentV1),
    ).rejects.toThrow('样式枚举值无效')

    const badOverlay = makeDocument('bad-overlay', 800)
    await expect(
      putEditorDocument({
        ...badOverlay,
        style: { ...badOverlay.style, overlay: 'transparent-ish' },
      } as unknown as EditorDocumentV1),
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
    writeEditorDocumentRecovery(recovery)
    discardEditorDocumentRecovery('other-draft')
    expect(readEditorDocumentRecovery()).toEqual(recovery)
    discardEditorDocumentRecovery('draft-a')
    expect(readEditorDocumentRecovery()).toBeNull()
  })

  it('损坏恢复日志不会阻断正式草稿读取', () => {
    const originalWarn = console.warn
    console.warn = () => undefined
    localStorage.setItem(
      'xhs-poster-active-document-recovery-v1',
      '{not-json',
    )
    try {
      expect(readEditorDocumentRecovery()).toBeNull()
      expect(localStorage.getItem('xhs-poster-active-document-recovery-v1')).toBeNull()
    } finally {
      console.warn = originalWarn
    }
  })
})

function createMemoryBackend(): DocumentStoreBackend {
  const documents = new Map<string, EditorDocumentV1>()
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
      return document ? structuredClone(document) : undefined
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
