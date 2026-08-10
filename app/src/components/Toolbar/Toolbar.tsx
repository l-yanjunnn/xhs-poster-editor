import {
  Crop,
  Download,
  FileText,
  Grid3X3,
  Magnet,
  Redo2,
  Undo2,
} from 'lucide-react'

export type DraftSaveStatus =
  | 'restoring'
  | 'pending'
  | 'saving'
  | 'saved'
  | 'error'

interface Props {
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  activeDocumentTitle: string
  draftSaveStatus: DraftSaveStatus
  draftSaveError: string | null
  onOpenDraftLibrary: () => void
  cropGuideOn: boolean
  onToggleCropGuide: () => void
  layoutGuidesOn: boolean
  onToggleLayoutGuides: () => void
  snapEnabled: boolean
  onToggleSnap: () => void
  onExport: () => void
  exportDisabled?: boolean
  exportDisabledReason?: string
}

export function Toolbar(props: Props) {
  return (
    <header className="workspace-topbar">
      <div className="topbar-brand" aria-label="小红书长图排版">
        <span className="topbar-brand-mark" aria-hidden="true">
          小红书
        </span>
        <span className="topbar-brand-name">小红书长图排版</span>
        <span className="topbar-version">v{__APP_VERSION__}</span>
      </div>

      <div className="topbar-actions">
        <div className="topbar-history" role="group" aria-label="撤销与重做">
          <IconAction
            label="撤销"
            disabled={!props.canUndo}
            disabledReason="暂无可撤销的操作"
            onClick={props.onUndo}
          >
            <Undo2 />
          </IconAction>
          <span className="topbar-action-divider" />
          <IconAction
            label="重做"
            disabled={!props.canRedo}
            disabledReason="暂无可重做的操作"
            onClick={props.onRedo}
          >
            <Redo2 />
          </IconAction>
        </div>

        <DraftStatus
          status={props.draftSaveStatus}
          error={props.draftSaveError}
          title={props.activeDocumentTitle}
        />

        <button
          type="button"
          className="topbar-secondary-action"
          onClick={props.onOpenDraftLibrary}
          aria-label="打开草稿管理"
        >
          <FileText aria-hidden="true" />
          <span>草稿</span>
        </button>

        <TopbarSwitch
          label="裁切参考"
          checked={props.cropGuideOn}
          onClick={props.onToggleCropGuide}
          icon={<Crop />}
        />
        <TopbarSwitch
          label="排版参考"
          checked={props.layoutGuidesOn}
          onClick={props.onToggleLayoutGuides}
          icon={<Grid3X3 />}
        />
        <TopbarSwitch
          label="磁吸"
          checked={props.snapEnabled}
          onClick={props.onToggleSnap}
          icon={<Magnet />}
        />

        <button
          type="button"
          className="topbar-export"
          onClick={props.onExport}
          disabled={props.exportDisabled}
          title={props.exportDisabled ? props.exportDisabledReason : '导出 PNG'}
        >
          <Download aria-hidden="true" />
          <span>导出 PNG</span>
        </button>
      </div>
    </header>
  )
}

function IconAction({
  label,
  disabled,
  disabledReason,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  disabledReason: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      className="topbar-icon-action"
      aria-label={label}
      disabled={disabled}
      title={disabled ? disabledReason : label}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function TopbarSwitch({
  label,
  checked,
  onClick,
  icon,
}: {
  label: string
  checked: boolean
  onClick: () => void
  icon: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className="topbar-switch"
      onClick={onClick}
      title={`${checked ? '关闭' : '开启'}${label}`}
    >
      <span className="topbar-switch-icon" aria-hidden="true">
        {icon}
      </span>
      <span>{label}</span>
      <span className="topbar-switch-track" aria-hidden="true">
        <span className="topbar-switch-thumb" />
      </span>
    </button>
  )
}

function DraftStatus({
  status,
  error,
  title,
}: {
  status: DraftSaveStatus
  error: string | null
  title: string
}) {
  const presentation: Record<
    DraftSaveStatus,
    { label: string; tone: string }
  > = {
    restoring: { label: '正在恢复…', tone: 'is-working' },
    pending: { label: '待保存', tone: 'is-pending' },
    saving: { label: '保存中…', tone: 'is-working' },
    saved: { label: '已保存', tone: 'is-saved' },
    error: { label: '保存失败', tone: 'is-error' },
  }
  const current = presentation[status]
  return (
    <div
      className={`topbar-save-status ${current.tone}`}
      role={status === 'error' || status === 'saved' ? 'status' : undefined}
      title={error ?? `${title}·${current.label}`}
    >
      <span className="topbar-save-dot" aria-hidden="true" />
      <span>{current.label}</span>
    </div>
  )
}
