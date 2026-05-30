import html2canvas from 'html2canvas-pro'
import JSZip from 'jszip'
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './canvas'

// v7 架构（2026-05-30）：离屏渲染
//
// 历史：v1~v6 都在跟 html2canvas-pro 的 bbox 测量时机斗争——它在 onclone 之前用
// `getBoundingClientRect()` 测 .page 的 bbox，被 .page-wrapper 上的 transform:scale(0.4)
// 误测成 432×768。每加一种主题/背景源就触发新的边界 case。
//
// 根治：解耦预览和导出。预览继续 transform 缩放，导出走完全独立的路径：
//   1. 在 body 直接子节点位置创建一个 fixed offscreen 容器（无任何 transform 祖先）
//   2. deep clone 当前 .page 到容器里
//   3. 等所有 img 解码完
//   4. html2canvas 截 clone（bbox 自然 = 1080×1920，无 race 可能）
//   5. finally 里移除容器
// 源 DOM 零修改，预览零闪烁。每加新功能不再依赖 html2canvas 对边界的容忍度
async function pageToPngCanvas(page: HTMLElement): Promise<HTMLCanvasElement> {
  // 1. 离屏 stage：body 直接子节点 + fixed + 屏外，确保无 transform 祖先
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
    // 清掉 inline transform/width/height 让 CSS 自然生效；参考线只服务预览，剥掉
    cloned.style.transform = 'none'
    cloned.style.width = `${CANVAS_WIDTH}px`
    cloned.style.height = `${CANVAS_HEIGHT}px`
    cloned.querySelectorAll<HTMLElement>('.guide').forEach((g) => g.remove())
    stage.appendChild(cloned)

    // 3. 等所有 img 解码完。preview 里 img 已加载过，clone 用同 src 走浏览器缓存，
    // 一般几 ms 就 decode 完。给 5s 兜底，防止极端情况卡死
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

    // 强制 layout
    void cloned.offsetHeight

    // 4. html2canvas 截 clone。bbox = 1080×1920，无 race
    return await html2canvas(cloned, {
      scale: 2,
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      backgroundColor: null,
      useCORS: true,
      imageTimeout: 30_000,
    })
  } finally {
    // 5. 清理 stage
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
async function pageToPngBlobWithRetry(page: HTMLElement): Promise<Blob> {
  const maxAttempts = 3
  let lastCanvas: HTMLCanvasElement | null = null
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const canvas = await pageToPngCanvas(page)
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
export async function exportPages(
  pages: HTMLElement[],
  filename: string,
): Promise<void> {
  if (pages.length === 0) return
  await document.fonts.ready

  if (pages.length === 1) {
    const blob = await pageToPngBlobWithRetry(pages[0])
    triggerDownload(blob, `${filename}.png`)
    return
  }

  const zip = new JSZip()
  for (let i = 0; i < pages.length; i++) {
    const blob = await pageToPngBlobWithRetry(pages[i])
    zip.file(`${filename}-${i + 1}.png`, blob)
  }
  const zipBlob = await zip.generateAsync({ type: 'blob' })
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
