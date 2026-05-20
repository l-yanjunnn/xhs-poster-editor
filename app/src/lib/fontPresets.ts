// 字体下拉预设。跨平台标记沿用 editor.html 的约定。
// 「跨平台 ✓」= local() 优先，CDN webfont 作回退；「跨平台 ✗」= 仅 macOS 系统字，Windows 必然回退到 fallback。

export interface FontOption {
  value: string // 完整的 font-family stack
  label: string
  group: string
  crossPlatform: boolean
}

export const DISPLAY_FONTS: FontOption[] = [
  {
    value: '"Noto Serif SC", "Source Han Serif SC", "Songti SC", serif',
    label: '思源宋体',
    group: '经典宋黑',
    crossPlatform: true,
  },
  {
    value: '"Noto Sans SC", "Source Han Sans SC", "PingFang SC", sans-serif',
    label: '思源黑体',
    group: '经典宋黑',
    crossPlatform: true,
  },
  {
    value: '"LXGW WenKai", serif',
    label: '霞鹜文楷',
    group: '人文感',
    crossPlatform: true,
  },
  {
    value: '"ZCOOL XiaoWei", "Noto Serif SC", serif',
    label: '站酷小薇',
    group: '设计感',
    crossPlatform: true,
  },
  {
    value: '"ZCOOL QingKe HuangYou", "Noto Sans SC", sans-serif',
    label: '站酷庆科黄油',
    group: '设计感',
    crossPlatform: true,
  },
  {
    value: '"Ma Shan Zheng", cursive',
    label: '马善政毛笔',
    group: '手书风',
    crossPlatform: true,
  },
  {
    value: '"Long Cang", cursive',
    label: '龙藏体',
    group: '手书风',
    crossPlatform: true,
  },
  {
    value: '"PingFang SC", sans-serif',
    label: 'PingFang',
    group: '仅 macOS',
    crossPlatform: false,
  },
  {
    value: '"Songti SC", serif',
    label: 'Songti SC',
    group: '仅 macOS',
    crossPlatform: false,
  },
]

export const BODY_FONTS: FontOption[] = [
  {
    value: '"Noto Sans SC", "Source Han Sans SC", "PingFang SC", sans-serif',
    label: '思源黑体',
    group: '经典宋黑',
    crossPlatform: true,
  },
  {
    value: '"Noto Serif SC", "Source Han Serif SC", "Songti SC", serif',
    label: '思源宋体',
    group: '经典宋黑',
    crossPlatform: true,
  },
  {
    value: '"LXGW WenKai", serif',
    label: '霞鹜文楷',
    group: '人文感',
    crossPlatform: true,
  },
  {
    value: '"PingFang SC", sans-serif',
    label: 'PingFang',
    group: '仅 macOS',
    crossPlatform: false,
  },
]

// 按 group 分组，供 shadcn Select 的 SelectGroup 使用
export function groupFonts(fonts: FontOption[]) {
  const map = new Map<string, FontOption[]>()
  for (const f of fonts) {
    if (!map.has(f.group)) map.set(f.group, [])
    map.get(f.group)!.push(f)
  }
  return Array.from(map, ([group, items]) => ({ group, items }))
}
