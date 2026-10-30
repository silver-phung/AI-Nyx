import { useMemo, useState } from 'react'
import { AlertCircle, MessageSquare, FileText, ShieldAlert, Lock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import { STATUS_COLORS } from '../scene/OfficeTheme'
import type { OfficeEmployee, OfficeWorld } from '../model/office-world-types'
import type { TerminalVerificationResult } from '../model/verify-agent-terminal'
import type { DashboardCard } from '../../../../../shared/dashboard-snapshot'
import type { TuiAgent } from '../../../../../shared/tui-agent'
import { isTuiAgent } from '../../../../../shared/tui-agent-config'
import NativeChatView from '../../native-chat/NativeChatView'
import {
  structuredAgentSessionOwnerForTab,
  structuredAgentSessionTargetForHost
} from '@/runtime/structured-agent-session-owner'
import type { Tab } from '../../../../../shared/tab-types'
import { isStructuredTab } from '../../../../../shared/structured-agent-session-tab'
import { LOCAL_EXECUTION_HOST_ID } from '../../../../../shared/execution-host'
import { Office3DChatSummaryView } from './Office3DChatSummaryView'
import { Office3DFleetOverview } from './Office3DFleetOverview'

const EMPTY_TABS_BY_WORKTREE: Record<string, Tab[]> = Object.freeze({})
const EMPTY_TAB_ARRAY: readonly Tab[] = Object.freeze([])

export type Office3DChatTabProps = {
  selectedEmployee: OfficeEmployee | null
  cards: readonly DashboardCard[]
  world: OfficeWorld
  verifiedTerminal: TerminalVerificationResult
  isVisible: boolean
  onSelectEmployee: (employee: OfficeEmployee) => void
  onFocusAgent: (employee: OfficeEmployee) => void
}

export function Office3DChatTab({
  selectedEmployee,
  cards,
  world,
  verifiedTerminal,
  isVisible,
  onSelectEmployee,
  onFocusAgent
}: Office3DChatTabProps): React.JSX.Element {
  const tabsByWorktree = useAppStore((s) => s.unifiedTabsByWorktree ?? EMPTY_TABS_BY_WORKTREE)
  const isNativeChatApiAvailable = typeof window !== 'undefined' && Boolean(window.api?.nativeChat)

  // Default to 'live' when nativeChat API is present (desktop Electron), otherwise 'summary'
  const [chatViewMode, setChatViewMode] = useState<'live' | 'summary'>(
    isNativeChatApiAvailable ? 'live' : 'summary'
  )

  // Lookup the backing tab for the selected agent
  const backingTab = useMemo(() => {
    if (!selectedEmployee) {
      return null
    }
    const worktreeId = selectedEmployee.revealTarget?.worktreeId ?? selectedEmployee.zoneId
    const worktreeTabs = (worktreeId ? tabsByWorktree[worktreeId] : undefined) ?? EMPTY_TAB_ARRAY
    return worktreeTabs.find((t) => t.id === selectedEmployee.tabId) ?? null
  }, [selectedEmployee, tabsByWorktree])

  // Resolve structured session target if tab is structured
  const isStructured = Boolean(backingTab && isStructuredTab(backingTab))
  const structuredOwner = useAppStore((state) =>
    backingTab && isStructuredTab(backingTab)
      ? structuredAgentSessionOwnerForTab(state, backingTab)
      : null
  )
  const structuredTarget = useMemo(
    () => (structuredOwner ? structuredAgentSessionTargetForHost(structuredOwner) : null),
    [structuredOwner]
  )

  // Resolve valid TUI agent without arbitrary fallback (M3)
  const resolvedTuiAgent: TuiAgent | null =
    selectedEmployee?.agentType && isTuiAgent(selectedEmployee.agentType)
      ? selectedEmployee.agentType
      : null

  // Safety checks for Bridge Mode (TUI terminal) (H1)
  const isVerifiedPty = verifiedTerminal.status === 'verified' && Boolean(verifiedTerminal.ptyId)
  const isLocalHost =
    verifiedTerminal.status === 'verified' &&
    !verifiedTerminal.isRemote &&
    selectedEmployee?.executionHostId === LOCAL_EXECUTION_HOST_ID
  const isSinglePane = verifiedTerminal.status === 'verified' && !verifiedTerminal.isMultiPane
  const isRoutable = Boolean(selectedEmployee?.revealTarget?.isRoutable)

  const isSafeBridgeChat =
    isVerifiedPty && isLocalHost && isSinglePane && isRoutable && Boolean(resolvedTuiAgent)

  // Target PTY is ONLY passed when ALL safety conditions are met
  const ptyIdForChat = isSafeBridgeChat ? verifiedTerminal.ptyId : null

  // Safety checks for Structured Mode
  const isRemoteStructured = Boolean(
    structuredOwner &&
    (structuredOwner !== LOCAL_EXECUTION_HOST_ID || structuredTarget?.kind !== 'local')
  )

  // Determine human-readable safety lock reason
  const safetyLockReason: string | null = useMemo(() => {
    if (!selectedEmployee) {
      return null
    }
    if (isStructured) {
      if (isRemoteStructured) {
        return 'Remote Structured Session: Chat sending from Office 3D is locked for safety. Open in Classic to interact.'
      }
      if (!structuredTarget || !backingTab?.agentSessionAgent) {
        return 'Structured session target unresolved in this workspace. Open in Classic to interact.'
      }
      return null
    }
    if (!isVerifiedPty) {
      return 'No verified terminal for this agent. Chat sending is locked.'
    }
    if (!isLocalHost) {
      return 'Remote SSH/WSL host: Chat sending from Office 3D is locked for safety. Open in Classic to interact.'
    }
    if (!isSinglePane) {
      return 'Multi-pane / split session: Chat sending from Office 3D is locked for safety. Open in Classic to interact.'
    }
    if (!isRoutable) {
      return 'Agent session is not currently routable. Chat sending is locked.'
    }
    if (!resolvedTuiAgent) {
      return 'Agent engine is not a recognized TUI agent. Chat bridge is disabled.'
    }
    return null
  }, [
    selectedEmployee,
    isStructured,
    isRemoteStructured,
    structuredTarget,
    backingTab,
    isVerifiedPty,
    isLocalHost,
    isSinglePane,
    isRoutable,
    resolvedTuiAgent
  ])

  if (!selectedEmployee) {
    return <Office3DFleetOverview cards={cards} world={world} onSelectEmployee={onSelectEmployee} />
  }

  return (
    <div className="flex flex-col h-full space-y-3">
      {/* Agent Header Banner */}
      <div className="p-3 rounded-lg border border-border/60 bg-muted/20 space-y-2 shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="size-2.5 rounded-full shrink-0"
              style={{
                backgroundColor: STATUS_COLORS[selectedEmployee.displayState]?.primary ?? '#60a5fa'
              }}
            />
            <span className="font-semibold text-sm text-foreground truncate">
              {selectedEmployee.task || 'Agent Session'}
            </span>
          </div>
          <Badge
            variant={
              selectedEmployee.displayState === 'attention'
                ? 'destructive'
                : selectedEmployee.displayState === 'working'
                  ? 'default'
                  : 'secondary'
            }
            className="capitalize text-[10px]"
          >
            {STATUS_COLORS[selectedEmployee.displayState]?.label ?? selectedEmployee.displayState}
          </Badge>
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            Engine:{' '}
            <span className="font-medium text-foreground capitalize">
              {selectedEmployee.agentType || 'Orca'}
            </span>
          </span>
          <span>
            Desk Slot:{' '}
            <span className="font-mono text-foreground">{selectedEmployee.slotIndex + 1}</span>
          </span>
        </div>
      </div>

      {/* Mode Switcher: Live Native Chat vs Conversation Summary */}
      <div className="flex items-center justify-between pb-1 border-b border-border/40 shrink-0">
        <div className="flex items-center bg-muted/50 p-0.5 rounded border border-border/50 text-[11px]">
          <button
            type="button"
            className={`flex items-center gap-1 px-2 py-0.5 rounded font-medium transition-colors ${
              chatViewMode === 'live'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setChatViewMode('live')}
          >
            <MessageSquare className="size-3" />
            <span>Live Chat</span>
          </button>
          <button
            type="button"
            className={`flex items-center gap-1 px-2 py-0.5 rounded font-medium transition-colors ${
              chatViewMode === 'summary'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setChatViewMode('summary')}
          >
            <FileText className="size-3" />
            <span>Session Summary</span>
          </button>
        </div>
        {ptyIdForChat && (
          <span className="text-[10px] font-mono text-muted-foreground">PTY: {ptyIdForChat}</span>
        )}
      </div>

      {/* Attention / Approval Alert */}
      {selectedEmployee.askSummary && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs space-y-2 shrink-0">
          <div className="flex items-center gap-1.5 font-semibold text-amber-300">
            <AlertCircle className="size-3.5" />
            <span>Approval or Input Requested</span>
          </div>
          <p className="text-[11px] leading-relaxed">{selectedEmployee.askSummary}</p>
          <Button
            size="sm"
            className="w-full bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 text-xs"
            onClick={() => onFocusAgent(selectedEmployee)}
          >
            Respond in Workbench ↵
          </Button>
        </div>
      )}

      {/* Active Tab Content: Live Native Chat or Conversation Summary */}
      {chatViewMode === 'live' ? (
        <div className="flex-1 flex flex-col min-h-[300px] gap-2 overflow-hidden">
          {/* Safety Warning Banner if sending is locked */}
          {safetyLockReason && (
            <div
              className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-center justify-between gap-2 shrink-0"
              data-testid="office3d-chat-safety-banner"
            >
              <div className="flex items-center gap-2 min-w-0">
                <ShieldAlert className="size-4 text-amber-400 shrink-0" />
                <span className="text-[11px] leading-tight">{safetyLockReason}</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[10px] px-2 border-amber-500/40 text-amber-300 hover:bg-amber-500/20 shrink-0"
                onClick={() => onFocusAgent(selectedEmployee)}
              >
                Open in Classic
              </Button>
            </div>
          )}

          <div
            className="flex-1 min-h-[260px] border border-border/50 rounded-lg overflow-hidden bg-background"
            data-testid="office3d-native-chat-surface"
          >
            {isStructured ? (
              structuredTarget && backingTab?.agentSessionAgent && !isRemoteStructured ? (
                <NativeChatView
                  key={`structured:${backingTab.id}:${backingTab.entityId}`}
                  mode="structured"
                  tabId={backingTab.id}
                  sessionId={backingTab.entityId}
                  agent={backingTab.agentSessionAgent}
                  isVisible={isVisible}
                  isFocusedGroup={false}
                  target={structuredTarget}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full p-6 text-center space-y-3 text-muted-foreground">
                  <Lock className="size-8 text-amber-400" />
                  <div className="text-xs font-semibold text-foreground">
                    Structured Session Protected
                  </div>
                  <p className="text-[11px] max-w-xs leading-relaxed">
                    {safetyLockReason ??
                      'Structured session requires Classic workbench interaction.'}
                  </p>
                  <Button size="sm" onClick={() => onFocusAgent(selectedEmployee)}>
                    Open in Classic
                  </Button>
                </div>
              )
            ) : resolvedTuiAgent ? (
              <NativeChatView
                // Remount per agent pane so find/scroll/working state never carries across agents.
                key={`bridge:${selectedEmployee.tabId}:${selectedEmployee.paneKey}`}
                terminalTabId={selectedEmployee.tabId}
                isVisible={isVisible}
                isFocusedGroup={false}
                paneKey={selectedEmployee.paneKey}
                targetPtyId={ptyIdForChat}
                launchAgent={resolvedTuiAgent}
                resolvedAgent={resolvedTuiAgent}
                ownsTabWideLaunchDraft={false}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full p-6 text-center space-y-3 text-muted-foreground">
                <AlertCircle className="size-8 text-muted-foreground/60" />
                <div className="text-xs font-semibold text-foreground">
                  No Compatible Chat Engine
                </div>
                <p className="text-[11px] max-w-xs leading-relaxed">
                  The selected agent engine ({selectedEmployee.agentType || 'unknown'}) cannot be
                  routed via TUI Native Chat bridge.
                </p>
                <Button size="sm" onClick={() => onFocusAgent(selectedEmployee)}>
                  Open in Classic
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <Office3DChatSummaryView selectedEmployee={selectedEmployee} onFocusAgent={onFocusAgent} />
      )}
    </div>
  )
}
