import { act, createElement, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExportDialog } from './ExportDialog/ExportDialog'
import { ImportDialog } from './ImportDialog/ImportDialog'

type ReactActGlobal = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
;(globalThis as ReactActGlobal).IS_REACT_ACT_ENVIRONMENT = true

const mounted: Array<{ host: HTMLDivElement; root: Root }> = []

afterEach(async () => {
  for (const item of mounted.splice(0)) {
    await act(async () => item.root.unmount())
    item.host.remove()
  }
})

async function mountDialog(element: ReactElement): Promise<HTMLElement> {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  mounted.push({ host, root })

  await act(async () => root.render(element))

  const content = document.body.querySelector<HTMLElement>(
    '[data-slot="dialog-content"]',
  )
  if (!content) throw new Error('弹窗未渲染')
  return content
}

function expectFixedHeaderAndFooterLayout(content: HTMLElement) {
  expect(content.classList).toContain(
    'grid-rows-[auto_minmax(0,1fr)_auto]',
  )
  expect(content.classList).toContain('max-h-[calc(100dvh-56px)]')
  expect(content.classList).not.toContain('max-h-[calc(100vh-56px)]')

  const header = content.querySelector<HTMLElement>(
    ':scope > [data-slot="dialog-header"]',
  )
  const footer = content.querySelector<HTMLElement>(
    ':scope > [data-slot="dialog-footer"]',
  )
  const scrollBody = header?.nextElementSibling

  expect(header).not.toBeNull()
  expect(scrollBody).toBeInstanceOf(HTMLElement)
  expect(scrollBody?.classList).toContain('min-h-0')
  expect(scrollBody?.classList).toContain('overflow-y-auto')
  expect(scrollBody?.nextElementSibling).toBe(footer)
}

describe('低视口弹窗布局契约', () => {
  it('导入弹窗固定头尾，只收缩中间滚动区', async () => {
    const content = await mountDialog(
      createElement(ImportDialog, {
        open: true,
        onOpenChange: vi.fn(),
        onGenerate: vi.fn(async () => undefined),
      }),
    )

    expectFixedHeaderAndFooterLayout(content)
  })

  it('导出弹窗与导入弹窗保持同样的低视口契约', async () => {
    const content = await mountDialog(
      createElement(ExportDialog, {
        open: true,
        onOpenChange: vi.fn(),
        defaultFilename: '测试文稿',
        pageCount: 19,
        onExport: vi.fn(async () => undefined),
      }),
    )

    expectFixedHeaderAndFooterLayout(content)
  })
})
