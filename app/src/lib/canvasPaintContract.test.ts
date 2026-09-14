import { describe, expect, it } from 'vitest'
import { observeCanvasGlyphPaints } from './canvasPaintContract'

function observe({ clipped = true, allowed = false, missing = false, drift = 0, pixelsPresent = true } = {}) {
  const pixels = new Uint8ClampedArray(20 * 20 * 4)
  if (pixelsPresent) pixels.fill(255)
  const ctx = {
    font: '10px sans-serif', fillText() {},
    getTransform: () => ({ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 }),
    measureText: () => ({ actualBoundingBoxLeft: 0, actualBoundingBoxAscent: 0, actualBoundingBoxRight: 3, actualBoundingBoxDescent: 3 }),
    getImageData: () => ({ data: pixels, width: 20, height: 20 }),
  }
  const canvas = { width: 20, height: 20, getContext: () => ctx } as unknown as HTMLCanvasElement
  const y = clipped ? 1801 : 2
  const observer = observeCanvasGlyphPaints(canvas, [{ text: 'A', x: 2, y, font: ctx.font, samples: [{ x: 0, y: 0, rgb: [255, 255, 255] }] }], { allowCanvasClipping: allowed })
  if (!missing) (ctx.fillText as (...args: unknown[]) => void)('A', 2 + drift, y)
  return observer
}

describe('clipping preserves glyph verification', () => {
  it('rejects off-canvas ink without explicit clipping permission', () => {
    expect(() => observe().verify()).toThrow('超出画布')
  })
  it('allows intentional off-canvas pixels', () => {
    expect(() => observe({ allowed: true }).verify()).not.toThrow()
  })
  it('still rejects missing draw calls and position drift', () => {
    expect(() => observe({ allowed: true, missing: true }).verify()).toThrow('丢字')
    expect(() => observe({ allowed: true, drift: 3 }).verify()).toThrow('偏移')
  })
  it('still checks visible glyph pixels', () => {
    expect(() => observe({ clipped: false, allowed: true, pixelsPresent: false }).verify()).toThrow('像素缺失')
    expect(() => observe({ clipped: false, allowed: true }).verify()).not.toThrow()
  })
})
