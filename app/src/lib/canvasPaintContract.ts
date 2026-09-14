import { CANVAS_WIDTH, CANVAS_HEIGHT, EXPORT_SCALE } from './canvas'

interface GlyphPaint { text: string; x: number; y: number; font: string; ink?: number[]; samples?: Array<{ x: number; y: number; rgb: number[] }> }

/** Expected baseline positions come from the verified editing page, not the clone. */
export function captureExpectedGlyphPaints(page: HTMLElement): GlyphPaint[] {
  const rect = page.getBoundingClientRect()
  const scale = rect.width / CANVAS_WIDTH || 1
  const probe = document.createElement('canvas').getContext('2d')
  if (!probe) throw new Error('无法验证 Canvas 字形绘制')
  const masks = new Map<string, NonNullable<GlyphPaint['samples']>>()
  return [...page.querySelectorAll<HTMLElement>('.dtl-atom')]
    .filter(atom => atom.textContent?.trim())
    .map(atom => {
      const block = atom.closest<HTMLElement>('.deterministic-text-layout')!
      const glyph = atom.querySelector<HTMLElement>('.dtl-glyph') ?? atom
      const style = getComputedStyle(glyph)
      probe.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
      const font = probe.font, text = atom.textContent ?? ''
      let opacity = 1
      for (let node: HTMLElement | null = glyph; node; node = node === page ? null : node.parentElement) opacity *= Number(getComputedStyle(node).opacity || 1)
      const key = `${font}|${style.color}|${opacity}|${text}`
      let samples = masks.get(key)
      if (!samples) {
        const metrics = probe.measureText(text)
        const left = Math.floor(-metrics.actualBoundingBoxLeft * EXPORT_SCALE) - 2
        const top = Math.floor(-metrics.actualBoundingBoxAscent * EXPORT_SCALE) - 2
        probe.canvas.width = Math.max(1, Math.ceil(metrics.actualBoundingBoxRight * EXPORT_SCALE) - left + 2)
        probe.canvas.height = Math.max(1, Math.ceil(metrics.actualBoundingBoxDescent * EXPORT_SCALE) - top + 2)
        probe.font = font; probe.fillStyle = style.color; probe.globalAlpha = opacity
        probe.setTransform(EXPORT_SCALE, 0, 0, EXPORT_SCALE, -left, -top)
        probe.fillText(text, 0, 0)
        const pixels = probe.getImageData(0, 0, probe.canvas.width, probe.canvas.height)
        const core: NonNullable<GlyphPaint['samples']> = []
        for (let i = 0; i < pixels.data.length; i += 4) {
          if (pixels.data[i + 3] < 250) continue
          const offset = i / 4
          core.push({ x: offset % pixels.width + left, y: Math.floor(offset / pixels.width) + top, rgb: [...pixels.data.slice(i, i + 3)] })
        }
        const step = Math.max(1, Math.ceil(core.length / 24))
        samples = core.filter((_sample, index) => index % step === 0)
        masks.set(key, samples)
      }
      return {
        samples,
        text, font,
        x: (atom.getBoundingClientRect().left - rect.left) / scale + Number(atom.dataset.layoutGlyphOffset || 0),
        y: (block.getBoundingClientRect().top - rect.top) / scale + Number(atom.dataset.layoutLineTop) + Number(atom.dataset.layoutBaseline),
      }
    })
}

/** Observe only this canvas instance; concurrent exports cannot steal each other's evidence. */
export function observeCanvasGlyphPaints(canvas: HTMLCanvasElement, expected: GlyphPaint[]) {
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法创建导出 Canvas')
  const original = context.fillText
  const actual: GlyphPaint[] = []
  context.fillText = function(text, x, y, maxWidth) {
    const matrix = this.getTransform()
    const metrics = this.measureText(text)
    const corners = [[x - metrics.actualBoundingBoxLeft, y - metrics.actualBoundingBoxAscent], [x + metrics.actualBoundingBoxRight, y + metrics.actualBoundingBoxDescent]]
    const ink = corners.flatMap(([px, py]) => [(matrix.a * px + matrix.c * py + matrix.e) / EXPORT_SCALE, (matrix.b * px + matrix.d * py + matrix.f) / EXPORT_SCALE])
    actual.push({ text, font: this.font, ink,
      x: (matrix.a * x + matrix.c * y + matrix.e) / EXPORT_SCALE,
      y: (matrix.b * x + matrix.d * y + matrix.f) / EXPORT_SCALE,
    })
    if (maxWidth === undefined) original.call(this, text, x, y)
    else original.call(this, text, x, y, maxWidth)
  }
  return {
    restore() { context.fillText = original },
    verify() {
      const remaining = [...actual]
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
      for (const glyph of expected) {
        let match = -1, distance = Infinity
        remaining.forEach((paint, index) => {
          if (paint.text !== glyph.text) return
          const delta = Math.max(Math.abs(paint.x - glyph.x), Math.abs(paint.y - glyph.y))
          if (delta < distance) { match = index; distance = delta }
        })
        if (match < 0) throw new Error(`导出丢字：未绘制「${glyph.text}」`)
        const paint = remaining.splice(match, 1)[0]
        if (distance > 1) throw new Error(`导出字形位置偏移：「${glyph.text}」偏移 ${distance.toFixed(2)} 像素`)
        if (paint.ink && (paint.ink[0] < -1 || paint.ink[1] < -1 || paint.ink[2] > CANVAS_WIDTH + 1 || paint.ink[3] > CANVAS_HEIGHT + 1)) throw new Error(`导出字形墨迹超出画布：「${glyph.text}」会被裁切`)
        if (glyph.samples?.length) {
          const matching = glyph.samples.filter(sample => {
            const x = Math.round(glyph.x * EXPORT_SCALE + sample.x), y = Math.round(glyph.y * EXPORT_SCALE + sample.y)
            for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) {
              const px = x + dx, py = y + dy
              if (px < 0 || py < 0 || px >= pixels.width || py >= pixels.height) continue
              const index = (py * pixels.width + px) * 4
              if (pixels.data[index + 3] > 240 && sample.rgb.every((channel, i) => Math.abs(channel - pixels.data[index + i]) <= 24)) return true
            }
            return false
          }).length
          if (matching / glyph.samples.length < 0.95) throw new Error(`导出字形像素缺失或被遮挡：「${glyph.text}」核心墨迹 ${matching}/${glyph.samples.length}，请检查该页后重试`)
        }
        if (paint.font !== glyph.font) throw new Error(`导出实际绘制字体不一致：「${glyph.text}」${paint.font} / ${glyph.font}`)
      }
    },
  }
}
