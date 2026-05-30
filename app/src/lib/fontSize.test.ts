import { describe, it, expect } from 'vitest'
import { computeFontSizeVars, FS_RATIOS } from './fontSize'

describe('computeFontSizeVars', () => {
  it('bodyPx=40 时输出基准字号', () => {
    expect(computeFontSizeVars(40)).toEqual({
      '--fs-h1': '90px',
      '--fs-h2': '56px',
      '--fs-h3': '44px',
      '--fs-body': '40px',
      '--fs-quote': '40px',
      '--fs-code': '34px',
    })
  })

  it('bodyPx=32 时所有字号按比例缩小', () => {
    const vars = computeFontSizeVars(32)
    expect(vars['--fs-body']).toBe('32px')
    expect(vars['--fs-h1']).toBe(`${Math.round(32 * (90 / 40))}px`)
    expect(vars['--fs-h2']).toBe(`${Math.round(32 * (56 / 40))}px`)
  })

  it('bodyPx=48 时所有字号按比例放大', () => {
    const vars = computeFontSizeVars(48)
    expect(vars['--fs-body']).toBe('48px')
    expect(vars['--fs-h1']).toBe(`${Math.round(48 * (90 / 40))}px`)
  })

  it('输出包含 FS_RATIOS 全部字段', () => {
    const vars = computeFontSizeVars(40)
    for (const key of Object.keys(FS_RATIOS)) {
      expect(vars).toHaveProperty(key)
    }
  })
})
