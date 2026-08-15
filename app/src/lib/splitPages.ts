// 把 Tiptap 输出的整段 HTML 按 <hr class="page-break"> 切割成多页
// 纯函数，无副作用，便于单测
//
// 边界约定：
// - 空输入 → ['']（仍然返回一页，让 Preview 不至于 0 个画布）
// - 连续两个 hr.page-break → 中间产生一个空页（保留用户意图，不自动合并）
// - 首/尾 hr → 首尾各多出一个空页（同上）

import {
  PAGE_BREAK_CONTINUATION_ATTRIBUTE,
  PAGE_CONTINUATION_TERMINAL_ATTRIBUTE,
} from './pageBreak'

export function splitIntoPages(html: string): string[] {
  const trimmed = html.trim()
  if (!trimmed) return ['']

  const doc = new DOMParser().parseFromString(
    `<div id="root">${trimmed}</div>`,
    'text/html',
  )
  const root = doc.getElementById('root')
  if (!root) return [trimmed]

  // 这是分页消费端的派生标记，不是可持久化语义。先清掉
  // 输入中的同名属性，再且只根据分页节点的显式属性生成。
  for (const element of Array.from(
    root.querySelectorAll<HTMLElement>(
      `[${PAGE_CONTINUATION_TERMINAL_ATTRIBUTE}]`,
    ),
  )) {
    element.removeAttribute(PAGE_CONTINUATION_TERMINAL_ATTRIBUTE)
  }

  const pages: string[] = []
  let current: Element[] = []
  const flushPage = (continuation: boolean) => {
    const terminal = current.at(-1)
    if (continuation && terminal?.tagName === 'P') {
      terminal.setAttribute(PAGE_CONTINUATION_TERMINAL_ATTRIBUTE, 'true')
    }
    pages.push(current.map((node) => node.outerHTML).join(''))
    current = []
  }
  for (const node of Array.from(root.children)) {
    if (
      node.tagName === 'HR' &&
      (node as HTMLElement).classList.contains('page-break')
    ) {
      flushPage(
        node.getAttribute(PAGE_BREAK_CONTINUATION_ATTRIBUTE) === 'true',
      )
    } else {
      current.push(node)
    }
  }
  flushPage(false)
  return pages.length > 0 ? pages : ['']
}
