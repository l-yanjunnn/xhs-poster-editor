// 把 Tiptap 输出的整段 HTML 按 <hr class="page-break"> 切割成多页
// 纯函数，无副作用，便于单测
//
// 边界约定：
// - 空输入 → ['']（仍然返回一页，让 Preview 不至于 0 个画布）
// - 连续两个 hr.page-break → 中间产生一个空页（保留用户意图，不自动合并）
// - 首/尾 hr → 首尾各多出一个空页（同上）

export function splitIntoPages(html: string): string[] {
  const trimmed = html.trim()
  if (!trimmed) return ['']

  const doc = new DOMParser().parseFromString(
    `<div id="root">${trimmed}</div>`,
    'text/html',
  )
  const root = doc.getElementById('root')
  if (!root) return [trimmed]

  const pages: string[] = []
  let current: string[] = []
  for (const node of Array.from(root.children)) {
    if (
      node.tagName === 'HR' &&
      (node as HTMLElement).classList.contains('page-break')
    ) {
      pages.push(current.join(''))
      current = []
    } else {
      current.push(node.outerHTML)
    }
  }
  pages.push(current.join(''))
  return pages.length > 0 ? pages : ['']
}
