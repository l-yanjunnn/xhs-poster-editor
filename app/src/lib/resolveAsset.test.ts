import { describe, expect, it } from 'vitest'
import {
  collectContentImageAssetIds,
  collectResolvedContentImageSources,
  mapContentImages,
  mapContentImagesWithReport,
} from './resolveAsset'

const doc = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'hello' }] },
    {
      type: 'image',
      attrs: {
        src: 'blob:https://x/dead',
        assetId: 'user-image-1',
        imageId: 'image-1',
        width: '50%',
        align: 'center',
      },
    },
    {
      type: 'blockquote',
      content: [
        // 嵌套的图片也要被处理
        { type: 'image', attrs: { src: 'blob:https://x/dead2', assetId: 'user-image-2' } },
      ],
    },
    // 无 assetId 的图片（外链/历史数据）不动
    { type: 'image', attrs: { src: 'https://example.com/a.png', assetId: null } },
  ],
}

describe('mapContentImages', () => {
  it('按 assetId 替换 src，含嵌套节点', async () => {
    const out = await mapContentImages(doc, async (id) => `resolved:${id}`)
    const imgs = collectImages(out)
    expect(imgs[0].attrs?.src).toBe('resolved:user-image-1')
    expect(imgs[0].attrs?.width).toBe('50%') // 其他 attrs 保留
    expect(imgs[0].attrs?.imageId).toBe('image-1')
    expect(imgs[0].attrs?.align).toBe('center')
    expect(imgs[1].attrs?.src).toBe('resolved:user-image-2')
    expect(imgs[2].attrs?.src).toBe('https://example.com/a.png')
  })

  it('resolve 失败（素材已删）保留原 src', async () => {
    const out = await mapContentImages(doc, async () => null)
    const imgs = collectImages(out)
    expect(imgs[0].attrs?.src).toBe('blob:https://x/dead')
  })

  it('不修改原对象（深拷贝语义）', async () => {
    await mapContentImages(doc, async () => 'changed')
    const imgs = collectImages(doc)
    expect(imgs[0].attrs?.src).toBe('blob:https://x/dead')
  })

  it('空 doc 与无图片 doc 原样通过', async () => {
    const plain = { type: 'doc', content: [{ type: 'paragraph' }] }
    const out = await mapContentImages(plain, async () => 'x')
    expect(out).toEqual(plain)
  })

  it('显式报告缺失素材并去重，仍保留原文档属性', async () => {
    const out = await mapContentImagesWithReport(doc, async (id) =>
      id === 'user-image-2' ? 'resolved:nested' : null,
    )
    expect(out.missingAssetIds).toEqual(['user-image-1'])
    const imgs = collectImages(out.document)
    expect(imgs[0].attrs).toMatchObject({
      src: 'blob:https://x/dead',
      imageId: 'image-1',
      width: '50%',
      align: 'center',
    })
    expect(imgs[1].attrs?.src).toBe('resolved:nested')
  })

  it('按 imageId 收集可无历史同步回编辑器的图片源', async () => {
    const out = await mapContentImages(doc, async (id) => `resolved:${id}`)
    expect(collectResolvedContentImageSources(out)).toEqual([
      { imageId: 'image-1', src: 'resolved:user-image-1' },
    ])
  })

  it('收集当前文档仍引用的正文素材 id 并去重', () => {
    expect(collectContentImageAssetIds(doc)).toEqual([
      'user-image-1',
      'user-image-2',
    ])
  })
})

// 深度收集所有 image 节点（按文档顺序）
interface N {
  type?: string
  attrs?: Record<string, unknown>
  content?: N[]
}
function collectImages(node: N): N[] {
  const acc: N[] = []
  if (node.type === 'image') acc.push(node)
  for (const c of node.content ?? []) acc.push(...collectImages(c))
  return acc
}
