import { describe, it, expect } from 'vitest'
import { fileNameToFamily } from './fontStore'

describe('fileNameToFamily', () => {
  it('剥离 .ttf 后缀', () => {
    expect(fileNameToFamily('MyFont.ttf')).toBe('MyFont')
  })
  it('剥离 .otf 后缀', () => {
    expect(fileNameToFamily('MyFont.otf')).toBe('MyFont')
  })
  it('剥离 .woff 后缀', () => {
    expect(fileNameToFamily('MyFont.woff')).toBe('MyFont')
  })
  it('剥离 .woff2 后缀', () => {
    expect(fileNameToFamily('MyFont.woff2')).toBe('MyFont')
  })
  it('剥离 .ttc 后缀', () => {
    expect(fileNameToFamily('MyFont.ttc')).toBe('MyFont')
  })
  it('大小写不敏感', () => {
    expect(fileNameToFamily('MyFont.TTF')).toBe('MyFont')
    expect(fileNameToFamily('MyFont.Woff2')).toBe('MyFont')
  })
  it('trim 前后空白', () => {
    expect(fileNameToFamily('  MyFont.ttf  ')).toBe('MyFont')
  })
  it('文件名带点但非已知后缀时不剥离', () => {
    expect(fileNameToFamily('My.Font.png')).toBe('My.Font.png')
  })
  it('中文字体名保留', () => {
    expect(fileNameToFamily('思源黑体.otf')).toBe('思源黑体')
  })
  it('多个已知后缀只剥离最后一个', () => {
    expect(fileNameToFamily('Font.ttf.otf')).toBe('Font.ttf')
  })
})
