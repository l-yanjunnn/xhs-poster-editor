import { describe, expect, it } from 'vitest'
import {
  normalizeImageAlign,
  normalizeImageDocument,
  normalizeImageWidth,
  snapImageAlignment,
  snapImageWidth,
} from './imageModel'

describe('imageModel', () => {
  it('normalizes legacy and invalid image attributes without changing other attrs', () => {
    expect(normalizeImageWidth(null)).toBeNull()
    expect(normalizeImageWidth('5%')).toBe('10%')
    expect(normalizeImageWidth('66.04%')).toBe('66%')
    expect(normalizeImageWidth('500px')).toBeNull()
    expect(normalizeImageAlign(undefined)).toBe('left')
    expect(normalizeImageAlign('center')).toBe('center')
  })

  it('assigns stable unique ids and preserves pagination/content order', () => {
    const ids = ['new-a', 'new-b', 'new-c']
    const doc = {
      type: 'doc',
      content: [
        { type: 'image', attrs: { src: 'a', imageId: 'same', width: '50%' } },
        { type: 'horizontalRule' },
        { type: 'image', attrs: { src: 'b', imageId: 'same', align: 'right' } },
        { type: 'image', attrs: { src: 'c', imageId: null, width: '500px' } },
      ],
    }

    const out = normalizeImageDocument(doc, () => ids.shift()!)
    expect(out.content.map((node) => node.type)).toEqual([
      'image',
      'horizontalRule',
      'image',
      'image',
    ])
    expect(out.content[0]!.attrs).toMatchObject({ imageId: 'same', align: 'left', width: '50%' })
    expect(out.content[2]!.attrs).toMatchObject({ imageId: 'new-a', align: 'right', width: null })
    expect(out.content[3]!.attrs).toMatchObject({ imageId: 'new-b', align: 'left', width: null })
    expect(doc.content[2]!.attrs!.imageId).toBe('same')
  })

  it('snaps width to semantic targets unless Alt bypasses it', () => {
    expect(snapImageWidth(64.2)).toEqual({ width: 66, snappedTo: 66 })
    expect(snapImageWidth(64.2, { altKey: true })).toEqual({
      width: 64.2,
      snappedTo: null,
    })
    expect(snapImageWidth(3).width).toBe(10)
    expect(snapImageWidth(140).width).toBe(100)
  })

  it('only commits semantic alignment inside the snap threshold', () => {
    const targetLefts = { left: 80, center: 320, right: 560 }
    expect(snapImageAlignment(329, targetLefts)).toMatchObject({
      align: 'center',
      left: 320,
    })
    expect(snapImageAlignment(410, targetLefts).align).toBeNull()
    expect(snapImageAlignment(82, targetLefts, { altKey: true }).align).toBeNull()
  })
})
