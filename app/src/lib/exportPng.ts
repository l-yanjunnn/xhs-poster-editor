import html2canvas from 'html2canvas-pro'
import JSZip from 'jszip'
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './canvas'

// 把 .page 截成 canvas。
// scale: 2 输出 2160×3840 高清图。
// 显式传 width/height 修 html2canvas-pro 内部 parseBounds 的尺寸 race（baseline
// 10/25 异常修到 0/25）。onclone 改 .page inline 是缓解 origin race 的次要修法。
//
// 仍剩余约 20% 概率的"内容跑偏 + 右黑带"race 在 html2canvas-pro 内部 cloned iframe
// 的 layout 时序中，无法在用户代码层根治——所以用 pageToPngBlobWithRetry 做检测+重试。
async function pageToPngCanvas(page: HTMLElement): Promise<HTMLCanvasElement> {
  return await html2canvas(page, {
    scale: 2,
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    backgroundColor: null,
    useCORS: true,
    imageTimeout: 30_000,
    onclone: (clonedDoc) => {
      clonedDoc.querySelectorAll<HTMLElement>('.page-wrapper').forEach((w) => {
        w.style.transform = 'none'
        w.style.marginBottom = '0'
      })
      clonedDoc.querySelectorAll<HTMLElement>('.page').forEach((p) => {
        p.style.width = `${CANVAS_WIDTH}px`
        p.style.height = `${CANVAS_HEIGHT}px`
        p.style.flexShrink = '0'
      })
      // 参考线只服务于预览，不进入导出图
      clonedDoc.querySelectorAll<HTMLElement>('.guide').forEach((g) => g.remove())
    },
  })
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
