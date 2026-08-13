/**
 * P1 断行求解器微基准（v1.9.0 优化 before/after 对比用）。
 *
 * 直接对 solveDeterministicTextLayout 纯函数计时——它不碰 Canvas/DOM，
 * 输入是预测量好的 atom（advance/em/ink），因此 node 侧结果只反映求解器
 * 本身的算法开销，与浏览器里的相对比例一致。优化后用同一脚本复跑对比。
 *
 * 参数向 app/src/lib/deterministicTextLayout.test.ts 的真实用法看齐：
 * justify（默认 justifyWrappedLines=true）、版心 888px、字号 44
 * （em=advance=44，标点 ink 按测试里 Chromium+Noto Sans SC 实测值等比放大）。
 * 行高 1.85 不进求解器（它只解宽度方向），故不出现在输入里。
 *
 * 用法（Node >= 23，本机 24，原生 strip-types 直接跑 .ts）：
 *   node tools/perf/solver-bench.mjs
 */
import { performance } from 'node:perf_hooks'
import {
  classifyLayoutGrapheme,
  solveDeterministicTextLayout,
} from '../../app/src/lib/deterministicTextLayout.ts'

const FONT_SIZE = 44 // px；教程正文字号
const TARGET_WIDTH = 888 // px；版心宽
const EM = FONT_SIZE
const HAN_ADVANCE = FONT_SIZE
const LATIN_ADVANCE = FONT_SIZE * 0.52
const SPACE_ADVANCE = FONT_SIZE * 0.26

// deterministicTextLayout.test.ts 顶部的 Chromium + Noto Sans SC 400 实测
// ink 值（10px 合成 em 归一），此处等比放大到 44px。
const SCALE = FONT_SIZE / 10
const NOTO_INK_10 = {
  han: { inkLeft: -0.4, inkRight: 9.6 },
  comma: { inkLeft: -1.35, inkRight: 3.3 },
  enumerationComma: { inkLeft: -0.52, inkRight: 3.41 },
  fullStop: { inkLeft: -0.42, inkRight: 3.47 },
  colon: { inkLeft: -1.74, inkRight: 3.26 },
  question: { inkLeft: -0.33, inkRight: 4.61 },
  exclamation: { inkLeft: -1.86, inkRight: 3.14 },
  openQuote: { inkLeft: -6.24, inkRight: 9.63 },
  closeQuote: { inkLeft: -0.37, inkRight: 3.76 },
  openBookTitle: { inkLeft: -5.29, inkRight: 9.63 },
  closeBookTitle: { inkLeft: -0.36, inkRight: 4.7 },
}
const INK_BY_CHAR = {
  '，': NOTO_INK_10.comma,
  '、': NOTO_INK_10.enumerationComma,
  '。': NOTO_INK_10.fullStop,
  '：': NOTO_INK_10.colon,
  '？': NOTO_INK_10.question,
  '！': NOTO_INK_10.exclamation,
  '“': NOTO_INK_10.openQuote,
  '”': NOTO_INK_10.closeQuote,
  '《': NOTO_INK_10.openBookTitle,
  '》': NOTO_INK_10.closeBookTitle,
}

function scaledInk(character) {
  const ink = INK_BY_CHAR[character] ?? NOTO_INK_10.han
  return { inkLeft: ink.inkLeft * SCALE, inkRight: ink.inkRight * SCALE }
}

let atomSeq = 0
/** 把一段文本按生产同款 classifyLayoutGrapheme 切成 solver 输入。 */
function atomsFromText(text) {
  const atoms = []
  let latinGroup = null
  for (const character of Array.from(text)) {
    const kind = classifyLayoutGrapheme(character)
    const isLatinLike = kind === 'latin' || kind === 'digit'
    if (isLatinLike && latinGroup === null) latinGroup = `bg-${atomSeq}`
    if (!isLatinLike) latinGroup = null
    const advance =
      kind === 'latin' || kind === 'digit'
        ? LATIN_ADVANCE
        : kind === 'space'
          ? SPACE_ADVANCE
          : HAN_ADVANCE
    const ink = scaledInk(character)
    atoms.push({
      id: `a-${atomSeq++}`,
      text: character,
      kind,
      advance,
      em: EM,
      inkLeft: ink.inkLeft,
      inkRight: ink.inkRight,
      ...(isLatinLike && latinGroup ? { breakGroup: latinGroup } : {}),
    })
  }
  return atoms
}

// —— 语料：真实中文标点密度的句子，重复拼接到目标长度 ——
const CJK_SENTENCE =
  '小红书图文的排版质量，直接决定了读者会不会停下来：字距、标点悬挂、' +
  '两端对齐，每一个细节都在传达“认真”二字。我们把断行做成确定性求解，' +
  '预览与导出因此逐像素一致！《确定性排版》不是玄学，而是把浏览器的' +
  '模糊决策收回到自己手里、逐行给出答案。'

const MIXED_SENTENCE =
  '在 v1.9.0 里我们用 DP solver 重写了断行：atoms 数量 2000 时，' +
  'justify 路径的 P95 延迟要降一个数量级。React 19 与 html2canvas 的' +
  '组合下，Noto Sans SC 400 在 44px 的 advance 是 44，Latin 约 0.52em。'

function textOfLength(base, length) {
  let out = ''
  while (Array.from(out).length < length) out += base
  return Array.from(out).slice(0, length).join('')
}

function quantile(sorted, q) {
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

function bench(name, atoms, { warmup = 5, rounds = 30 } = {}) {
  let lineCount = 0
  for (let i = 0; i < warmup; i++) {
    lineCount = solveDeterministicTextLayout(atoms, TARGET_WIDTH).length
  }
  const samples = []
  for (let i = 0; i < rounds; i++) {
    const start = performance.now()
    solveDeterministicTextLayout(atoms, TARGET_WIDTH)
    samples.push(performance.now() - start)
  }
  samples.sort((a, b) => a - b)
  const median = quantile(samples, 0.5)
  const p95 = quantile(samples, 0.95)
  console.log(
    `${name.padEnd(28)} atoms=${String(atoms.length).padStart(5)} ` +
      `lines=${String(lineCount).padStart(4)} ` +
      `median=${median.toFixed(2)}ms p95=${p95.toFixed(2)}ms ` +
      `(n=${rounds}, warmup=${warmup})`,
  )
  return { name, atoms: atoms.length, lines: lineCount, median, p95, rounds }
}

// 轮数按 case 体量自适应：优化前 500 字单轮已 ~6.5s、2000 字单轮
// 预计数百秒（这正是 P1 要修的问题），2000 字如跑满 20 轮需数小时，
// 故重型 case 降轮数并如实标注 n。优化后复跑请保持同样的轮数配置。
const cases = [
  ['中文段落 ~100 字', atomsFromText(textOfLength(CJK_SENTENCE, 100)), { warmup: 5, rounds: 30 }],
  ['中文段落 ~500 字', atomsFromText(textOfLength(CJK_SENTENCE, 500)), { warmup: 2, rounds: 20 }],
  ['中文段落 ~2000 字', atomsFromText(textOfLength(CJK_SENTENCE, 2000)), { warmup: 1, rounds: 3 }],
  ['中英混排 ~500 字素', atomsFromText(textOfLength(MIXED_SENTENCE, 500)), { warmup: 2, rounds: 20 }],
]

console.log(
  `solver-bench | node ${process.version} | width=${TARGET_WIDTH} fontSize=${FONT_SIZE} justify=default(true)`,
)
const results = cases.map(([name, atoms, opts]) => bench(name, atoms, opts))
console.log('\nJSON:', JSON.stringify(results))
