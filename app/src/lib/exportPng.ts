import html2canvas from 'html2canvas-pro'
import JSZip from 'jszip'

// 把 .page 截成 PNG Blob。
// scale: 2 是为了输出 2160×3840 的高清图（小红书也用得上）。
//
// 修法 v4：deep clone .page-wrapper 到 document.body 上 + position: fixed +
// opacity: 0，让截图对象完全脱离原 React 渲染树的 flex 父容器和 transform: scale(0.4)
// 干扰。html2canvas 内部 parseBounds 拿到的 bbox 因此稳定为 (0, 0, 1080, 1920)，
// 不再受 cloned iframe 里 layout race 影响。
//
// 历史失败修法：
// - v1 传 width/height: canvas 尺寸对了，但 parseBounds 的 left/top 仍 race，
//   内容渲染到画面外 → 9/25 异常
// - v2 onclone 改 cloned .page inline: cloned doc 里 measure 时机和 onclone 之间
//   layout 不稳定，依然 race → 5/25 异常
// - v3 改源 DOM 锁所有 page-wrapper: 5 个 page 同时撑满让 cloned doc layout 更乱
//   → 14/25 异常（比 baseline 更差）
async function pageToPngBlob(originalPage: HTMLElement): Promise<Blob> {
  const originalWrapper = originalPage.parentElement
  if (!originalWrapper) {
    throw new Error('page 没有 .page-wrapper 父容器')
  }
  // 深 clone .page-wrapper 整个子树（含 .page 和所有 children）
  const cloneWrapper = originalWrapper.cloneNode(true) as HTMLElement
  // 脱离任何父容器布局：fixed + 左上角 + 取消 scale + 取消 margin
  cloneWrapper.style.position = 'fixed'
  cloneWrapper.style.top = '0'
  cloneWrapper.style.left = '0'
  cloneWrapper.style.transform = 'none'
  cloneWrapper.style.margin = '0'
  // inline 写死 width/height，绕过 var(--canvas-w/h) 在 cloned iframe 里的 race
  cloneWrapper.style.width = '1080px'
  cloneWrapper.style.height = '1920px'
  // 用户看不到，但仍参与 layout（visibility: hidden 会让 layout 算 0×0）
  cloneWrapper.style.opacity = '0'
  cloneWrapper.style.pointerEvents = 'none'
  // 藏在所有内容下，避免万一 opacity: 0 不阻断 hit-test
  cloneWrapper.style.zIndex = '-1'
  document.body.appendChild(cloneWrapper)

  const clonePage = cloneWrapper.querySelector<HTMLElement>('.page')
  if (!clonePage) {
    document.body.removeChild(cloneWrapper)
    throw new Error('clone .page-wrapper 后找不到 .page')
  }
  // 同样 inline 写死 .page，不依赖 CSS var
  clonePage.style.width = '1080px'
  clonePage.style.height = '1920px'

  // 强制一次 reflow，确保 fixed 定位生效
  void cloneWrapper.offsetHeight

  try {
    const canvas = await html2canvas(clonePage, {
      scale: 2,
      backgroundColor: null,
      useCORS: true,
      onclone: (clonedDoc) => {
        // 参考线只服务于预览，不进入导出图
        clonedDoc.querySelectorAll<HTMLElement>('.guide').forEach((g) => g.remove())
      },
    })
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('toBlob 返回 null'))),
        'image/png',
      )
    })
  } finally {
    document.body.removeChild(cloneWrapper)
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
