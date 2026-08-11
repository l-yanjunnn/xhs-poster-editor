// FontFace 注册层：把 Blob 形态的字体注册到 document.fonts，让 CSS 里 font-family 能用到。
// 关键：同一 family 重复注册会让 document.fonts 里出现多个 FontFace 对象，浏览器虽然容忍但容易乱套，
// 所以维护一个 Map<family, FontFace> 自己管，重注册时先 delete 旧的再 add 新的。

import { listUserFonts } from './fontStore'
import { clearTypographyMetricsCache } from './typographyMetrics'

const registered = new Map<string, FontFace>()
// Why 同时存 blob URL：FontFace API 注册不产生 CSS 规则，导出时 exportPng 的
// collectAllCss() 拿不到用户字体，cloned iframe 里布局/渲染会回退到 fallback 字体。
// 每个用户字体额外持有一个 blob URL，导出时以 @font-face 文本注入 cloned doc
//（about:blank iframe 与主文档同源，blob URL 可正常加载）
const fontUrls = new Map<string, string>()
let registryRevision = 0
const revisionListeners = new Set<() => void>()

function commitFontRegistryMutation() {
  // computed font-family 是完整 stack（如 `"Foo", sans-serif`），按用户
  // family `Foo` 精确清理会漏掉。字体库变更频率很低，直接清全部
  // Document 缓存才能保证同名字体覆盖后立即使用新字形。
  clearTypographyMetricsCache()
  registryRevision += 1
  revisionListeners.forEach((listener) => listener())
}

export function getFontRegistryRevision(): number {
  return registryRevision
}

export function subscribeFontRegistryRevision(listener: () => void): () => void {
  revisionListeners.add(listener)
  return () => {
    revisionListeners.delete(listener)
  }
}

export async function registerFontFromBlob(
  family: string,
  blob: Blob,
): Promise<void> {
  const ab = await blob.arrayBuffer()
  const face = new FontFace(family, ab)
  await face.load()
  const old = registered.get(family)
  if (old) document.fonts.delete(old)
  document.fonts.add(face)
  registered.set(family, face)

  const oldUrl = fontUrls.get(family)
  if (oldUrl) URL.revokeObjectURL(oldUrl)
  fontUrls.set(family, URL.createObjectURL(blob))
  commitFontRegistryMutation()
}

export function unregisterFont(family: string) {
  let changed = false
  const face = registered.get(family)
  if (face) {
    document.fonts.delete(face)
    registered.delete(family)
    changed = true
  }
  const url = fontUrls.get(family)
  if (url) {
    URL.revokeObjectURL(url)
    fontUrls.delete(family)
    changed = true
  }
  if (changed) commitFontRegistryMutation()
}

// 导出用：所有已注册用户字体的 @font-face 规则文本（注入 cloned iframe）
export function getUserFontFaceCss(): string {
  return Array.from(fontUrls.entries())
    .map(
      ([family, url]) =>
        `@font-face{font-family:${JSON.stringify(family)};src:url(${JSON.stringify(url)});font-display:block}`,
    )
    .join('\n')
}

// App 启动时调用一次，把 IndexedDB 里所有字体注册回 document.fonts
// 只返回注册成功的 family：损坏字体不进字体下拉（选了也没效果，徒增困惑）
export async function loadAllUserFonts(): Promise<string[]> {
  return (await loadAllUserFontsWithReport()).families
}

export interface UserFontLoadReport {
  families: string[]
  failedFamilies: string[]
}

export async function loadAllUserFontsWithReport(): Promise<UserFontLoadReport> {
  const fonts = await listUserFonts()
  // 并发注册，单个失败不阻塞其他
  const results = await Promise.allSettled(
    fonts.map((f) => registerFontFromBlob(f.family, f.blob)),
  )
  const families = fonts
    .filter((_, i) => results[i].status === 'fulfilled')
    .map((f) => f.family)
  const failedFamilies = fonts
    .filter((_, i) => results[i].status === 'rejected')
    .map((f) => f.family)
  return { families, failedFamilies }
}
