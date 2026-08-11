import { Node } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { PosterImage } from './ImageExtension'
import { NoWrapPhrase } from './NoWrapPhrase'
import { TextHighlight } from './TextHighlight'

// 分页节点不属于 block group，因此 listItem/blockquote 的内容表达式无法再
// 接纳它；只有根文档显式允许 pageBreak，结构不变量由 schema 兜底。
export const PosterDocument = Node.create({
  name: 'doc',
  topNode: true,
  content: '(block | pageBreak)+',
})

// 继续使用 horizontalRule 作为节点名，旧草稿 JSON 无需迁移节点类型。
export const RootPageBreak = Node.create({
  name: 'horizontalRule',
  group: 'pageBreak',
  atom: true,
  selectable: true,
  parseHTML() {
    return [{ tag: 'hr:not(.divider)', priority: 900 }]
  },
  renderHTML() {
    return ['hr', { class: 'page-break' }]
  },
})

// 装饰分隔线仍是普通 block；高优先级避免被分页节点抢先解析。
export const Divider = Node.create({
  name: 'divider',
  group: 'block',
  parseHTML() {
    return [{ tag: 'hr.divider', priority: 1000 }]
  },
  renderHTML() {
    return ['hr', { class: 'divider' }]
  },
})

/** 编辑器与测试共用同一套生产 schema，避免 StarterKit 测试漏掉分页约束。 */
export function createEditorExtensions() {
  return [
    StarterKit.configure({
      document: false,
      horizontalRule: false,
    }),
    PosterDocument,
    RootPageBreak,
    Divider,
    NoWrapPhrase,
    TextHighlight,
    PosterImage.configure({ inline: false, allowBase64: true }),
  ]
}
