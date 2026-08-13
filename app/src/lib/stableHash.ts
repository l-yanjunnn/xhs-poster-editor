/**
 * 快照 hash 与毫像素取整的唯一实现。
 *
 * 快照 hash 是「预览 = 导出」契约的核心：deterministicTextLayout 的行级
 * 快照、deterministicTypography 的 snapshotId / 导出基线 hash 必须逐位
 * 一致才能互相核验。此前三处各持一份拷贝，任何一处的无意分叉都会变成
 * 最难排查的 snapshot mismatch，因此集中到这一个模块。
 */

/** FNV-1a 32 位，输出 8 位十六进制。 */
export function fnv1a32Hex(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/** 数值取整到毫像素，消除跨引擎浮点尾差；序列化与 CSS 输出共用。 */
export function roundToMilliPx(value: number): number {
  return Math.round(value * 1_000) / 1_000
}
