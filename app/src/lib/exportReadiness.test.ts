import { describe, expect, it } from 'vitest'
import {
  assertExportReadiness,
  checkExportReadiness,
  ExportReadinessError,
} from './exportReadiness'

function imageWithState(complete: boolean, naturalWidth: number) {
  const image = document.createElement('img')
  Object.defineProperties(image, {
    complete: { configurable: true, value: complete },
    naturalWidth: { configurable: true, value: naturalWidth },
  })
  return image
}

describe('export readiness', () => {
  it('通过已经完成解码的图片', async () => {
    const page = document.createElement('div')
    page.appendChild(imageWithState(true, 640))
    await expect(checkExportReadiness([page])).resolves.toEqual([])
  })

  it('报告已失败的图片并带可读名称', async () => {
    const page = document.createElement('div')
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
    page.appendChild(imageWithState(true, 0))
    await expect(assertExportReadiness([page])).rejects.toBeInstanceOf(
      ExportReadinessError,
    )
  })
})
