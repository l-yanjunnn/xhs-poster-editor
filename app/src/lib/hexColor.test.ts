import { describe, expect, it } from 'vitest'
import {
  isNormalizedHexColor,
  isValidHexColor,
  normalizeHexColor,
} from './hexColor'

describe('hexColor', () => {
  it('normalizes a complete six-digit color to uppercase', () => {
    expect(normalizeHexColor('#6d136c')).toBe('#6D136C')
    expect(normalizeHexColor('#A0b1C2')).toBe('#A0B1C2')
  })

  it.each([
    '#ABC',
    '#12345678',
    '6D136C',
    ' #6D136C',
    '#6D136C ',
    '#GG0000',
    'rgb(109, 19, 108)',
    'var(--danger)',
    '',
    null,
    undefined,
    0x6d136c,
  ])('rejects non-six-digit hex input: %s', (value) => {
    expect(normalizeHexColor(value)).toBeNull()
    expect(isValidHexColor(value)).toBe(false)
  })

  it('distinguishes acceptable lowercase input from canonical storage form', () => {
    expect(isValidHexColor('#6d136c')).toBe(true)
    expect(isNormalizedHexColor('#6d136c')).toBe(false)
    expect(isNormalizedHexColor('#6D136C')).toBe(true)
  })
})
