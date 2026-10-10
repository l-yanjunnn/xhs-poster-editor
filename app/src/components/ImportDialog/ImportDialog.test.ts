import { act, createElement, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImportDialog } from './ImportDialog'

type Props = ComponentProps<typeof ImportDialog>
type ReactActGlobal = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
;(globalThis as ReactActGlobal).IS_REACT_ACT_ENVIRONMENT = true

const mounted: Array<{ host: HTMLDivElement; root: Root }> = []

async function mountDialog() {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  mounted.push({ host, root })
  const onGenerate = vi.fn<Props['onGenerate']>().mockResolvedValue(undefined)
  const onOpenChange = vi.fn<Props['onOpenChange']>()
  const render = async (open = true) => {
    await act(async () => {
      root.render(createElement(ImportDialog, { open, onGenerate, onOpenChange }))
    })
  }
  await render()
  return { onGenerate, onOpenChange, render }
}

function dialog(): HTMLElement {
  const element = document.body.querySelector<HTMLElement>('[data-slot="dialog-content"]')
  if (!element) throw new Error('找不到导入对话框')
  return element
}

function button(label: string): HTMLButtonElement {
  const found = Array.from(dialog().querySelectorAll<HTMLButtonElement>('button'))
    .find((element) => element.textContent?.includes(label))
  if (!found) throw new Error(`找不到按钮：${label}`)
  return found
}

async function click(label: string) {
  await act(async () => button(label).click())
}

async function paste(source: string) {
  await click('粘贴全文')
  const input = dialog().querySelector('textarea')!
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
  await act(async () => {
    setter.call(input, source)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await click('解析并预览')
}

afterEach(async () => {
  for (const item of mounted.splice(0)) {
    await act(async () => item.root.unmount())
    item.host.remove()
  }
  vi.restoreAllMocks()
})

describe('ImportDialog account example transaction', () => {
  it('previews the pure-title example without generating, then confirms a new draft with its theme', async () => {
    const item = await mountDialog()

    await click('百草路撸猫战神 · 排版示例')

    expect(item.onGenerate).not.toHaveBeenCalled()
    expect(item.onOpenChange).not.toHaveBeenCalled()
    expect(dialog().textContent).toContain('新草稿使用「百草路撸猫战神」主题')
    expect(dialog().querySelector('input[name="import-separator-mode"]')).toBeNull()
    const subtitle = Array.from(dialog().querySelectorAll('dt'))
      .find((element) => element.textContent === '封面副标题')
    expect(subtitle?.nextElementSibling?.textContent).toBe('无')
    expect(button('生成到新草稿').disabled).toBe(false)

    await click('生成到新草稿')

    expect(item.onGenerate).toHaveBeenCalledOnce()
    const [analysis, preset] = item.onGenerate.mock.calls[0]
    expect(preset?.id).toBe('builtin-elegant')
    expect(analysis.pageCount).toBe(3)
    expect(analysis.decisionResolved).toBe(true)
    const cover = new DOMParser().parseFromString(analysis.pages[0].html, 'text/html').body
    expect(cover.children).toHaveLength(1)
    expect(cover.firstElementChild?.tagName).toBe('H1')
    expect(cover.querySelectorAll('h1 > br')).toHaveLength(1)
    expect(cover.textContent).toBe('普通人可以完整。')
    expect(analysis.pages.slice(1).every((page) => page.html.includes('<p>'))).toBe(true)
    expect(item.onOpenChange).toHaveBeenCalledWith(false)
  })

  it('clears the example theme when choosing a pasted manuscript and keeps its separator decision', async () => {
    const item = await mountDialog()
    await click('百草路撸猫战神 · 排版示例')
    await click('重新选择')
    await paste('# 我的真实标题\n\n---\n\n这是自己的正文。')

    expect(item.onGenerate).not.toHaveBeenCalled()
    expect(dialog().textContent).not.toContain('新草稿使用「百草路撸猫战神」主题')
    expect(button('生成到新草稿').disabled).toBe(true)
    const pageChoice = Array.from(dialog().querySelectorAll('label'))
      .find((element) => element.textContent?.includes('作为分页'))!
    await act(async () => pageChoice.querySelector<HTMLInputElement>('input')!.click())
    expect(button('生成到新草稿').disabled).toBe(false)

    await click('生成到新草稿')

    expect(item.onGenerate).toHaveBeenCalledOnce()
    const [analysis, preset] = item.onGenerate.mock.calls[0]
    expect(preset).toBeUndefined()
    expect(analysis.sourceName).toBe('粘贴的文稿')
    expect(analysis.contentHtml).toBe('<h1>我的真实标题</h1><hr class="page-break"><p>这是自己的正文。</p>')
  })

  it('retains the example and theme after a failed generation so retry commits the same draft content', async () => {
    const item = await mountDialog()
    let rejectGeneration!: (error: Error) => void
    item.onGenerate.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => {
      rejectGeneration = reject
    }))
    await click('百草路撸猫战神 · 排版示例')
    await click('生成到新草稿')

    expect(button('正在生成新草稿').disabled).toBe(true)
    expect(button('重新选择').disabled).toBe(true)
    expect(button('取消').disabled).toBe(true)
    await click('正在生成新草稿')
    expect(item.onGenerate).toHaveBeenCalledOnce()

    await act(async () => rejectGeneration(new Error('当前草稿保存失败')))

    expect(dialog().querySelector('[role="alert"]')?.textContent).toContain('当前草稿保存失败')
    expect(dialog().textContent).toContain('新草稿使用「百草路撸猫战神」主题')
    expect(item.onOpenChange).not.toHaveBeenCalled()
    expect(button('生成到新草稿').disabled).toBe(false)
    await click('生成到新草稿')

    expect(item.onGenerate).toHaveBeenCalledTimes(2)
    expect(item.onGenerate.mock.calls[1]).toEqual(item.onGenerate.mock.calls[0])
    expect(item.onGenerate.mock.calls[1][1]?.id).toBe('builtin-elegant')
    expect(dialog().querySelector('[role="alert"]')).toBeNull()
    expect(item.onOpenChange).toHaveBeenCalledWith(false)
  })

  it('cancels a preview without generating and starts the next import without an example theme', async () => {
    const item = await mountDialog()
    await click('百草路撸猫战神 · 排版示例')
    await click('取消')
    expect(item.onOpenChange).toHaveBeenCalledWith(false)
    expect(item.onGenerate).not.toHaveBeenCalled()

    await item.render(false)
    await item.render(true)
    await paste('# 重新开始\n\n保留自己的文稿。')
    await click('生成到新草稿')

    expect(item.onGenerate).toHaveBeenCalledOnce()
    expect(item.onGenerate.mock.calls[0][1]).toBeUndefined()
    expect(item.onGenerate.mock.calls[0][0].cover.title).toBe('重新开始')
  })
})
