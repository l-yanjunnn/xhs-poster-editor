// v1.8.0 滚动联动协调层：主控权、rAF 合帧、程序滚动事务与防回环。
//
// 核心不变量：
// - 联动只写两个容器的 scrollTop，不碰光标、选区、正文 JSON、分页或导出 DOM
// - 程序滚动用 (target, expected) 事务记账：目标侧由程序触发的 scroll 只确认
//   到位，不反向发起新事务；用户意图信号（wheel/pointerdown/touchstart/滚动键）
//   到达任一侧时立即接管主控权，250ms 超时仅作兜底
// - 每帧最多一次测量与写入（rAF 合帧）；左右结构签名不一致时跳帧重试，
//   绝不把新锚点投到旧 DOM
// - 首尾 clamp（saturated）产生的位置差只确认事务，不反向纠偏
// - 文档 identity 变化后全量清零，第一次人工滚动前保持静止

import { useEffect, useRef } from 'react'
import {
  anchorAtScrollTop,
  measureEditorGeometry,
  measurePreviewGeometry,
  scrollTopForAnchor,
  structureSignature,
} from '@/lib/documentScrollSync'

type SyncSide = 'editor' | 'canvas'

interface ProgramScrollTransaction {
  target: SyncSide
  expected: number
  deadline: number
}

export interface UseDocumentScrollSyncOptions {
  enabled: boolean
  /** 图片缩放/对齐手势期间为 true：暂停联动，手势结束按最新布局恢复 */
  suspended: boolean
  getEditorScrollArea: () => HTMLElement | null
  getEditorRoot: () => HTMLElement | null
  getCanvasScrollPanel: () => HTMLElement | null
  getCanvasHeading: () => HTMLElement | null
  getPageElements: () => Array<HTMLElement | null>
  /** 草稿 id / 导入生成的文档 identity；变化即全量清理旧锚点与事务 */
  documentIdentity: string
  /** 页数、layoutRevision、主题等结构输入的合成串；变化时从主控侧重投影 */
  structureRevision: string
}

const CONFIRM_TOLERANCE = 1.5
const TX_TIMEOUT_MS = 250
const SIGNATURE_RETRY_LIMIT = 20
const SCROLL_INTENT_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'PageUp',
  'PageDown',
  'Home',
  'End',
  ' ',
])

export function useDocumentScrollSync(options: UseDocumentScrollSyncOptions) {
  const {
    enabled,
    suspended,
    getEditorScrollArea,
    getEditorRoot,
    getCanvasScrollPanel,
    getCanvasHeading,
    getPageElements,
    documentIdentity,
    structureRevision,
  } = options

  const masterRef = useRef<SyncSide | null>(null)
  const txRef = useRef<ProgramScrollTransaction | null>(null)
  const rafRef = useRef(0)
  const retryBudgetRef = useRef(SIGNATURE_RETRY_LIMIT)
  const suspendedRef = useRef(suspended)

  // getter props 每次渲染都是新引用；用 ref 中转让主 effect 不因此重挂监听。
  // 提交后同步（不在渲染期写 ref），事件回调读取时已是最新值。
  const gettersRef = useRef({
    getEditorScrollArea,
    getEditorRoot,
    getCanvasScrollPanel,
    getCanvasHeading,
    getPageElements,
  })
  useEffect(() => {
    suspendedRef.current = suspended
    gettersRef.current = {
      getEditorScrollArea,
      getEditorRoot,
      getCanvasScrollPanel,
      getCanvasHeading,
      getPageElements,
    }
  })

  // identity 变化 = 换草稿/导入新文稿：清空主控权与事务，
  // 等左右新 DOM 一致后保持静止，直到第一次人工滚动再建立锚点
  useEffect(() => {
    masterRef.current = null
    txRef.current = null
    window.cancelAnimationFrame(rafRef.current)
    // 必须清零：scheduleProject 以 rafRef.current 非零判断"已排帧"，
    // 幽灵 id 会让联动永久卡死。
    rafRef.current = 0
  }, [documentIdentity])

  useEffect(() => {
    if (!enabled) {
      masterRef.current = null
      txRef.current = null
      window.cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
      return
    }
    const getters = gettersRef.current
    const editorArea = getters.getEditorScrollArea()
    const canvasPanel = getters.getCanvasScrollPanel()
    if (!editorArea || !canvasPanel) return

    const elementOf = (side: SyncSide) =>
      side === 'editor' ? editorArea : canvasPanel

    const measure = (side: SyncSide) => {
      if (side === 'editor') {
        const root = gettersRef.current.getEditorRoot()
        return root ? measureEditorGeometry(editorArea, root) : null
      }
      const heading = gettersRef.current.getCanvasHeading()
      // sticky 标题用真实 rect 高度，不硬编码 58px
      const headerOffset = heading?.getBoundingClientRect().height ?? 0
      return measurePreviewGeometry(
        canvasPanel,
        gettersRef.current.getPageElements(),
        headerOffset,
      )
    }

    const project = () => {
      rafRef.current = 0
      const master = masterRef.current
      if (!master || suspendedRef.current) return
      const targetSide: SyncSide = master === 'editor' ? 'canvas' : 'editor'
      const masterGeometry = measure(master)
      const targetGeometry = measure(targetSide)
      if (!masterGeometry || !targetGeometry) return
      if (
        structureSignature(masterGeometry) !==
        structureSignature(targetGeometry)
      ) {
        // 一侧 DOM 落后（如 Tiptap 已更新而 Preview 还在上一帧）：跳帧重试
        if (retryBudgetRef.current > 0) {
          retryBudgetRef.current -= 1
          scheduleProject()
        }
        return
      }
      const anchor = anchorAtScrollTop(
        masterGeometry,
        elementOf(master).scrollTop,
      )
      if (!anchor) return
      const target = scrollTopForAnchor(targetGeometry, anchor)
      if (!target) return
      const targetElement = elementOf(targetSide)
      if (Math.abs(targetElement.scrollTop - target.scrollTop) <= 1) return
      txRef.current = {
        target: targetSide,
        expected: target.scrollTop,
        deadline: performance.now() + TX_TIMEOUT_MS,
      }
      targetElement.scrollTop = target.scrollTop
    }

    const scheduleProject = () => {
      if (rafRef.current) return
      rafRef.current = window.requestAnimationFrame(project)
    }

    const takeOver = (side: SyncSide) => {
      // 用户在目标侧动手：立即接管主控权，不让静默窗吞掉操作
      if (txRef.current?.target === side) txRef.current = null
      masterRef.current = side
      retryBudgetRef.current = SIGNATURE_RETRY_LIMIT
    }

    const handleScroll = (side: SyncSide) => {
      const tx = txRef.current
      if (tx && tx.target === side) {
        const element = elementOf(side)
        if (Math.abs(element.scrollTop - tx.expected) <= CONFIRM_TOLERANCE) {
          txRef.current = null // 程序滚动到位，只确认，不反向投影
          return
        }
        if (performance.now() <= tx.deadline) return
        // 超时兜底：事务失效，当作该侧人工滚动处理
        txRef.current = null
        masterRef.current = side
      }
      if (masterRef.current !== side) return
      retryBudgetRef.current = SIGNATURE_RETRY_LIMIT
      scheduleProject()
    }

    const listeners: Array<() => void> = []
    const on = (
      element: HTMLElement,
      type: string,
      handler: (event: Event) => void,
      options?: AddEventListenerOptions,
    ) => {
      element.addEventListener(type, handler, options)
      listeners.push(() => element.removeEventListener(type, handler, options))
    }

    for (const side of ['editor', 'canvas'] as const) {
      const element = elementOf(side)
      on(element, 'scroll', () => handleScroll(side), { passive: true })
      on(element, 'wheel', () => takeOver(side), { passive: true })
      on(
        element,
        'pointerdown',
        (event) => {
          const pointerEvent = event as PointerEvent
          // 鼠标按在内容后代上是编辑/选择，不是滚动意图；只有按在滚动容器
          // 自身（滚动条/空白槽）才接管。触摸拖动本身就是滚动，无条件接管。
          if (
            pointerEvent.pointerType === 'mouse' &&
            pointerEvent.target !== element
          ) {
            return
          }
          takeOver(side)
        },
        { passive: true },
      )
      on(element, 'touchstart', () => takeOver(side), { passive: true })
      on(element, 'keydown', (event) => {
        const key = (event as KeyboardEvent).key
        if (!SCROLL_INTENT_KEYS.has(key)) return
        // 可编辑上下文里这些键在移动光标/输入，不是滚动意图；
        // 抢主控权会违反「打字/IME 不清空选择、不移动光标」门禁
        const target = event.target
        if (
          target instanceof HTMLElement &&
          (target.isContentEditable ||
            target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT')
        ) {
          return
        }
        takeOver(side)
      })
    }

    // 分页/字体/图片/栏宽等几何变化：从当前主控侧重投影（无主控则保持静止）
    const reprojectFromMaster = () => {
      if (!masterRef.current) return
      retryBudgetRef.current = SIGNATURE_RETRY_LIMIT
      scheduleProject()
    }
    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(reprojectFromMaster)
    const editorRoot = getters.getEditorRoot()
    if (editorRoot) resizeObserver?.observe(editorRoot)
    resizeObserver?.observe(canvasPanel)
    const pagesContainer = canvasPanel.querySelector(
      '.workspace-canvas-pages',
    )
    if (pagesContainer) resizeObserver?.observe(pagesContainer)
    const handleFontsDone = () => reprojectFromMaster()
    document.fonts.addEventListener('loadingdone', handleFontsDone)

    return () => {
      for (const off of listeners) off()
      resizeObserver?.disconnect()
      document.fonts.removeEventListener('loadingdone', handleFontsDone)
      window.cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
      txRef.current = null
    }
  }, [enabled, documentIdentity])

  // 结构输入变化（页数/主题/字号/密度/layoutRevision）与手势结束：
  // 让几何缓存自然失效（本实现每帧新测），并从主控侧恢复联动
  useEffect(() => {
    if (!enabled || suspended || !masterRef.current) return
    retryBudgetRef.current = SIGNATURE_RETRY_LIMIT
    const frame = window.requestAnimationFrame(() => {
      // 触发一次与 scroll 相同的投影路径：直接派发主控侧 scroll 处理
      const master = masterRef.current
      if (!master) return
      const getters = gettersRef.current
      const element =
        master === 'editor'
          ? getters.getEditorScrollArea()
          : getters.getCanvasScrollPanel()
      element?.dispatchEvent(new Event('scroll'))
    })
    return () => window.cancelAnimationFrame(frame)
  }, [enabled, suspended, structureRevision])
}
