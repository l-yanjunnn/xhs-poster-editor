import { describe, expect, it } from 'vitest'
import {
  CANVAS_CONTENT_WIDTH,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  COVER_CROP_BOTTOM,
  COVER_CROP_HEIGHT,
  COVER_CROP_TOP,
  EXPORT_HEIGHT,
  EXPORT_WIDTH,
  PAGE_PADDING_X,
} from './canvas'

describe('canvas geometry', () => {
  it('真实画布为 9:15（等价 3:5）', () => {
    expect(CANVAS_WIDTH).toBe(1080)
    expect(CANVAS_HEIGHT).toBe(1800)
    expect(CANVAS_WIDTH / CANVAS_HEIGHT).toBe(3 / 5)
  })

  it('scale 2 导出为 2160×3600', () => {
    expect(EXPORT_WIDTH).toBe(2160)
    expect(EXPORT_HEIGHT).toBe(3600)
  })

  it('正文内容宽度与左右安全边距一致', () => {
    expect(PAGE_PADDING_X).toBe(80)
    expect(CANVAS_CONTENT_WIDTH).toBe(920)
  })

  it('首图中心 3:4 可见区上下各裁 180px', () => {
    expect(COVER_CROP_HEIGHT).toBe(1440)
    expect(COVER_CROP_TOP).toBe(180)
    expect(COVER_CROP_BOTTOM).toBe(1620)
  })
})
