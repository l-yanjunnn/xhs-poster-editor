import { describe, expect, it } from 'vitest'

import { fnv1a32Hex, roundToMilliPx } from './stableHash'

// 快照 hash 是「预览=导出」契约核心：把输出位钉死，任何实现改动都必须
// 有意识地更新这里（并接受所有历史快照 ID 失效的后果）。
describe('fnv1a32Hex', () => {
  it('空串等于 FNV offset basis', () => {
    expect(fnv1a32Hex('')).toBe('811c9dc5')
  })

  it('匹配 FNV-1a 32 位标准测试向量', () => {
    expect(fnv1a32Hex('abc')).toBe('1a47e90b')
  })

  it('对 UTF-16 code unit 逐位敏感', () => {
    expect(fnv1a32Hex('排版')).not.toBe(fnv1a32Hex('版排'))
  })
})

describe('roundToMilliPx', () => {
  it('取整到毫像素', () => {
    expect(roundToMilliPx(1.23456)).toBe(1.235)
    expect(roundToMilliPx(888)).toBe(888)
  })

  it('极小负值产生 -0，由 CSS 输出侧负责归一', () => {
    expect(Object.is(roundToMilliPx(-0.0000001), -0)).toBe(true)
  })
})
