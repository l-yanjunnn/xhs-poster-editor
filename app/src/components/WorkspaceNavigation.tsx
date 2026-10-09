import { useSyncExternalStore } from 'react'

export type WorkspacePanel = 'editor' | 'canvas' | 'inspector'

const COMPACT_WORKSPACE_QUERY = '(max-width: 1279px)'

function compactWorkspaceSnapshot(): boolean {
  return typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(COMPACT_WORKSPACE_QUERY).matches
}

function subscribeCompactWorkspace(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => undefined
  }
  const media = window.matchMedia(COMPACT_WORKSPACE_QUERY)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

function serverCompactWorkspaceSnapshot(): boolean {
  return false
}

// The navigation and its viewport hook share the same small public module.
// eslint-disable-next-line react-refresh/only-export-components
export function useCompactWorkspace(): boolean {
  return useSyncExternalStore(
    subscribeCompactWorkspace,
    compactWorkspaceSnapshot,
    serverCompactWorkspaceSnapshot,
  )
}

interface Props {
  activePanel: WorkspacePanel
  onPanelChange: (panel: WorkspacePanel) => void
}

const panels: ReadonlyArray<{ value: WorkspacePanel; label: string }> = [
  { value: 'editor', label: '正文' },
  { value: 'canvas', label: '预览' },
  { value: 'inspector', label: '字号与设置' },
]

export function WorkspaceNavigation({ activePanel, onPanelChange }: Props) {
  return (
    <nav className="workspace-panel-navigation" aria-label="工作区域">
      {panels.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          aria-pressed={activePanel === value}
          aria-controls={`workspace-${value}`}
          onClick={() => onPanelChange(value)}
        >
          {label}
        </button>
      ))}
    </nav>
  )
}
