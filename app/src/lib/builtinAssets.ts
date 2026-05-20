// 内置素材：从 source/ 复制到 public/builtin-assets/，Vite 直接以 URL 引用。
// id 沿用 editor.html 的命名，便于 THEMES 中按 id 引用。
// Step 4 接入素材库后，用户上传的素材也用同样的 Asset 形态。

export interface Asset {
  id: string
  name: string
  src: string
  builtin: boolean
}

export const BUILTIN_BACKGROUNDS: Asset[] = [
  {
    id: 'builtin-bg-xuan',
    name: '宣纸',
    src: '/builtin-assets/bg-xuan-paper.png',
    builtin: true,
  },
]

export const BUILTIN_LOGOS: Asset[] = [
  {
    id: 'builtin-logo-cat',
    name: '猫圈',
    src: '/builtin-assets/logo-cat-ring.png',
    builtin: true,
  },
]

export function findAssetById(list: Asset[], id: string): Asset | undefined {
  return list.find((a) => a.id === id)
}
