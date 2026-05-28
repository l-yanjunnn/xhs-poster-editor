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
    // 默认 15s，调高一档防止真实浏览器并发负载下 html2canvas 内部 img 加载 timeout
    imageTimeout: 30000,
    onclone: (clonedDoc) => {
      // 撤掉所有 page-wrapper 的预览缩放
      clonedDoc.querySelectorAll<HTMLElement>('.page-wrapper').forEach((w) => {
        w.style.transform = 'none'
        w.style.marginBottom = '0'
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

// 把单个 url（含 blob: / http: / same-origin）转成 data URL
async function fetchAsDataURL(src: string): Promise<string> {
  if (src.startsWith('data:')) return src
  const res = await fetch(src)
  const blob = await res.blob()
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('FileReader 失败'))
    reader.readAsDataURL(blob)
  })
}

// 把所有 page 内 <img> 的 src 临时换成 data URL，返回还原函数。
// Why：html2canvas-pro clone DOM 后会重新触发 <img> 的 load（CORS 模式下浏览器缓存键变了，
// 真实环境用户多 tab + 网络抖动下偶发 timeout，结果某些页的 bg/logo 没截上，
// 导出的 PNG 只剩白底+空 logo 占位。data URL 是同步可用的 inline 数据，从根上消除 fetch race。
async function inlineImagesAsDataURL(
  pages: HTMLElement[],
): Promise<() => void> {
  const srcSet = new Set<string>()
  pages.forEach((p) =>
    p.querySelectorAll('img').forEach((img) => {
      if (img.src && !img.src.startsWith('data:')) srcSet.add(img.src)
    }),
  )
  // 并发预取所有唯一 src
  const cache = new Map<string, string>()
  await Promise.all(
    Array.from(srcSet).map(async (src) => {
      try {
        cache.set(src, await fetchAsDataURL(src))
      } catch {
        // 单张失败就保留原 src，让 html2canvas 走老路径
      }
    }),
  )
  // 替换 src 并记录还原信息
  const swapped: Array<{ img: HTMLImageElement; original: string }> = []
  pages.forEach((p) =>
    p.querySelectorAll('img').forEach((img) => {
      const dataURL = cache.get(img.src)
      if (dataURL) {
        swapped.push({ img, original: img.src })
        img.src = dataURL
      }
    }),
  )
  // 等所有 swap 后的 img 解码完成，再进入截图阶段
  await Promise.all(
    swapped.map(async ({ img }) => {
      try {
        await img.decode()
      } catch {
        // decode 偶发失败不致命，继续
      }
    }),
  )
  return () => {
    swapped.forEach(({ img, original }) => {
      img.src = original
    })
  }
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
  // 把图片 inline 成 data URL，规避 html2canvas clone 时的 img 加载竞态
  const restore = await inlineImagesAsDataURL(pages)
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
