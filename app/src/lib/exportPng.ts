import html2canvas from 'html2canvas-pro'
import JSZip from 'jszip'

// 把 .page 截成 PNG Blob。
// scale: 2 是为了输出 2160×3840 的高清图（小红书也用得上）。
// onclone 钩子里去掉外层 page-wrapper 的 transform:scale(0.4)——
// 否则 html2canvas 会按缩放后的尺寸截图，得到一张缩小图
async function pageToPngBlob(page: HTMLElement): Promise<Blob> {
  const canvas = await html2canvas(page, {
    scale: 2,
    backgroundColor: null,
    useCORS: true,
    onclone: (clonedDoc) => {
      // 撤掉所有 page-wrapper 的预览缩放
      clonedDoc.querySelectorAll<HTMLElement>('.page-wrapper').forEach((w) => {
        w.style.transform = 'none'
        w.style.marginBottom = '0'
      })
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
  // 给浏览器一点时间消化 click 再清理
  setTimeout(() => {
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, 1000)
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
