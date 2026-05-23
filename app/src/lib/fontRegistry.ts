// FontFace 注册层：把 Blob 形态的字体注册到 document.fonts，让 CSS 里 font-family 能用到。
// 关键：同一 family 重复注册会让 document.fonts 里出现多个 FontFace 对象，浏览器虽然容忍但容易乱套，
// 所以维护一个 Map<family, FontFace> 自己管，重注册时先 delete 旧的再 add 新的。

import { listUserFonts } from './fontStore'

const registered = new Map<string, FontFace>()

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
}

export function unregisterFont(family: string) {
  const face = registered.get(family)
  if (face) {
    document.fonts.delete(face)
    registered.delete(family)
  }
}

// App 启动时调用一次，把 IndexedDB 里所有字体注册回 document.fonts
export async function loadAllUserFonts(): Promise<string[]> {
  const fonts = await listUserFonts()
  // 并发注册，单个失败不阻塞其他
  await Promise.allSettled(
    fonts.map((f) => registerFontFromBlob(f.family, f.blob)),
  )
  return fonts.map((f) => f.family)
}
