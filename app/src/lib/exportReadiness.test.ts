import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  assertExportReadiness,
  checkExportReadiness,
  ExportReadinessError,
} from './exportReadiness'

const initialFontsDescriptor = Object.getOwnPropertyDescriptor(
  document,
  'fonts',
)

afterEach(() => {
  vi.restoreAllMocks()
  if (initialFontsDescriptor) {
    Object.defineProperty(document, 'fonts', initialFontsDescriptor)
  } else Reflect.deleteProperty(document, 'fonts')
})

function imageWithState(complete: boolean, naturalWidth: number) {
  const image = document.createElement('img')
  Object.defineProperties(image, {
    complete: { configurable: true, value: complete },
    naturalWidth: { configurable: true, value: naturalWidth },
  })
  return image
}

function markLayoutReady(page: HTMLElement) {
  page.dataset.layoutState = 'ready'
  page.dataset.layoutIssueCount = '0'
  page.dataset.layoutSnapshot = 'test-snapshot'
  page.dataset.layoutSnapshotPhase = 'sealed'
}

describe('export readiness', () => {
  it('通过已经完成解码的图片', async () => {
    const page = document.createElement('div')
    markLayoutReady(page)
    page.appendChild(imageWithState(true, 640))
    await expect(checkExportReadiness([page])).resolves.toEqual([])
  })

  it('报告已失败的图片并带可读名称', async () => {
    const page = document.createElement('div')
    markLayoutReady(page)
    const image = imageWithState(true, 0)
    image.alt = '封面插图'
    page.appendChild(image)
    const issues = await checkExportReadiness([page])
    expect(issues).toEqual([
      expect.objectContaining({ kind: 'image', label: '封面插图' }),
    ])
  })

  it('断言失败时抛出结构化错误，供界面提供重试或继续', async () => {
    const page = document.createElement('div')
    markLayoutReady(page)
    page.appendChild(imageWithState(true, 0))
    await expect(assertExportReadiness([page])).rejects.toBeInstanceOf(
      ExportReadinessError,
    )
  })

  it('明确报告布局未就绪和精确字体空结果', async () => {
    const load = vi.fn(async () => [])
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { ready: Promise.resolve(), load },
    })
    const page = document.createElement('div')
    page.dataset.layoutState = 'font-error'
    page.dataset.layoutSnapshot = 'stale-font-snapshot'
    page.dataset.pageNumber = '5'
    page.dataset.layoutFontIssues = JSON.stringify([
      { message: '字体 Noto Sans SC 700 加载失败' },
    ])
    page.dataset.layoutFontRequest = JSON.stringify([
      {
        family: 'Missing Layout Font',
        weight: '700',
        style: 'normal',
        sample: '中文2026',
      },
    ])

    const issues = await checkExportReadiness([page])

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'layout',
          label: '第 5 页排版',
          message: '字体 Noto Sans SC 700 加载失败',
        }),
        expect.objectContaining({
          kind: 'font',
          label: 'Missing Layout Font (700)',
          message: expect.stringContaining('未返回任何已加载字面'),
        }),
      ]),
    )
    expect(load).toHaveBeenCalledWith(
      'normal 700 16px "Missing Layout Font"',
      '中文2026',
    )
  })

  it('把缺失的确定性快照作为阻断性布局问题', async () => {
    const page = document.createElement('div')
    const issues = await checkExportReadiness([page])

    expect(issues).toContainEqual(
      expect.objectContaining({
        kind: 'layout',
        severity: 'blocking',
        message: '确定性行布局快照尚未生成',
      }),
    )
  })

  it('把已封存的 warning-only 页面报告为可确认的警告并带段落定位', async () => {
    const page = document.createElement('div')
    page.dataset.layoutState = 'ready-with-warnings'
    page.dataset.layoutIssueCount = '1'
    page.dataset.layoutSnapshot = 'warning-snapshot'
    page.dataset.layoutSnapshotPhase = 'sealed'
    page.dataset.pageNumber = '19'
    page.dataset.layoutIssues = JSON.stringify([
      {
        code: 'unsatisfied-line',
        blockIndex: 1,
        blockText: '这里面存在着许多看似道不清、言不明的道理。',
        message: '第 1 行在字距/标点上限内无法排入版心',
      },
    ])

    const issues = await checkExportReadiness([page])

    expect(issues).toEqual([
      expect.objectContaining({
        kind: 'layout',
        severity: 'warning',
        label: '第 19 页排版',
        pageNumber: 19,
        code: 'unsatisfied-line',
        blockText: '这里面存在着许多看似道不清、言不明的道理。',
        message:
          '第 2 段「这里面存在着许多看似道不清、言不明的道理。」：第 1 行在字距/标点上限内无法排入版心',
      }),
    ])
    // 未确认时仍然拒绝；用户确认 allowWarnings 后放行。
    await expect(assertExportReadiness([page])).rejects.toBeInstanceOf(
      ExportReadinessError,
    )
    await expect(
      assertExportReadiness([page], { allowWarnings: true }),
    ).resolves.toBeUndefined()
  })

  it('未知 issue code 默认硬阻断，allowWarnings 也不能放行', async () => {
    const page = document.createElement('div')
    page.dataset.layoutState = 'ready-with-warnings'
    page.dataset.layoutIssueCount = '1'
    page.dataset.layoutSnapshot = 'unknown-code-snapshot'
    page.dataset.layoutSnapshotPhase = 'sealed'
    page.dataset.layoutIssues = JSON.stringify([
      {
        code: 'future-unknown-check',
        blockIndex: 0,
        blockText: '未知问题段落',
        message: '未来新增的检查失败',
      },
    ])

    const issues = await checkExportReadiness([page])

    expect(issues).toEqual([
      expect.objectContaining({
        kind: 'layout',
        severity: 'blocking',
      }),
    ])
    await expect(
      assertExportReadiness([page], { allowWarnings: true }),
    ).rejects.toBeInstanceOf(ExportReadinessError)
  })

  it('warning 状态但快照未封存时仍是硬阻断', async () => {
    const page = document.createElement('div')
    page.dataset.layoutState = 'ready-with-warnings'
    page.dataset.layoutIssueCount = '1'
    page.dataset.layoutSnapshot = 'unsealed-warning-snapshot'
    page.dataset.layoutSnapshotPhase = 'layout'
    page.dataset.layoutIssues = JSON.stringify([
      {
        code: 'unsatisfied-line',
        blockIndex: 0,
        blockText: '段落',
        message: '第 1 行在字距/标点上限内无法排入版心',
      },
    ])

    const issues = await checkExportReadiness([page])

    expect(issues).toEqual([
      expect.objectContaining({ kind: 'layout', severity: 'blocking' }),
    ])
  })
})
