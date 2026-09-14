import { buildExportBatchCss, renderPagePngBlob } from './exportPng'
import { captureRenderContract, assertRenderContract } from './renderContract'
import { captureExpectedGlyphPaints } from './canvasPaintContract'
import { getFontRegistryRevision, getUserFontResourceUrls } from './fontRegistry'
import { fnv1a32Hex } from './stableHash'
import { inspectPageGeometry, type PageGeometryIssue } from './pageGeometry'

export const CLIPPING_PREVIEW_MARGIN = 160
export interface VerifiedExportPage { pageNumber: number; blob: Blob; sha256: string; previewUrl: string; clipping?: { previewUrl: string; issues: PageGeometryIssue[] } }
export interface VerifiedExport {
  inputVersion: string
  allowWarnings: boolean
  allowCanvasClipping?: boolean
  confirmCanvasClipping?: () => void
  pages: VerifiedExportPage[]
  metadata: { canvasClipping?: { confirmedAt: string | null; pages: Array<{ pageNumber: number; issues: PageGeometryIssue[] }> }; appVersion: string; renderer: string; inputVersion: string; rootStyleHash: string; cssHash: string; pageOrder: number[]; resources: Array<{ url: string; sha256: string }>; pages: Array<{ pageNumber: number; snapshot: string; geometryHash: string; pngSha256: string; glyphCount: number; pixelCheckedGlyphs: number }> }
  assertCurrent: () => void
  dispose: () => void
}

async function sha256(blob: Blob): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('')
}

/** Freeze once, verify every renderer result, then deliver exactly these PNG bytes. */
export async function prepareVerifiedExport(
  sourcePages: readonly HTMLElement[], pageNumbers: number[], inputVersion: string,
  allowWarnings: boolean, onProgress?: (current: number, total: number) => void,
  allowCanvasClipping = false,
): Promise<VerifiedExport> {
  let disposed = false
  const rootStyle = document.documentElement.getAttribute('style') ?? ''
  const fontRevision = getFontRegistryRevision()
  const cssText = buildExportBatchCss()
  const selected = pageNumbers.map(pageNumber => sourcePages[pageNumber - 1])
  const frozen = selected.map(page => {
    const contract = captureRenderContract(page)
    const paints = captureExpectedGlyphPaints(page)
    const clone = page.cloneNode(true) as HTMLElement
    const nodes = [page, ...page.querySelectorAll<HTMLElement>('*')]
    const copies = [clone, ...clone.querySelectorAll<HTMLElement>('*')]
    nodes.forEach((node, index) => {
      const style = getComputedStyle(node)
      for (const property of ['font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'color']) {
        copies[index].style.setProperty(property, style.getPropertyValue(property))
      }
    })
    return { page, clone, contract, paints, clippingIssues: inspectPageGeometry(page).filter(issue => issue.code === 'content-clipped'), snapshot: page.dataset.layoutSnapshot ?? '' }
  })
  const assertCurrent = () => {
    if (disposed || rootStyle !== (document.documentElement.getAttribute('style') ?? '') || fontRevision !== getFontRegistryRevision() ||
      frozen.some(item => !item.page.isConnected || item.snapshot !== item.page.dataset.layoutSnapshot || item.page.dataset.layoutSnapshotPhase !== 'sealed')) {
      throw new Error('文稿、样式或资源已改变，旧成品已失效，请重新生成成品预览')
    }
    frozen.forEach(item => assertRenderContract(item.contract, captureRenderContract(item.page), '成品有效性复核'))
  }
  const urls = new Set<string>([
    ...getUserFontResourceUrls(),
    ...performance.getEntriesByType('resource').map(entry => entry.name).filter(url => /\.(woff2?|ttf|otf)(?:[?#]|$)/i.test(url)),
    ...selected.flatMap(page => [...page.querySelectorAll<HTMLImageElement>('img')].map(image => image.currentSrc || image.src)),
  ].filter(Boolean))
  const pinned = new Map<string, string>()
  const resourceVersions: Array<{ url: string; sha256: string }> = []
  const pages: VerifiedExportPage[] = []
  const cleanup = () => {
    disposed = true
    for (const url of pinned.values()) URL.revokeObjectURL(url)
    for (const page of pages) { URL.revokeObjectURL(page.previewUrl); if (page.clipping) URL.revokeObjectURL(page.clipping.previewUrl) }
  }
  try {
    // Fetch only already used resource URLs; all operations are reads. Pin their bytes
    // into this batch so an external resource or same-family replacement cannot mix versions.
    for (const url of urls) {
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) })
      if (!response.ok) throw new Error(`无法固定导出资源版本：${url}`)
      const blob = await response.blob()
      resourceVersions.push({ url: `${new URL(url).protocol}//resource-${resourceVersions.length + 1}`, sha256: await sha256(blob) })
      pinned.set(url, URL.createObjectURL(blob))
    }
    assertCurrent()
    const frozenCss = cssText.replace(/url\(([^)]+)\)/g, (whole, value: string) => {
      const raw = value.trim().replace(/^["']|["']$/g, '')
      const absolute = new URL(raw, document.baseURI).href
      return pinned.has(absolute) ? `url("${pinned.get(absolute)}")` : whole
    })
    const metadata: VerifiedExport['metadata'] = {
      appVersion: __APP_VERSION__, renderer: 'html2canvas-pro@2.0.2 / verified-boundary-v1', inputVersion: fnv1a32Hex(inputVersion),
      rootStyleHash: fnv1a32Hex(rootStyle), cssHash: fnv1a32Hex(cssText), pageOrder: [...pageNumbers], resources: resourceVersions, pages: [],
    }
    if (allowCanvasClipping) metadata.canvasClipping = { confirmedAt: null, pages: frozen.flatMap((item, index) => item.clippingIssues.length ? [{ pageNumber: pageNumbers[index], issues: item.clippingIssues }] : []) }
    for (let index = 0; index < frozen.length; index += 1) {
      assertCurrent()
      const item = frozen[index]
      const contract = structuredClone(item.contract)
      for (const image of item.clone.querySelectorAll<HTMLImageElement>('img')) {
        const original = image.src, replacement = pinned.get(original)
        if (!replacement) throw new Error('图片资源未包含在导出版本中')
        image.src = replacement
        for (const node of contract.nodes) {
          if (node.image?.startsWith(`${original}|`)) node.image = replacement + node.image.slice(original.length)
        }
      }
      const blob = await renderPagePngBlob(item.clone, { allowWarnings, allowCanvasClipping, cssText: frozenCss, frozen: { contract, paints: item.paints, rootStyle } })
      const hash = await sha256(blob)
      pages.push({ pageNumber: pageNumbers[index], blob, sha256: hash, previewUrl: URL.createObjectURL(blob) })
      if (allowCanvasClipping && item.clippingIssues.length) {
        const evidence = await renderPagePngBlob(item.clone, { allowWarnings, allowCanvasClipping, clippingPreviewMargin: CLIPPING_PREVIEW_MARGIN, cssText: frozenCss, frozen: { contract, paints: item.paints, rootStyle } })
        pages.at(-1)!.clipping = { previewUrl: URL.createObjectURL(evidence), issues: item.clippingIssues }
      }
      metadata.pages.push({ pageNumber: pageNumbers[index], snapshot: item.snapshot, geometryHash: fnv1a32Hex(JSON.stringify(item.contract)), pngSha256: hash, glyphCount: item.paints.length, pixelCheckedGlyphs: item.paints.filter(paint => paint.samples?.length).length })
      onProgress?.(index + 1, frozen.length)
    }
    assertCurrent()
    frozen.forEach(item => assertRenderContract(item.contract, captureRenderContract(item.page), '导出输入复核'))
    // PNGs no longer depend on source assets. Release the temporary pinned resource URLs.
    for (const url of pinned.values()) URL.revokeObjectURL(url)
    pinned.clear()
    return { inputVersion, allowWarnings, allowCanvasClipping, pages, metadata, assertCurrent, dispose: cleanup,
      confirmCanvasClipping: () => { assertCurrent(); if (metadata.canvasClipping) metadata.canvasClipping.confirmedAt = new Date().toISOString() },
    }
  } catch (error) {
    cleanup()
    throw error
  }
}
