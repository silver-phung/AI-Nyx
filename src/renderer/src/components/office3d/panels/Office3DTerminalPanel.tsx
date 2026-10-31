import { lazy, Suspense } from 'react'
import {
  Terminal as TerminalIcon,
  FileText,
  AlertTriangle,
  Activity,
  ExternalLink,
  ChevronUp,
  ChevronDown,
  Lock,
  Unlock,
  ShieldAlert
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { OfficeEmployee } from '../model/office-world-types'
import type { TerminalVerificationResult } from '../model/verify-agent-terminal'
import type { CampusActivityEvent } from '../scene/campus/campus-events'
import type { BottomActiveTab } from '../hooks/useOffice3DLayoutState'
import { Office3DOutputTab } from './Office3DOutputTab'
import { Office3DLogsTab } from './Office3DLogsTab'

const AgentTerminalPreview = lazy(() =>
  import('../../dashboard-popout/AgentTerminalPreview').then((m) => ({
    default: m.AgentTerminalPreview
  }))
)

export type Office3DTerminalPanelProps = {
  bottomPanelHeight: number
  isBottomPanelCollapsed: boolean
  setIsBottomPanelCollapsed: React.Dispatch<React.SetStateAction<boolean>>
  bottomActiveTab: BottomActiveTab
  setBottomActiveTab: (tab: BottomActiveTab) => void
  onResizeStart: (e: React.MouseEvent) => void
  verifiedTerminal: TerminalVerificationResult
  interactiveInputUnlocked: boolean
  setInteractiveInputUnlocked: React.Dispatch<React.SetStateAction<boolean>>
  selectedEmployee: OfficeEmployee | null
  onFocusAgent: (employee: OfficeEmployee) => void
  onCloseOffice3D: () => void
  campusEvents: readonly CampusActivityEvent[]
}

export function Office3DTerminalPanel({
  bottomPanelHeight,
  isBottomPanelCollapsed,
  setIsBottomPanelCollapsed,
  bottomActiveTab,
  setBottomActiveTab,
  onResizeStart,
  verifiedTerminal,
  interactiveInputUnlocked,
  setInteractiveInputUnlocked,
  selectedEmployee,
  onFocusAgent,
  onCloseOffice3D,
  campusEvents
}: Office3DTerminalPanelProps): React.JSX.Element {
  return (
    <>
      {/* Horizontal Resize Divider */}
      <div
        className="h-1 bg-border/80 hover:bg-primary/70 transition-colors cursor-row-resize shrink-0 relative group"
        onMouseDown={onResizeStart}
        title="Drag to resize Terminal panel. Double-click to toggle collapse."
        onDoubleClick={() => setIsBottomPanelCollapsed((c) => !c)}
      >
        <div className="absolute inset-x-0 -top-1 -bottom-1" />
      </div>

      {/* Center Bottom: Resizable / Collapsible Terminal & Output Panel */}
      <div
        style={{ height: isBottomPanelCollapsed ? 36 : bottomPanelHeight }}
        className="flex flex-col shrink-0 border-t border-border/60 bg-background overflow-hidden transition-[height] duration-75"
        data-testid="office3d-terminal-panel"
      >
        {/* Bottom Tab Bar */}
        <div className="flex items-center justify-between gap-2 px-3 h-9 border-b border-border/50 bg-muted/30 shrink-0 text-xs whitespace-nowrap">
          <div className="flex min-w-0 items-center gap-1 overflow-x-auto scrollbar-none">
            <button
              type="button"
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-sm font-medium transition-colors ${
                bottomActiveTab === 'terminal'
                  ? 'bg-background text-foreground shadow-sm border border-border/60'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => {
                setBottomActiveTab('terminal')
                setIsBottomPanelCollapsed(false)
              }}
            >
              <TerminalIcon className="size-3.5 text-primary" />
              <span>Terminal</span>
              {verifiedTerminal.status === 'verified' && (
                <span
                  className="size-1.5 rounded-full bg-emerald-400"
                  title="Verified PTY stream attached"
                />
              )}
            </button>
            <button
              type="button"
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-sm font-medium transition-colors ${
                bottomActiveTab === 'output'
                  ? 'bg-background text-foreground shadow-sm border border-border/60'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => {
                setBottomActiveTab('output')
                setIsBottomPanelCollapsed(false)
              }}
            >
              <FileText className="size-3.5" />
              <span>Task Summary</span>
            </button>
            <button
              type="button"
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-sm font-medium transition-colors ${
                bottomActiveTab === 'problems'
                  ? 'bg-background text-foreground shadow-sm border border-border/60'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => {
                setBottomActiveTab('problems')
                setIsBottomPanelCollapsed(false)
              }}
            >
              <AlertTriangle className="size-3.5" />
              <span>Problems</span>
              <span className="text-[10px] px-1 py-0.2 rounded-full bg-muted text-muted-foreground">
                --
              </span>
            </button>
            <button
              type="button"
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-sm font-medium transition-colors ${
                bottomActiveTab === 'logs'
                  ? 'bg-background text-foreground shadow-sm border border-border/60'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => {
                setBottomActiveTab('logs')
                setIsBottomPanelCollapsed(false)
              }}
            >
              <Activity className="size-3.5" />
              <span>Logs</span>
              {campusEvents.length > 0 && (
                <span className="text-[10px] px-1 py-0.2 rounded-full bg-primary/20 text-primary font-mono">
                  {campusEvents.length}
                </span>
              )}
            </button>
          </div>

          {/* Right actions in bottom tab bar */}
          <div className="flex items-center gap-2">
            {selectedEmployee && (
              <span className="text-[11px] text-muted-foreground truncate max-w-[200px]">
                Target:{' '}
                <span className="text-foreground font-medium">
                  {selectedEmployee.task || selectedEmployee.paneKey}
                </span>
              </span>
            )}
            {selectedEmployee?.isRoutable && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px] text-primary hover:text-primary hover:bg-primary/10"
                onClick={() => onFocusAgent(selectedEmployee)}
                title="Open full interactive workbench in Classic View (Enter)"
              >
                <ExternalLink className="size-3 mr-1" />
                <span>Focus in Classic</span>
              </Button>
            )}
            <button
              type="button"
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              onClick={() => setIsBottomPanelCollapsed((c) => !c)}
              title={isBottomPanelCollapsed ? 'Expand panel' : 'Collapse panel'}
            >
              {isBottomPanelCollapsed ? (
                <ChevronUp className="size-3.5" />
              ) : (
                <ChevronDown className="size-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Bottom Tab Content (only when not collapsed) */}
        {!isBottomPanelCollapsed && (
          <div className="flex-1 min-h-0 overflow-hidden bg-background">
            {bottomActiveTab === 'terminal' &&
              (verifiedTerminal.status === 'verified' ? (
                <div className="flex flex-col h-full overflow-hidden">
                  {/* Stream safety & interactive input bar */}
                  <div className="flex items-center justify-between px-3 py-1 bg-muted/40 border-b border-border/40 text-[11px] shrink-0">
                    <div className="flex items-center gap-2">
                      {verifiedTerminal.isSafeForDirectInput ? (
                        interactiveInputUnlocked ? (
                          <span className="flex items-center gap-1 text-emerald-400 font-medium">
                            <Unlock className="size-3" />
                            <span>Interactive Input Active</span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-muted-foreground font-medium">
                            <Lock className="size-3" />
                            <span>Protected Stream · Read-Only</span>
                          </span>
                        )
                      ) : (
                        <span className="flex items-center gap-1 text-amber-400 font-medium">
                          <ShieldAlert className="size-3" />
                          <span>
                            Read-Only Stream ·{' '}
                            {verifiedTerminal.isRemote ? 'Remote Host (SSH/WSL)' : 'Multi-Pane'}
                          </span>
                        </span>
                      )}
                      <span className="text-muted-foreground font-mono text-[10px]">
                        PTY: {verifiedTerminal.ptyId}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {verifiedTerminal.isSafeForDirectInput && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-5 px-2 text-[10px]"
                          onClick={() => setInteractiveInputUnlocked((u) => !u)}
                        >
                          {interactiveInputUnlocked ? 'Lock Stream' : 'Enable Terminal Input'}
                        </Button>
                      )}
                      {selectedEmployee?.isRoutable && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 px-2 text-[10px] text-primary hover:text-primary"
                          onClick={() => onFocusAgent(selectedEmployee)}
                          title="Open full interactive session in Classic Workbench (Enter)"
                        >
                          <ExternalLink className="size-2.5 mr-1" />
                          <span>Open in Classic</span>
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 min-h-0 h-full w-full overflow-hidden">
                    <Suspense
                      fallback={
                        <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                          Connecting to verified terminal stream...
                        </div>
                      }
                    >
                      <AgentTerminalPreview
                        ptyId={verifiedTerminal.ptyId}
                        terminalInput={verifiedTerminal.terminalInput}
                        readOnly={
                          !verifiedTerminal.isSafeForDirectInput || !interactiveInputUnlocked
                        }
                        disableAutoFocus={true}
                        className="h-full w-full min-h-0 flex-1"
                      />
                    </Suspense>
                  </div>
                </div>
              ) : verifiedTerminal.status === 'no_agent' ? (
                <div className="flex flex-col items-center justify-center h-full p-4 text-center text-xs space-y-3 bg-muted/5">
                  <div className="p-3 rounded-full bg-muted/40 text-muted-foreground">
                    <TerminalIcon className="size-6" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">No Agent Selected</p>
                    <p className="text-muted-foreground max-w-sm">
                      Click any agent in the 3D Campus or pick an active session to attach its
                      verified terminal.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full p-4 text-center text-xs space-y-3 bg-muted/5">
                  <div className="p-3 rounded-full bg-amber-500/10 text-amber-400">
                    <AlertTriangle className="size-6" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">
                      No verified terminal for this agent
                    </p>
                    <p className="text-muted-foreground max-w-sm">{verifiedTerminal.reason}</p>
                  </div>
                  {selectedEmployee?.isRoutable && (
                    <Button size="sm" onClick={() => onFocusAgent(selectedEmployee)}>
                      <ExternalLink className="size-3.5 mr-1.5" />
                      <span>Open in Classic Workbench</span>
                    </Button>
                  )}
                </div>
              ))}

            {bottomActiveTab === 'output' && (
              <Office3DOutputTab selectedEmployee={selectedEmployee} />
            )}

            {bottomActiveTab === 'problems' && (
              <div className="flex flex-col items-center justify-center h-full p-4 text-center text-xs space-y-3 bg-muted/5">
                <AlertTriangle className="size-8 text-muted-foreground/60" />
                <div className="space-y-1">
                  <p className="font-medium text-foreground">No Diagnostic Source Connected</p>
                  <p className="text-muted-foreground max-w-sm">
                    Workspace diagnostics and problem reporting are not attached to this 3D preview.
                    To inspect workspace problems, open the Classic Workbench.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={onCloseOffice3D}>
                  <ExternalLink className="size-3.5 mr-1.5" />
                  <span>Open Classic Workbench</span>
                </Button>
              </div>
            )}

            {bottomActiveTab === 'logs' && <Office3DLogsTab campusEvents={campusEvents} />}
          </div>
        )}
      </div>
    </>
  )
}
