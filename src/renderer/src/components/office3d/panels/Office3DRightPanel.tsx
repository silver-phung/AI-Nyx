import { MessageSquare, History, Info, PanelRightClose, PanelRightOpen } from 'lucide-react'
import type {
  OfficeDesk,
  OfficeEmployee,
  OfficeWorld,
  OfficeZone
} from '../model/office-world-types'
import type { TerminalVerificationResult } from '../model/verify-agent-terminal'
import type { DashboardCard } from '../../../../../shared/dashboard-snapshot'
import type { RightActiveTab } from '../hooks/useOffice3DLayoutState'
import { Office3DChatTab } from './Office3DChatTab'
import { Office3DSessionsTab } from './Office3DSessionsTab'
import { Office3DDetailsTab } from './Office3DDetailsTab'

export type Office3DRightPanelProps = {
  rightPanelWidth: number
  isRightPanelCollapsed: boolean
  setIsRightPanelCollapsed: React.Dispatch<React.SetStateAction<boolean>>
  rightActiveTab: RightActiveTab
  setRightActiveTab: (tab: RightActiveTab) => void
  onResizeStart: (e: React.MouseEvent) => void
  selectedEmployee: OfficeEmployee | null
  selectedDesk: { desk: OfficeDesk; zone: OfficeZone } | null
  cards: readonly DashboardCard[]
  world: OfficeWorld
  verifiedTerminal: TerminalVerificationResult
  onSelectEmployee: (employee: OfficeEmployee) => void
  onFocusAgent: (employee: OfficeEmployee) => void
  onOpenWorkspace: (worktreeId: string) => void
}

export function Office3DRightPanel({
  rightPanelWidth,
  isRightPanelCollapsed,
  setIsRightPanelCollapsed,
  rightActiveTab,
  setRightActiveTab,
  onResizeStart,
  selectedEmployee,
  selectedDesk,
  cards,
  world,
  verifiedTerminal,
  onSelectEmployee,
  onFocusAgent,
  onOpenWorkspace
}: Office3DRightPanelProps): React.JSX.Element {
  return (
    <>
      {/* Vertical Resize Divider */}
      <div
        className="w-1 bg-border/80 hover:bg-primary/70 transition-colors cursor-col-resize shrink-0 relative group"
        onMouseDown={onResizeStart}
        title="Drag to resize Right panel. Double-click to toggle collapse."
        onDoubleClick={() => setIsRightPanelCollapsed((c) => !c)}
      >
        <div className="absolute inset-y-0 -left-1 -right-1" />
      </div>

      {/* Right Column: Resizable / Collapsible Tab Panel */}
      <div
        style={{ width: isRightPanelCollapsed ? 40 : rightPanelWidth }}
        className="flex flex-col shrink-0 border-l border-border/60 bg-card overflow-hidden transition-[width] duration-75"
        data-testid="office3d-right-panel"
      >
        {/* Right Panel Header */}
        <div className="flex items-center justify-between px-2 h-10 border-b border-border/50 bg-muted/20 shrink-0 text-xs">
          {isRightPanelCollapsed ? (
            <button
              type="button"
              className="w-full h-full flex items-center justify-center text-muted-foreground hover:text-foreground"
              onClick={() => setIsRightPanelCollapsed(false)}
              title="Expand Right Panel"
            >
              <PanelRightOpen className="size-4" />
            </button>
          ) : (
            <>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-sm font-medium transition-colors ${
                    rightActiveTab === 'chat'
                      ? 'bg-background text-foreground shadow-sm border border-border/60'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => setRightActiveTab('chat')}
                >
                  <MessageSquare className="size-3.5 text-primary" />
                  <span>Chat</span>
                </button>
                <button
                  type="button"
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-sm font-medium transition-colors ${
                    rightActiveTab === 'history'
                      ? 'bg-background text-foreground shadow-sm border border-border/60'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => setRightActiveTab('history')}
                >
                  <History className="size-3.5" />
                  <span>Active Sessions</span>
                </button>
                <button
                  type="button"
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-sm font-medium transition-colors ${
                    rightActiveTab === 'details'
                      ? 'bg-background text-foreground shadow-sm border border-border/60'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => setRightActiveTab('details')}
                >
                  <Info className="size-3.5" />
                  <span>Details</span>
                </button>
              </div>
              <button
                type="button"
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                onClick={() => setIsRightPanelCollapsed(true)}
                title="Collapse Right Panel"
              >
                <PanelRightClose className="size-3.5" />
              </button>
            </>
          )}
        </div>

        {/* Right Panel Content */}
        {!isRightPanelCollapsed && (
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-sleek p-3 space-y-3">
            {rightActiveTab === 'chat' && (
              <Office3DChatTab
                selectedEmployee={selectedEmployee}
                cards={cards}
                world={world}
                verifiedTerminal={verifiedTerminal}
                isVisible={!isRightPanelCollapsed && rightActiveTab === 'chat'}
                onSelectEmployee={onSelectEmployee}
                onFocusAgent={onFocusAgent}
              />
            )}

            {rightActiveTab === 'history' && (
              <Office3DSessionsTab
                cards={cards}
                selectedEmployee={selectedEmployee}
                onSelectEmployee={onSelectEmployee}
                onFocusAgent={onFocusAgent}
                world={world}
              />
            )}

            {rightActiveTab === 'details' && (
              <Office3DDetailsTab
                selectedEmployee={selectedEmployee}
                selectedDesk={selectedDesk}
                world={world}
                onFocusAgent={onFocusAgent}
                onOpenWorkspace={onOpenWorkspace}
              />
            )}
          </div>
        )}
      </div>
    </>
  )
}
