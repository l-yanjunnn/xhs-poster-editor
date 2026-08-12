import html2canvas from 'html2canvas-pro'
import JSZip from 'jszip'
import { CANVAS_WIDTH, CANVAS_HEIGHT, EXPORT_SCALE } from './canvas'
import { getUserFontFaceCss } from './fontRegistry'
import {
  checkDeterministicFontReadiness,
  DEFAULT_SYSTEM_LAYOUT_FONT_FAMILIES,
} from './deterministicFontReadiness'
import {
  calibrateDeterministicGlyphBaselinesForHtml2Canvas,
  hasBlockingDeterministicLayoutIssues,
  readDeterministicLayoutIssues,
} from './deterministicTypography'

// v8 架构（2026-05-30）：离屏渲染 + CSS 注入
//
// 历史：
//   v1~v6：在 html2canvas-pro 的 onclone 里改 transform，但 onclone 晚于 bbox 测量，无效
//   v7：把 .page deep clone 到 body 外的 fixed offscreen 容器，bbox 由画布常量决定
//       —— 本地 prod-preview 100% OK，但 prod URL 上深夜黑/极简白仍坏
//
// v7 的剩余 bug 根因（playwright 在 prod URL 上抓到证据）：
//   html2canvas-pro 内部把 cloned DOM 放进一个 about:blank iframe，CSS 通过原 doc 的
//   `<link rel="stylesheet">` 在 iframe 里重新加载来生效。Cloudflare prod 上 iframe
//   的 stylesheet 加载失败（CORS / origin null 不能跨域 fetch CSS），cloned doc 里
//   .page 走默认浏览器样式渲染——logo 按 PNG 自然尺寸画在左上角、文字浏览器默认大小、
//   背景白（缺 .theme-dark-night 的 #1a1a1a）、所有 padding/position 全部失效。
//   雅致主题 5/5 OK 是因为 `<img class="bg">` 撑满画布，掩盖了视觉破绽。
//
// v8 修法：onclone 里把当前 doc 的 *所有* stylesheet.cssRules 转成 text 注入 cloned
// doc 的 <head>，绕开 iframe 的 stylesheet 加载路径。所有 CSS（包括 @font-face、
// CSS vars、theme class、tailwind utility）都打包进 inline <style>，不依赖网络。
//
// 为什么对未来主题也鲁棒：用户新建主题 = App 改 CSS var + theme class 名，
// CSS 文件本身不变。getComputedStyle 和 styleSheets.cssRules 都包含所有规则，
// v8 全量复制 → 无论新主题怎么加，CSS 都生效

// 收集当前 document 的全部 CSS 规则成一段 text，用于在 cloned iframe 里 inline
function collectAllCss(): string {
  const parts: string[] = []
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) {
        parts.push(rule.cssText)
      }
    } catch (e) {
      // 跨域 stylesheet 不可读时跳过（我们的应用只有同源 CSS，正常不会触发）
      console.warn('[exportPng] skipping cross-origin stylesheet:', e)
    }
  }
  return parts.join('\n')
}

function stableRenderHash(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function exportRenderStateHash(
  page: HTMLElement,
  sourceSnapshot: string,
): string {
  const h2 = Array.from(
    page.querySelectorAll<HTMLElement>('.content h2'),
    (heading) => ({
      center: heading.style.getPropertyValue('--h2-optical-center-y'),
      height: heading.style.getPropertyValue('--h2-optical-bar-height'),
      state: heading.dataset.opticalH2 ?? '',
    }),
  )
  const markers = Array.from(
    page.querySelectorAll<HTMLElement>('[data-optical-list-marker]'),
    (marker) => ({
      text: marker.textContent ?? '',
      style: marker.getAttribute('style') ?? '',
    }),
  )
  return stableRenderHash(
    JSON.stringify({
      sourceSnapshot,
      baseline: page.dataset.layoutExportBaselineHash ?? '',
      h2,
      markers,
    }),
  )
}

// 所有只用于编辑预览的覆盖层统一从导出副本中剥离。
// 保留 `.guide` 兼容 v1.2.0 之前没有 data 属性的旧参考线节点。
export function removePreviewOnlyElements(root: HTMLElement): void {
  root
    .querySelectorAll<HTMLElement>('[data-preview-only], .guide')
    .forEach((el) => el.remove())
}

export interface RenderPageOptions {
  /**
   * 仅允许 warning 级排版问题（如 unsatisfied-line）经用户二次确认后
   * 按当前预览导出；任何硬阻断问题（字体、文本一致性、快照缺失）
   * 仍然拒绝渲染。这不是宽泛的 skip：快照必须已封存。
   */
  allowWarnings?: boolean
}

function pageHasOnlyWarningLayoutIssues(page: HTMLElement): boolean {
  const issues = readDeterministicLayoutIssues(page)
  return issues.length > 0 && !hasBlockingDeterministicLayoutIssues(issues)
}

function assertPageExportable(
  page: HTMLElement,
  options?: RenderPageOptions,
): void {
  const sealed = page.dataset.layoutSnapshotPhase === 'sealed'
  const issueCount = Number(page.dataset.layoutIssueCount ?? '0')
  const state = page.dataset.layoutState
  if (state === 'ready' && issueCount === 0 && sealed) return
  if (
    options?.allowWarnings &&
    state === 'ready-with-warnings' &&
    sealed &&
    pageHasOnlyWarningLayoutIssues(page)
  ) {
    return
  }
  throw new Error('页面的确定性排版尚未通过字体与几何预检')
}

// export 仅为 E2E 测试直取 canvas 用（跳过下载管线做像素断言），业务方走 exportPages
export async function pageToPngCanvas(
  page: HTMLElement,
  options?: RenderPageOptions,
): Promise<HTMLCanvasElement> {
  const sourceSnapshot = page.dataset.layoutSnapshot
  if (!sourceSnapshot) {
    throw new Error('页面的确定性排版快照尚未生成')
  }
  assertPageExportable(page, options)
  // 1. 离屏 stage：body 直接子节点 + fixed + 屏外，无 transform 祖先
  const stage = document.createElement('div')
  stage.setAttribute('data-export-stage', '')
  stage.style.cssText = [
    'position:fixed',
    'left:-99999px',
    'top:0',
    `width:${CANVAS_WIDTH}px`,
    `height:${CANVAS_HEIGHT}px`,
    'overflow:hidden',
    'pointer-events:none',
    'z-index:-1',
    'background:transparent',
  ].join(';')
  document.body.appendChild(stage)

  try {
    // 2. deep clone .page
    const cloned = page.cloneNode(true) as HTMLElement
    cloned.style.transform = 'none'
    cloned.style.width = `${CANVAS_WIDTH}px`
    cloned.style.height = `${CANVAS_HEIGHT}px`
    removePreviewOnlyElements(cloned)
    if (cloned.dataset.layoutSnapshot !== sourceSnapshot) {
      throw new Error('导出副本与预览的排版快照不一致')
    }
    stage.appendChild(cloned)

    // 3. 等 img 解码
    const imgs = Array.from(cloned.querySelectorAll<HTMLImageElement>('img'))
    await Promise.all(
      imgs.map((img) => {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve()
        return new Promise<void>((resolve) => {
          const done = () => resolve()
          img.addEventListener('load', done, { once: true })
          img.addEventListener('error', done, { once: true })
          setTimeout(done, 5000)
        })
      }),
    )

    // 先把 html2canvas 的 Range.top + fontSize baseline 修正回
    // 行级快照记录的真实 baseline。只移动离屏 deep clone，绝不
    // 改写 React 正在显示的 source `.page`。
    const baselineTargets = Array.from(
      cloned.querySelectorAll<HTMLElement>('.dtl-atom'),
    ).filter((atom) => Boolean(atom.textContent)).length
    const calibratedBaselines =
      calibrateDeterministicGlyphBaselinesForHtml2Canvas(cloned)
    if (calibratedBaselines !== baselineTargets) {
      const baselineErrors = Array.from(
        cloned.querySelectorAll<HTMLElement>(
          '.dtl-atom[data-layout-export-baseline-error]',
        ),
        (atom) =>
          `${atom.textContent ?? ''}: ${atom.dataset.layoutExportBaselineError}`,
      )
      throw new Error(
        `导出字形基线校准失败：${calibratedBaselines}/${baselineTargets}${baselineErrors.length > 0 ? `；${baselineErrors.slice(0, 3).join('；')}` : ''}`,
      )
    }
    const baselineHash = cloned.dataset.layoutExportBaselineHash
    if (!baselineHash) {
      throw new Error('导出字形基线校准未生成可验证哈希')
    }

    // H2 竖条、列表列宽和 marker 位移属于预览已经封存的行级快照。
    // 导出若再按 html2canvas 的另一套测量重算这些值，就会出现“文字
    // 对了但装饰条错位”的第二份布局。这里唯一允许的 renderer 适配是
    // 上面的 atom-local baseline 位移；其余光学状态原样克隆。
    void cloned.offsetHeight
    const renderHash = exportRenderStateHash(cloned, sourceSnapshot)
    cloned.dataset.layoutRenderHash = renderHash

    // 4. 在 onclone 钩子里注入完整 CSS + 拷贝 :root 的 inline CSS vars
    // 这两步缺一不可：CSS 文件提供 .theme-* 类的样式定义，:root inline vars 提供
    // 用户当前选择的字号/字体/密度等运行时值
    // 用户字体的 @font-face 单独拼接：它们经 FontFace API 注册，不在 styleSheets 里，
    // collectAllCss() 覆盖不到（v8 上线后发现的盲区）
    const cssText = `${collectAllCss()}\n${getUserFontFaceCss()}`
    const rootInlineStyle = document.documentElement.getAttribute('style') ?? ''

    const canvas = await html2canvas(cloned, {
      scale: EXPORT_SCALE,
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      backgroundColor: null,
      useCORS: true,
      imageTimeout: 30_000,
      onclone: async (clonedDoc, clonedPage) => {
        // 注入完整 CSS：iframe 不需要从网络加载 stylesheet 就能拿到所有规则
        const styleEl = clonedDoc.createElement('style')
        styleEl.textContent = cssText
        clonedDoc.head.appendChild(styleEl)
        // 拷贝 :root inline CSS vars（App.tsx 动态设置的 --font-h1 等）到 cloned <html>
        if (rootInlineStyle) {
          const current = clonedDoc.documentElement.getAttribute('style') ?? ''
          clonedDoc.documentElement.setAttribute(
            'style',
            current ? `${current};${rootInlineStyle}` : rootInlineStyle,
          )
        }
        if (clonedPage.dataset.layoutSnapshot !== sourceSnapshot) {
          throw new Error('导出 iframe 丢失了预览排版快照')
        }
        if (
          clonedPage.dataset.layoutExportBaselineHash !== baselineHash ||
          clonedPage.dataset.layoutRenderHash !== renderHash
        ) {
          throw new Error('导出 iframe 的字形/装饰渲染哈希不一致')
        }
        // 先强制请求副本的精确 H2/body 字体，再让 html2canvas
        // 解析文字 bounds。仅 await fonts.ready 不够：新 @font-face 刚注入
        // 但尚未触发布局时，ready 可能立即解析，随后的 Range bounds
        // 仍会用 fallback，导致导出文字相对竖线上移。
        // html2canvas 会把本次 referenceElement 作为第二参传入。
        // 不查询 clonedDoc 的“第一个 stage”，否则并行导出 A/B 时
        // B 的 iframe 可能误校准 A，导致 unicode-range 字体漏载。
        void clonedPage.offsetHeight
        const fontResult = await checkDeterministicFontReadiness(
          clonedPage,
          {
            ownerDocument: clonedDoc,
            timeoutMs: 3_000,
            allowlistedFamilies: DEFAULT_SYSTEM_LAYOUT_FONT_FAMILIES,
          },
        )
        if (!fontResult.ok) {
          throw new Error(
            `导出副本字体校验失败：${fontResult.issues
              .map((issue) => `${issue.label} ${issue.message}`)
              .join('；')}`,
          )
        }
        void clonedPage.offsetHeight
      },
    })
    canvas.dataset.layoutSnapshot = sourceSnapshot
    canvas.dataset.layoutRenderHash = renderHash
    canvas.dataset.layoutExportBaselineHash = baselineHash
    return canvas
  } finally {
    if (stage.parentNode) stage.parentNode.removeChild(stage)
  }
}

// 检测 race artifact：v1/v2 修法下偶发的"宣纸+右黑带"race，特征是 canvas 右侧
// 约 1/5 区域是纯黑。在 x=95% 位置纵向采样 5 个点，全黑判定为 race。
//
// 误判风险：用户使用纯黑背景主题时整张 canvas 都是黑色，会被误判。但 .page 背景
// 默认是宣纸/白色，纯黑主题极少见，最多多 retry 几次浪费几秒
function hasRaceArtifact(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d')
  if (!ctx) return false
  const x = Math.floor(canvas.width * 0.95)
  let blackCount = 0
  for (let i = 1; i <= 5; i++) {
    const y = Math.floor(canvas.height * (i / 6))
    const p = ctx.getImageData(x, y, 1, 1).data
    if (p[0] === 0 && p[1] === 0 && p[2] === 0) blackCount++
  }
  return blackCount === 5
}

async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob 返回 null'))),
      'image/png',
    )
  })
}

// 截图 + 检测 race + 最多 retry 2 次。
// v2 修法基础上单次成功率 ~80%；3 次重试理论成功率 = 1 - 0.2^3 = 99.2%
/**
 * 把单个成品页渲染为 PNG Blob。
 * 目录导出、页码自选和兼容 ZIP 共用这一条已验证的渲染链。
 */
export async function renderPagePngBlob(
  page: HTMLElement,
  options?: RenderPageOptions,
): Promise<Blob> {
  const maxAttempts = 3
  let lastCanvas: HTMLCanvasElement | null = null
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const canvas = await pageToPngCanvas(page, options)
    lastCanvas = canvas
    if (!hasRaceArtifact(canvas)) {
      return canvasToBlob(canvas)
    }
    // 检测到 race，等下一帧再试（让浏览器重排）
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }
  // 3 次都 race，接受最后一次让用户至少能看到结果（可手动重试导出）
  return canvasToBlob(lastCanvas!)
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  // 60s 而不是 1s：大 zip 需要时间写盘，过早 revoke 会让 Chrome 下载文件损坏
  setTimeout(() => {
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, 60_000)
}

// 单页直下 PNG，多页打 zip。filename 不含扩展名
// onProgress: 每完成一页（含 zip 打包阶段）回调一次，便于 UI 显示 N/total
export async function exportPages(
  pages: HTMLElement[],
  filename: string,
  onProgress?: (current: number, total: number) => void,
): Promise<void> {
  if (pages.length === 0) return
  // 导出弹窗已在前置检查里明确提示字体超时；用户选择“仍然导出”后，
  // 实际导出也必须有上限，不能再次无期限卡在 fonts.ready。
  await Promise.race([
    document.fonts.ready,
    new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
  ])

  if (pages.length === 1) {
    const blob = await renderPagePngBlob(pages[0])
    onProgress?.(1, 1)
    triggerDownload(blob, `${filename}.png`)
    return
  }

  // N 张截图 + 1 个 zip 打包步骤 = N+1 总步数
  const totalSteps = pages.length + 1
  const zip = new JSZip()
  for (let i = 0; i < pages.length; i++) {
    const blob = await renderPagePngBlob(pages[i])
    zip.file(`${filename}-${i + 1}.png`, blob)
    onProgress?.(i + 1, totalSteps)
  }
  const zipBlob = await zip.generateAsync({ type: 'blob' })
  onProgress?.(totalSteps, totalSteps)
  triggerDownload(zipBlob, `${filename}.zip`)
}

// 从 Tiptap HTML 里提取首个 H1 文本作为默认文件名；没有 H1 则回退到日期
export function suggestFilename(html: string): string {
  const dateStr = new Date().toISOString().slice(0, 10)
  if (!html) return dateStr
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const h1 = doc.querySelector('h1')
  const text = h1?.textContent?.trim() ?? ''
  if (!text) return dateStr
  return text.replace(/[\\/:*?"<>|]/g, '').slice(0, 40) || dateStr
}
