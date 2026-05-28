import html2canvas from 'html2canvas-pro'
import JSZip from 'jszip'
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './canvas'

// 把 .page 截成 PNG Blob。
// scale: 2 是为了输出 2160×3840 的高清图（小红书也用得上）。
// onclone 钩子里去掉外层 page-wrapper 的 transform:scale(0.4)——
// 否则 html2canvas 会按缩放后的尺寸截图，得到一张缩小图
//
// 显式传 width/height: 多页串行 + 慢网络下，html2canvas-pro 偶发对 .page 的
// parseBounds(getBoundingClientRect()) 拿到 viewport-sized bbox（race condition，
// .page 在 cloned doc 里是 flex item，layout 在 measure 之前抖动）。
// 传 width/height 让 html2canvas 跳过 parseBounds，从根上消除 race
async function pageToPngBlob(page: HTMLElement): Promise<Blob> {
  const canvas = await html2canvas(page, {
    scale: 2,
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    backgroundColor: null,
    useCORS: true,
    imageTimeout: 30_000,
    onclone: (clonedDoc) => {
      // 撤掉所有 page-wrapper 的预览缩放
      clonedDoc.querySelectorAll<HTMLElement>('.page-wrapper').forEach((w) => {
        w.style.transform = 'none'
        w.style.marginBottom = '0'
      })
      // 强制 .page inline width/height: 父容器是 flex flex-col items-center，
      // cloned doc 里 .page 作为 flex item 偶发被压缩到非 1080 宽（CSS var 或
      // flex layout race），导致 canvas 尺寸对、但内部内容只渲染到左侧约 4/5，
      // 右侧填黑。inline style 优先级最高，跳过所有父容器/var 计算
      clonedDoc.querySelectorAll<HTMLElement>('.page').forEach((p) => {
        p.style.width = `${CANVAS_WIDTH}px`
        p.style.height = `${CANVAS_HEIGHT}px`
        p.style.flexShrink = '0'
      })
      // 参考线只服务于预览，不进入导出图：直接 remove DOM 节点
      // （早期版本用 .page--guides::before/::after，但 html2canvas 处理伪元素早于 onclone，
      // class 移除后伪元素仍被截到 canvas，故改成真实子节点）
      clonedDoc.querySelectorAll<HTMLElement>('.guide').forEach((g) => g.remove())
    },
  })
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob 返回 null'))),
      'image/png',
    )
  })
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  // a 必须挂到 document 才能可靠触发下载（detached 节点会被某些浏览器忽略）
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  // Why 60s 而不是 1s：导出 PNG 单页 ~11MB、多页 zip ~50MB+，Chrome 写入磁盘需要时间。
  // 早期 1s 后就 revokeObjectURL，blob 被释放，Chrome 下载条目存在但文件已损坏，
  // 用户点击「在文件夹中显示」时找不到完整文件
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
  // 等所有 webfont 加载完，避免截图时还是 fallback 字体
  await document.fonts.ready

  if (pages.length === 1) {
    const blob = await pageToPngBlob(pages[0])
    triggerDownload(blob, `${filename}.png`)
    return
  }

  const zip = new JSZip()
  for (let i = 0; i < pages.length; i++) {
    const blob = await pageToPngBlob(pages[i])
    zip.file(`${filename}-${i + 1}.png`, blob)
  }
  const zipBlob = await zip.generateAsync({ type: 'blob' })
  triggerDownload(zipBlob, `${filename}.zip`)
}

// 从 Tiptap HTML 里提取首个 H1 文本作为默认文件名；没有 H1 则回退到日期
export function suggestFilename(html: string): string {
  const dateStr = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  if (!html) return dateStr
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const h1 = doc.querySelector('h1')
  const text = h1?.textContent?.trim() ?? ''
  if (!text) return dateStr
  // 过滤掉文件名非法字符
  return text.replace(/[\\/:*?"<>|]/g, '').slice(0, 40) || dateStr
}
