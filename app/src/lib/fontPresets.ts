// 字体下拉预设。crossPlatform 标记能否提供同名字体的跨平台字形；
// 本机系统栈按可用字体回退，不承诺换机后的相同字形或断行。

export interface FontOption {
  value: string // 完整的 font-family stack
  label: string
  group: string
  crossPlatform: boolean
  note?: string
}

/** Native font references only: no font files, @font-face registration or downloads. */
export const SYSTEM_FONT_STACK =
  '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif'

export const SYSTEM_FONT_OPTION: FontOption = {
  value: SYSTEM_FONT_STACK,
  label: '系统字体',
  group: '系统字体',
  crossPlatform: false,
  note: '调用本机字体：macOS 优先苹方，Windows 优先微软雅黑；其他系统使用默认无衬线字体，换机后外观和换行可能不同。',
}

export const DISPLAY_FONTS: FontOption[] = [
  SYSTEM_FONT_OPTION,
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
  SYSTEM_FONT_OPTION,
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
