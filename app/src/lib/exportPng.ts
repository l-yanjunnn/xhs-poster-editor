import html2canvas from 'html2canvas-pro'
import JSZip from 'jszip'
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './canvas'

// 把 .page 截成 PNG Blob。
// scale: 2 是为了输出 2160×3840 的高清图（小红书也用得上）。
// 假设调用方已经锁定 .page-wrapper 和 .page 的 inline width/height
// （见 exportPages 顶层的 lockPagesForExport），cloned doc 因此继承稳定 layout
async function pageToPngBlob(page: HTMLElement): Promise<Blob> {
  const canvas = await html2canvas(page, {
    scale: 2,
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    backgroundColor: null,
    useCORS: true,
    imageTimeout: 30_000,
    onclone: (clonedDoc) => {
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

// 锁定所有 .page-wrapper 和 .page 的 inline 尺寸，消除 cloned doc 里的 layout race。
//
// Why 改源 DOM 而不是 cloned DOM:
// 之前在 onclone 钩子里改 cloned doc 的 .page inline style，prod 上 5/25 张依然
// race（异常 PNG = 宣纸背景 + 右侧黑带 + 内容全无）。根因是 html2canvas-pro 内部
// parseBounds(.page) 拿 left/top 作 render origin，opts.width 只钉死 canvas
// 尺寸，但 origin 还是来自错的 bbox → canvas 视口偏移，内容被画到画面外。
//
// 改源 DOM 后 cloned doc 直接继承正确 layout，parseBounds 拿到的 bbox 就是对的。
// 返回 restore 函数，调用方在 finally 块里调用恢复原状
function lockPagesForExport(pages: HTMLElement[]): () => void {
  const restoreFns: Array<() => void> = []
  for (const page of pages) {
    const wrapper = page.parentElement // .page-wrapper
    const pageStyle = page.style.cssText
    const wrapperStyle = wrapper?.style.cssText
    page.style.width = `${CANVAS_WIDTH}px`
    page.style.height = `${CANVAS_HEIGHT}px`
    page.style.flexShrink = '0'
    if (wrapper) {
      wrapper.style.transform = 'none'
      wrapper.style.marginBottom = '0'
      wrapper.style.width = `${CANVAS_WIDTH}px`
      wrapper.style.height = `${CANVAS_HEIGHT}px`
      wrapper.style.flexShrink = '0'
    }
    restoreFns.push(() => {
      page.style.cssText = pageStyle
      if (wrapper && wrapperStyle !== undefined) {
        wrapper.style.cssText = wrapperStyle
      }
    })
  }
  // 强制一次 reflow，确保新 layout 在 html2canvas 读取之前已经生效
  void document.body.offsetHeight
  return () => restoreFns.forEach((fn) => fn())
}

// 单页直下 PNG，多页打 zip。filename 不含扩展名
export async function exportPages(
  pages: HTMLElement[],
  filename: string,
): Promise<void> {
  if (pages.length === 0) return
  // 等所有 webfont 加载完，避免截图时还是 fallback 字体
  await document.fonts.ready

  const restore = lockPagesForExport(pages)
  try {
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
  } finally {
    restore()
  }
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
