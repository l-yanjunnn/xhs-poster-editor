import { analyzeImportDocument } from './importDocument'

export const BAICAOLU_COVER_LINES = ['普通人', '可以完整。'] as const

// 这是可编辑的排版说明，不作为账号作者的文章。正文与封面独立分页。
const SOURCE = `# ${BAICAOLU_COVER_LINES.join('')}

---

## 从第二页开始展开

这是一份排版示例。封面沿用讨论中的标题，内页用说明文字展示长文的阅读节奏；使用时，请替换成你自己的文章。

封面只放一句核心观点。到第二页，再交代这句话从何而来：可以是一个具体的问题、一段经历，或一个值得继续解释的判断。

每段围绕一个意思展开。较长的论述可以自然分段，重点句适量加粗，让读者先读懂内容，再看见强调。

### 用小标题组织文章

内页不需要重复封面的大字。进入一个新的论点时，用二级标题；同一论点下还需要分层，再用三级标题。

---

## 让正文自然延续

文章还没有讲完，就继续下一页。页数随内容增减，不需要为了凑满固定页数而拉长文字。

这里可以放论据、例子，以及它们如何支持前面的判断。比起每一行都强调，保留普通正文更容易看出真正的重点。

> 引用可以单独成段；只在确实引用他人的话时保留，并补上来源。

**一页只突出少数重点。** 需要时可给关键词加荧光笔，其他文字保持正常字重。

最后一段回到开头的问题，自然收束。是否添加提问或邀请，由文章本身决定。
`

export function createBaicaoluExample() {
  const analysis = analyzeImportDocument(SOURCE, {
    sourceName: '百草路撸猫战神 · 排版示例',
    separatorMode: 'pages',
  })
  // 内置示例的人工断句；不修改通用 Markdown 解析，也不推断用户标题断句。
  // 这里只插入可信常量，不接受导入文件或其他用户输入。
  const coverHtml = `<h1>${BAICAOLU_COVER_LINES.join('<br>')}</h1>`
  const pages = analysis.pages.map((page, index) =>
    index === 0 ? { ...page, html: coverHtml } : page,
  )
  return {
    ...analysis,
    structureLabel: '内置排版示例',
    needsSeparatorDecision: false,
    pages,
    contentHtml: pages.map((page) => page.html).join('<hr class="page-break">'),
  }
}
