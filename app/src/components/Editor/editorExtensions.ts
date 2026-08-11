import { Extension, Node } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Plugin } from '@tiptap/pm/state'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { normalizePageBreakJson } from '@/lib/pageBreak'
import { PosterImage } from './ImageExtension'
import { NoWrapPhrase } from './NoWrapPhrase'
import { TextHighlight } from './TextHighlight'
import { handlePageBreakPaste } from './pageBreakCommand'
import { applyBlockType, toggleBlockType } from './blockTypeCommand'

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

function hasNestedPageBreak(document: ProseMirrorNode): boolean {
  let found = false
  document.descendants((node, _position, parent) => {
    if (
      node.type.name === 'horizontalRule' &&
      parent?.type.name !== 'doc'
    ) {
      found = true
      return false
    }
    return !found
  })
  return found
}

const PageBreakInvariants = Extension.create({
  name: 'pageBreakInvariants',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handlePaste: (view, event) => handlePageBreakPaste(view, event),
        },
        appendTransaction(transactions, _oldState, newState) {
          if (
            !transactions.some((transaction) => transaction.docChanged) ||
            !hasNestedPageBreak(newState.doc)
          ) {
            return null
          }
          const normalizedJson = normalizePageBreakJson(newState.doc.toJSON())
          const normalizedDocument = newState.schema.nodeFromJSON(normalizedJson)
          if (normalizedDocument.eq(newState.doc)) return null
          return newState.tr
            .replaceWith(
              0,
              newState.doc.content.size,
              normalizedDocument.content,
            )
            .setMeta('pageBreakInvariant', true)
        },
      }),
    ]
  },
})

// Heading 自带的 Mod-Alt-1…3 和 Paragraph 的 Mod-Alt-0 会直接使用
// 原始选区。高优先级覆盖同名键，让快捷键与下拉框共用边界规则。
const BlockTypeShortcuts = Extension.create({
  name: 'blockTypeShortcuts',
  priority: 1_000,
  addKeyboardShortcuts() {
    return {
      'Mod-Alt-0': () => {
        applyBlockType(this.editor, 'paragraph')
        return true
      },
      'Mod-Alt-1': () => {
        toggleBlockType(this.editor, 'h1')
        return true
      },
      'Mod-Alt-2': () => {
        toggleBlockType(this.editor, 'h2')
        return true
      },
      'Mod-Alt-3': () => {
        toggleBlockType(this.editor, 'h3')
        return true
      },
    }
  },
})

/** 编辑器与测试共用同一套生产 schema，避免 StarterKit 测试漏掉分页约束。 */
export function createEditorExtensions() {
  return [
    StarterKit.configure({
      document: false,
      horizontalRule: false,
      heading: { levels: [1, 2, 3] },
    }),
    PosterDocument,
    RootPageBreak,
    Divider,
    PageBreakInvariants,
    BlockTypeShortcuts,
    NoWrapPhrase,
    TextHighlight,
    PosterImage.configure({ inline: false, allowBase64: true }),
  ]
}
