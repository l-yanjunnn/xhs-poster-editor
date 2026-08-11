// 内置素材：从 source/ 复制到 public/builtin-assets/，Vite 直接以 URL 引用。
// id 沿用 editor.html 的命名，便于 THEMES 中按 id 引用。
// Step 4 接入素材库后，用户上传的素材也用同样的 Asset 形态。

export interface Asset {
  id: string
  name: string
  src: string
  builtin: boolean
  /** 仅供内置主题按 stable ID 解析，不暴露为普通素材库选项。 */
  themeOnly?: boolean
}

export const BUILTIN_BACKGROUNDS: Asset[] = [
  {
    id: 'builtin-bg-xuan',
    name: '宣纸',
    src: '/builtin-assets/bg-xuan-paper.png',
    builtin: true,
  },
]

export const BUILTIN_THEME_BACKGROUNDS: Asset[] = [
  {
    id: 'builtin-bg-public-exam-landscape-cover-v1',
    name: '公考·山水卷首图',
    src: '/builtin-assets/bg-public-exam-landscape-cover-v1.png',
    builtin: true,
    themeOnly: true,
  },
  {
    id: 'builtin-bg-public-exam-landscape-inner-v1',
    name: '公考·山水卷内页',
    src: '/builtin-assets/bg-public-exam-landscape-inner-v1.png',
    builtin: true,
    themeOnly: true,
  },
]

const RESOLVABLE_BUILTIN_BACKGROUNDS = [
  ...BUILTIN_BACKGROUNDS,
  ...BUILTIN_THEME_BACKGROUNDS,
]

export const BUILTIN_LOGOS: Asset[] = [
  {
    id: 'builtin-logo-cat',
    name: '猫圈',
    src: '/builtin-assets/logo-cat-ring.png',
    builtin: true,
  },
]

// 插入图片的内置素材（暂空，用户上传为主）
export const BUILTIN_IMAGES: Asset[] = []

export function findAssetById(list: Asset[], id: string): Asset | undefined {
  // resolveAsset 与素材库共用 BUILTIN_BACKGROUNDS：前者需要找到
  // 主题专用底图，后者只 map 可见列表。用原始列表身份区分这两种语义。
  const searchableList =
    list === BUILTIN_BACKGROUNDS ? RESOLVABLE_BUILTIN_BACKGROUNDS : list
  return searchableList.find((asset) => asset.id === id)
}
