import { useEffect, useState } from 'react'

export type WriterLeaseState = 'checking' | 'owned' | 'conflict' | 'unsupported'

const WRITER_LOCK_NAME = 'xhs-poster-editor-single-writer-v1'
const WRITER_LOCK_RETRY_MS = 1_000

/**
 * 同一浏览器来源只允许一个可写标签页。Web Locks 由浏览器原子仲裁，
 * 页面关闭/崩溃时会自动释放，不存在 localStorage read→set 的双赢窗口。
 *
 * （M7 拆分第一步：逻辑自 App.tsx 原样抽出，行为零变化。）
 */
export function useWriterLease(): WriterLeaseState {
  const [writerLeaseState, setWriterLeaseState] =
    useState<WriterLeaseState>('checking')

  useEffect(() => {
    let disposed = false
    let retryTimer: number | null = null
    let releaseCurrentLock: (() => void) | null = null

    function transition(next: WriterLeaseState) {
      setWriterLeaseState(next)
    }

    function scheduleRetry() {
      if (disposed || retryTimer !== null) return
      retryTimer = window.setTimeout(() => {
        retryTimer = null
        requestWriterLock()
      }, WRITER_LOCK_RETRY_MS)
    }

    function requestWriterLock() {
      if (disposed) return
      if (!('locks' in navigator)) {
        console.error('当前浏览器不支持 Web Locks，已禁止写入以保护草稿')
        transition('unsupported')
        return
      }

      void navigator.locks
        .request(
          WRITER_LOCK_NAME,
          { mode: 'exclusive', ifAvailable: true },
          async (lock) => {
            if (disposed) return
            if (!lock) {
              transition('conflict')
              scheduleRetry()
              return
            }

            // 冲突页此前从未 bootstrap；拿到锁后才读取最新 IDB，
            // 不需要带着可能陈旧的内存内容继续编辑。
            transition('owned')
            await new Promise<void>((resolve) => {
              releaseCurrentLock = resolve
            })
            releaseCurrentLock = null
          },
        )
        .catch((error) => {
          if (disposed) return
          console.error('无法建立浏览器原子写锁，已禁止写入以保护草稿', error)
          transition('unsupported')
        })
    }

    function releaseLock() {
      releaseCurrentLock?.()
      releaseCurrentLock = null
    }

    requestWriterLock()
    window.addEventListener('pagehide', releaseLock)
    return () => {
      disposed = true
      if (retryTimer !== null) window.clearTimeout(retryTimer)
      window.removeEventListener('pagehide', releaseLock)
      releaseLock()
    }
  }, [])

  return writerLeaseState
}
