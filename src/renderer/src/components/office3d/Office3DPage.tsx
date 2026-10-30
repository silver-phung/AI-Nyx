import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Building2,
  ArrowLeft,
  Bot,
  FolderGit2,
  Activity,
  CheckCircle2,
  AlertCircle,
  Layers,
  Sparkles,
  Gauge,
  ExternalLink,
  X,
  Terminal as TerminalIcon,
  MessageSquare,
  History,
  Info,
  ChevronDown,
  ChevronUp,
  PanelRightClose,
  PanelRightOpen,
  FileText,
  AlertTriangle,
  Search,
  Lock,
  Unlock,
  ShieldAlert
} from 'lucide-react'
import { useAppStore } from '@/store'
import { useLiveDashboardSnapshot } from '@/components/dashboard/useLiveDashboardSnapshot'
import { revealDashboardAgent } from '@/components/dashboard/reveal-dashboard-agent'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { translate } from '@/i18n/i18n'
import { buildOfficeWorld } from './model/build-office-world'
import type { OfficeDesk, OfficeEmployee, OfficeZone } from './model/office-world-types'
import { STATUS_COLORS } from './scene/OfficeTheme'
import { verifyAgentTerminal } from './model/verify-agent-terminal'
import { campusEventBus, type CampusActivityEvent } from './scene/campus/campus-events'

const Office3DCanvas = lazy(() =>
  import('./scene/Office3DCanvas').then((m) => ({ default: m.Office3DCanvas }))
)

const AgentTerminalPreview = lazy(() =>
  import('../dashboard-popout/AgentTerminalPreview').then((m) => ({
    default: m.AgentTerminalPreview
  }))
)

function isEditableElement(target: EventTarget | null): target is HTMLElement {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}

function checkWebGLSupport(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false
  }
  try {
    const canvas = document.createElement('canvas')
    const gl =
      canvas.getContext('webgl') ||
      (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null)
    if (!gl) return false
    const loseContext = gl.getExtension('WEBGL_lose_context')
    if (loseContext) {
      loseContext.loseContext()
    }
    return true
  } catch {
    return false
  }
}

export function Office3DPage(): React.JSX.Element {
  const isDevOrTest = import.meta.env.DEV || import.meta.env.MODE === 'test'
  if (typeof window !== 'undefined' && isDevOrTest) {
    // oxlint-disable-next-line typescript/consistent-type-assertions
    ;(window as unknown as { __APP_STORE__: typeof useAppStore }).__APP_STORE__ = useAppStore
  }
  const closeOffice3DPage = useAppStore((s) => s.closeOffice3DPage)
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const ptyIdsByTabId = useAppStore((s) => s.ptyIdsByTabId)
  const tabsByWorktree = useAppStore((s) => s.tabsByWorktree)
  const snapshot = useLiveDashboardSnapshot()

  // Selection state
  const [selectedEmployee, setSelectedEmployee] = useState<OfficeEmployee | null>(null)
  const [selectedDesk, setSelectedDesk] = useState<{ desk: OfficeDesk; zone: OfficeZone } | null>(
    null
  )
  const [selectedZone, setSelectedZone] = useState<OfficeZone | null>(null)

  // Layout resizing & collapse state (Center Bottom & Right panels)
  const [bottomPanelHeight, setBottomPanelHeight] = useState(240)
  const [isBottomPanelCollapsed, setIsBottomPanelCollapsed] = useState(false)
  const [rightPanelWidth, setRightPanelWidth] = useState(380)
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(false)
  const [bottomActiveTab, setBottomActiveTab] = useState<
    'terminal' | 'output' | 'problems' | 'logs'
  >('terminal')
  const [rightActiveTab, setRightActiveTab] = useState<'chat' | 'history' | 'details'>('chat')
  const [historySearchFilter, setHistorySearchFilter] = useState('')
  const [interactiveInputUnlocked, setInteractiveInputUnlocked] = useState(false)
  const [campusEvents, setCampusEvents] = useState<readonly CampusActivityEvent[]>([])

  // Supported activation path to focus real agent session in classic workbench
  const handleFocusAgent = useCallback(
    (employee: OfficeEmployee) => {
      if (!employee.isRoutable) {
        return
      }
      closeOffice3DPage()
      revealDashboardAgent({
        repoId: employee.revealTarget.repoId,
        worktreeId: employee.revealTarget.worktreeId,
        tabId: employee.revealTarget.tabId,
        leafId: employee.revealTarget.leafId,
        executionHostId: employee.revealTarget.executionHostId
      })
    },
    [closeOffice3DPage]
  )

  // Route to workspace in classic view
  const handleOpenWorkspace = useCallback(
    (worktreeId: string) => {
      useAppStore.getState().setActiveWorktree(worktreeId)
      closeOffice3DPage()
    },
    [closeOffice3DPage]
  )

  const handleSelectDesk = useCallback((desk: OfficeDesk, zone: OfficeZone) => {
    setSelectedDesk({ desk, zone })
    setSelectedEmployee(null)
    setSelectedZone(null)
  }, [])

  const handleSelectZone = useCallback((zone: OfficeZone) => {
    setSelectedZone(zone)
    setSelectedEmployee(null)
    setSelectedDesk(null)
  }, [])

  const handleSelectEmployee = useCallback((employee: OfficeEmployee | null) => {
    setSelectedEmployee(employee)
    if (employee) {
      setSelectedDesk(null)
      setSelectedZone(null)
    }
  }, [])

  const handleClearSelection = useCallback(() => {
    setSelectedEmployee(null)
    setSelectedDesk(null)
    setSelectedZone(null)
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined' && isDevOrTest) {
      // oxlint-disable-next-line typescript/consistent-type-assertions
      ;(window as unknown as { __OFFICE3D_BRIDGE__?: unknown }).__OFFICE3D_BRIDGE__ = {
        selectEmployee: handleSelectEmployee,
        selectDesk: handleSelectDesk,
        selectZone: handleSelectZone,
        clearSelection: handleClearSelection,
        getSelectedEmployee: () => selectedEmployee,
        getSelectedDesk: () => selectedDesk,
        getSelectedZone: () => selectedZone
      }
      return () => {
        delete (window as unknown as { __OFFICE3D_BRIDGE__?: unknown }).__OFFICE3D_BRIDGE__
      }
    }
    return undefined
  }, [
    handleSelectEmployee,
    handleSelectDesk,
    handleSelectZone,
    handleClearSelection,
    selectedEmployee,
    selectedDesk,
    selectedZone,
    isDevOrTest
  ])

  // Keyboard navigation: Enter to focus selected agent, Escape to deselect or return
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.defaultPrevented || isEditableElement(event.target)) {
        return
      }
      if (event.key === 'Enter' && selectedEmployee) {
        event.preventDefault()
        handleFocusAgent(selectedEmployee)
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        if (selectedEmployee || selectedDesk || selectedZone) {
          handleClearSelection()
        } else {
          closeOffice3DPage()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    closeOffice3DPage,
    handleClearSelection,
    handleFocusAgent,
    selectedDesk,
    selectedEmployee,
    selectedZone
  ])

  // Build the deterministic agent world from live snapshot
  const world = useMemo(() => buildOfficeWorld(snapshot), [snapshot])

  // UI state
  const hasWebGL = useMemo(() => checkWebGLSupport(), [])
  const [activeTab, setActiveTab] = useState<'3d' | 'dom'>(hasWebGL ? '3d' : 'dom')
  const [qualityMode, setQualityMode] = useState<'high' | 'low'>('high')
  const fpsBadgeRef = useRef<HTMLDivElement>(null)

  // Direct ref-based FPS update avoids re-rendering the entire Office3DPage every 500ms
  const handleFpsUpdate = useCallback((newFps: number) => {
    if (fpsBadgeRef.current) {
      fpsBadgeRef.current.textContent = `${newFps} FPS`
    }
  }, [])

  // Sync selected employee if snapshot updates; clear if session terminated and removed
  useEffect(() => {
    if (selectedEmployee) {
      const updated = world.lookup.employeeById.get(selectedEmployee.employeeId)
      if (updated) {
        setSelectedEmployee(updated)
      } else {
        const stillInSnapshot = snapshot.cards.some((c) => c.paneKey === selectedEmployee.paneKey)
        if (!stillInSnapshot) {
          setSelectedEmployee(null)
        }
      }
    }
  }, [world, selectedEmployee, snapshot.cards])

  // Track active window drag cleanup to avoid listener leaks
  const activeCleanupRef = useRef<(() => void) | null>(null)
  useEffect(() => {
    return () => {
      activeCleanupRef.current?.()
    }
  }, [])

  // Resizing handlers for Bottom Panel (vertical drag)
  const handleBottomResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const startY = e.clientY
      const startHeight = bottomPanelHeight

      const onMouseMove = (moveEvent: MouseEvent): void => {
        const delta = startY - moveEvent.clientY
        const maxHeight = Math.max(160, Math.floor(window.innerHeight * 0.6))
        const newHeight = Math.max(100, Math.min(maxHeight, startHeight + delta))
        setBottomPanelHeight(newHeight)
        setIsBottomPanelCollapsed(false)
      }

      const onMouseUp = (): void => {
        window.removeEventListener('mousemove', onMouseMove)
        window.removeEventListener('mouseup', onMouseUp)
        activeCleanupRef.current = null
      }

      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseup', onMouseUp)
      activeCleanupRef.current = onMouseUp
    },
    [bottomPanelHeight]
  )

  // Resizing handlers for Right Panel (horizontal drag)
  const handleRightResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const startX = e.clientX
      const startWidth = rightPanelWidth

      const onMouseMove = (moveEvent: MouseEvent): void => {
        const delta = startX - moveEvent.clientX
        const maxWidth = Math.max(300, Math.floor(window.innerWidth * 0.5))
        const newWidth = Math.max(260, Math.min(maxWidth, startWidth + delta))
        setRightPanelWidth(newWidth)
        setIsRightPanelCollapsed(false)
      }

      const onMouseUp = (): void => {
        window.removeEventListener('mousemove', onMouseMove)
        window.removeEventListener('mouseup', onMouseUp)
        activeCleanupRef.current = null
      }

      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseup', onMouseUp)
      activeCleanupRef.current = onMouseUp
    },
    [rightPanelWidth]
  )

  // Strict verification of Terminal stream (ZERO fallback to arbitrary cards or tab[0])
  const verifiedTerminal = useMemo(() => {
    return verifyAgentTerminal(
      selectedEmployee,
      snapshot.cards,
      tabsByWorktree,
      ptyIdsByTabId
    )
  }, [selectedEmployee, snapshot.cards, tabsByWorktree, ptyIdsByTabId])

  // Priority 3: Re-lock input immediately whenever agent, ptyId, host, or terminal target changes
  useEffect(() => {
    setInteractiveInputUnlocked(false)
  }, [
    selectedEmployee?.employeeId,
    verifiedTerminal.status === 'verified' ? verifiedTerminal.ptyId : null,
    verifiedTerminal.status === 'verified' ? verifiedTerminal.card.executionHostId : null,
    verifiedTerminal.status === 'verified' ? verifiedTerminal.isSafeForDirectInput : false
  ])

  // Subscribe to real campus event bus for truthful activity timeline
  useEffect(() => {
    const unsub = campusEventBus.subscribe((event) => {
      setCampusEvents((prev) => [event, ...prev].slice(0, 50))
    })
    return unsub
  }, [])

  const totalCards = snapshot.cards.length
  const attentionCards = snapshot.cards.filter((c) => c.bucket === 'attention')
  const workingCards = snapshot.cards.filter((c) => c.bucket === 'working')
  const idleOrDoneCards = snapshot.cards.filter((c) => c.bucket === 'done' || c.bucket === 'idle')
  const totalWorkspaces = snapshot.workspaces?.length ?? 0

  return (
    <div
      className="flex flex-col flex-1 min-w-0 min-h-0 bg-background text-foreground overflow-hidden select-text"
      data-testid="office3d-page-root"
    >
      {/* Top Banner & Navigation Strip */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-border/60 bg-card/70 shrink-0 h-12">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center size-8 rounded-lg bg-primary/10 text-primary">
            <Building2 className="size-5" />
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-bold tracking-tight text-foreground">
              {translate('auto.components.office3d.title', 'Office 3D')}
            </h1>
            <Badge variant="secondary" className="text-[10px] py-0">
              {hasWebGL && activeTab === '3d'
                ? 'Moonlight Campus Preview'
                : translate('auto.components.office3d.badgeFoundation', 'M1 Foundation')}
            </Badge>
            <Badge variant="outline" className="border-primary/50 text-primary text-[10px] py-0 hidden sm:inline-flex">
              Pantheon-inspired 3D
            </Badge>
          </div>
        </div>

        {/* View Controls & Return Button */}
        <div className="flex items-center gap-2">
          {hasWebGL && (
            <div className="flex items-center bg-muted/60 p-0.5 rounded-lg border border-border/50 text-xs mr-2">
              <button
                type="button"
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  activeTab === '3d'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setActiveTab('3d')}
              >
                3D Office
              </button>
              <button
                type="button"
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  activeTab === 'dom'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setActiveTab('dom')}
              >
                DOM Overview
              </button>
            </div>
          )}

          {activeTab === '3d' && hasWebGL && (
            <div className="flex items-center gap-2 mr-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs px-2"
                onClick={() => setQualityMode((q) => (q === 'high' ? 'low' : 'high'))}
                title={
                  qualityMode === 'high'
                    ? 'Rendering Quality: High (Targeting uncapped framerate). Click to switch to Low power mode.'
                    : 'Rendering Quality: Low (Power-saver throttled). Click to switch to High quality.'
                }
              >
                <Gauge className="size-3 mr-1" />
                <span>{qualityMode === 'high' ? 'High' : 'Low'}</span>
              </Button>
              <div
                ref={fpsBadgeRef}
                data-testid="office3d-fps-badge"
                title="Measured rendering performance (live frames per second)"
                className="text-[11px] font-mono px-2 py-0.5 rounded bg-muted/50 border border-border/40 text-muted-foreground"
              >
                -- FPS
              </div>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs px-2.5"
            onClick={closeOffice3DPage}
            data-testid="office3d-return-button"
          >
            <ArrowLeft className="size-3.5 mr-1" />
            <span>
              {translate('auto.components.office3d.returnToClassic', 'Return to Classic View')}
            </span>
          </Button>
        </div>
      </header>

      {/* Main Content: 3D IDE Split Layout OR Fallback DOM Overview */}
      {activeTab === '3d' && hasWebGL ? (
        <div className="flex flex-row flex-1 min-w-0 min-h-0 overflow-hidden relative">
          {/* Center Column: Center Top (3D Viewport) + Center Bottom (Terminal / Output Panel) */}
          <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
            {/* Center Top: Moonlight Campus 3D Viewport */}
            <div className="relative flex-1 min-h-[220px] overflow-hidden bg-slate-950">
              <Suspense
                fallback={
                  <div className="flex flex-col items-center justify-center w-full h-full min-h-[300px] bg-slate-950 text-slate-400 space-y-3">
                    <div className="size-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                    <span className="text-xs">Initializing Moonlight Campus 3D...</span>
                  </div>
                }
              >
                <Office3DCanvas
                  world={world}
                  selectedEmployee={selectedEmployee}
                  selectedDesk={selectedDesk}
                  selectedZone={selectedZone}
                  onSelectEmployee={handleSelectEmployee}
                  onSelectDesk={handleSelectDesk}
                  onFocusEmployee={handleFocusAgent}
                  onSelectZone={handleSelectZone}
                  onClearSelection={handleClearSelection}
                  qualityMode={qualityMode}
                  onFpsUpdate={handleFpsUpdate}
                  onFallbackToDom={() => setActiveTab('dom')}
                />
              </Suspense>

              {/* Floating Instructions Pill */}
              <div className="absolute top-3 left-3 flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/80 backdrop-blur-md border border-slate-700/60 text-[11px] text-slate-300 pointer-events-none select-none shadow-md">
                <Sparkles className="size-3 text-primary animate-pulse" />
                <span>Click any 3D agent character to select Chat & Terminal. Double-click to open.</span>
              </div>

              {/* Selected agent active indicator chip (top right) */}
              {selectedEmployee && (
                <div className="absolute top-3 right-3 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card/90 backdrop-blur-md border border-border/80 shadow-lg text-xs">
                  <div
                    className="size-2 rounded-full"
                    style={{
                      backgroundColor:
                        STATUS_COLORS[selectedEmployee.displayState]?.primary ?? '#60a5fa'
                    }}
                  />
                  <span className="font-semibold text-foreground truncate max-w-[180px]">
                    {selectedEmployee.task || 'Agent Session'}
                  </span>
                  <Badge variant="outline" className="text-[10px] uppercase font-mono py-0">
                    Slot {selectedEmployee.slotIndex + 1}
                  </Badge>
                  <button
                    type="button"
                    className="p-1 rounded text-muted-foreground hover:text-foreground"
                    onClick={handleClearSelection}
                    title="Clear selection"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              )}
            </div>

            {/* Horizontal Resize Divider */}
            <div
              className="h-1 bg-border/80 hover:bg-primary/70 transition-colors cursor-row-resize shrink-0 relative group"
              onMouseDown={handleBottomResizeStart}
              title="Drag to resize Terminal panel. Double-click to toggle collapse."
              onDoubleClick={() => setIsBottomPanelCollapsed((c) => !c)}
            >
              <div className="absolute inset-x-0 -top-1 -bottom-1" />
            </div>

            {/* Center Bottom: Resizable / Collapsible Terminal & Output Panel */}
            <div
              style={{ height: isBottomPanelCollapsed ? 36 : bottomPanelHeight }}
              className="flex flex-col shrink-0 border-t border-border/60 bg-background overflow-hidden transition-[height] duration-75"
            >
              {/* Bottom Tab Bar */}
              <div className="flex items-center justify-between px-3 h-9 border-b border-border/50 bg-muted/30 shrink-0 text-xs">
                <div className="flex items-center gap-1">
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
                      onClick={() => handleFocusAgent(selectedEmployee)}
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
                                  Read-Only Stream · {verifiedTerminal.isRemote ? 'Remote Host (SSH/WSL)' : 'Multi-Pane'}
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
                                onClick={() => handleFocusAgent(selectedEmployee)}
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
                              readOnly={!verifiedTerminal.isSafeForDirectInput || !interactiveInputUnlocked}
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
                            Click any agent in the 3D Campus or pick an active session to attach its verified terminal.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full p-4 text-center text-xs space-y-3 bg-muted/5">
                        <div className="p-3 rounded-full bg-amber-500/10 text-amber-400">
                          <AlertTriangle className="size-6" />
                        </div>
                        <div className="space-y-1">
                          <p className="font-medium text-foreground">No verified terminal for this agent</p>
                          <p className="text-muted-foreground max-w-sm">
                            {verifiedTerminal.reason}
                          </p>
                        </div>
                        {selectedEmployee?.isRoutable && (
                          <Button size="sm" onClick={() => handleFocusAgent(selectedEmployee)}>
                            <ExternalLink className="size-3.5 mr-1.5" />
                            <span>Open in Classic Workbench</span>
                          </Button>
                        )}
                      </div>
                    ))}

                  {bottomActiveTab === 'output' && (
                    <div className="flex flex-col h-full overflow-hidden p-3 font-mono text-xs">
                      <div className="flex items-center justify-between pb-2 border-b border-border/40 text-muted-foreground text-[11px] shrink-0">
                        <span>
                          Task Summary · {selectedEmployee?.agentType ? `${selectedEmployee.agentType} Engine` : 'Workspace'}
                        </span>
                        <span className="text-muted-foreground text-[10px]">
                          Summary View (No raw stdout stream attached)
                        </span>
                      </div>
                      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-sleek py-2 space-y-2 text-muted-foreground">
                        {selectedEmployee ? (
                          <>
                            <div className="space-y-1">
                              <span className="text-[10px] font-semibold uppercase text-foreground/80">[Task Prompt]</span>
                              <div className="p-2 rounded bg-muted/30 text-foreground font-sans text-xs">
                                {selectedEmployee.task || 'No prompt recorded'}
                              </div>
                            </div>
                            {selectedEmployee.lastUserMessage && (
                              <div className="space-y-1">
                                <span className="text-[10px] font-semibold uppercase text-blue-400">[Last User Input]</span>
                                <div className="p-2 rounded bg-blue-500/10 border border-blue-500/20 text-blue-300 font-sans text-xs">
                                  {selectedEmployee.lastUserMessage}
                                </div>
                              </div>
                            )}
                            {selectedEmployee.lastAgentMessage && (
                              <div className="space-y-1">
                                <span className="text-[10px] font-semibold uppercase text-emerald-400">[Last Agent Response]</span>
                                <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 font-sans text-xs">
                                  {selectedEmployee.lastAgentMessage}
                                </div>
                              </div>
                            )}
                            <div className="text-muted-foreground/60 italic pt-2 text-[11px]">
                              -- Raw process stdout/stderr stream requires full interactive workbench. Click &quot;Focus in Classic&quot; to inspect live stream. --
                            </div>
                          </>
                        ) : (
                          <div className="flex items-center justify-center h-full text-muted-foreground">
                            Select an agent to inspect its task summary.
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {bottomActiveTab === 'problems' && (
                    <div className="flex flex-col items-center justify-center h-full p-4 text-center text-xs space-y-3 bg-muted/5">
                      <AlertTriangle className="size-8 text-muted-foreground/60" />
                      <div className="space-y-1">
                        <p className="font-medium text-foreground">No Diagnostic Source Connected</p>
                        <p className="text-muted-foreground max-w-sm">
                          Workspace diagnostics and problem reporting are not attached to this 3D preview. To inspect workspace problems, open the Classic Workbench.
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={closeOffice3DPage}
                      >
                        <ExternalLink className="size-3.5 mr-1.5" />
                        <span>Open Classic Workbench</span>
                      </Button>
                    </div>
                  )}

                  {bottomActiveTab === 'logs' && (
                    <div className="flex flex-col h-full overflow-hidden p-3 font-mono text-xs">
                      <div className="flex items-center justify-between pb-2 border-b border-border/40 text-muted-foreground text-[11px] shrink-0">
                        <span>
                          Campus Event Bus ({campusEvents.length} events logged)
                        </span>
                        <div className="flex items-center gap-1.5 text-[10px]">
                          <span className="size-1.5 rounded-full bg-amber-400/80" />
                          <span className="text-muted-foreground font-sans">Orca event source not connected</span>
                        </div>
                      </div>
                      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-sleek py-2 space-y-1.5">
                        {campusEvents.length === 0 ? (
                          <div className="p-4 text-center text-muted-foreground text-xs space-y-1.5">
                            <p className="font-medium text-foreground">Orca event source not connected</p>
                            <p className="text-[11px] text-muted-foreground/80 max-w-md mx-auto">
                              System events (Git pushes, test runs, and code reviews) are not forwarded to Office 3D. DEV PREVIEW events will be logged here when simulated campus actors trigger activity.
                            </p>
                          </div>
                        ) : (
                          campusEvents.map((evt) => (
                            <div key={`${evt.activityId}-${evt.occurredAt}-${evt.status}`} className="flex items-center gap-2 text-[11px]">
                              <span className="text-muted-foreground">
                                [{new Date(evt.occurredAt).toLocaleTimeString()}]
                              </span>
                              <Badge
                                variant={evt.source === 'orca' ? 'default' : 'outline'}
                                className="text-[9px] py-0 uppercase"
                              >
                                {evt.source === 'orca' ? 'REAL' : 'DEV PREVIEW'}
                              </Badge>
                              <span className="font-semibold text-foreground">
                                {evt.kind}:
                              </span>
                              <span className="text-muted-foreground truncate max-w-[200px]">
                                {evt.detail || evt.employeeId}
                              </span>
                              <Badge
                                variant={
                                  evt.status === 'succeeded'
                                    ? 'secondary'
                                    : evt.status === 'failed'
                                      ? 'destructive'
                                      : 'outline'
                                }
                                className="text-[9px] py-0 ml-auto capitalize"
                              >
                                {evt.status}
                              </Badge>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Vertical Resize Divider */}
          <div
            className="w-1 bg-border/80 hover:bg-primary/70 transition-colors cursor-col-resize shrink-0 relative group"
            onMouseDown={handleRightResizeStart}
            title="Drag to resize Right panel. Double-click to toggle collapse."
            onDoubleClick={() => setIsRightPanelCollapsed((c) => !c)}
          >
            <div className="absolute inset-y-0 -left-1 -right-1" />
          </div>

          {/* Right Column: Resizable / Collapsible Tab Panel (Chat / Session History / Details) */}
          <div
            style={{ width: isRightPanelCollapsed ? 40 : rightPanelWidth }}
            className="flex flex-col shrink-0 border-l border-border/60 bg-card overflow-hidden transition-[width] duration-75"
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
                {rightActiveTab === 'chat' &&
                  (selectedEmployee ? (
                    <div className="space-y-4">
                      {/* Agent Header Banner */}
                      <div className="p-3 rounded-lg border border-border/60 bg-muted/20 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              className="size-2.5 rounded-full shrink-0"
                              style={{
                                backgroundColor:
                                  STATUS_COLORS[selectedEmployee.displayState]?.primary ?? '#60a5fa'
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
                            {STATUS_COLORS[selectedEmployee.displayState]?.label ??
                              selectedEmployee.displayState}
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
                            <span className="font-mono text-foreground">
                              {selectedEmployee.slotIndex + 1}
                            </span>
                          </span>
                        </div>
                      </div>

                      {/* Attention / Approval Alert */}
                      {selectedEmployee.askSummary && (
                        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs space-y-2">
                          <div className="flex items-center gap-1.5 font-semibold text-amber-300">
                            <AlertCircle className="size-3.5" />
                            <span>Approval or Input Requested</span>
                          </div>
                          <p className="text-[11px] leading-relaxed">
                            {selectedEmployee.askSummary}
                          </p>
                          <Button
                            size="sm"
                            className="w-full bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 text-xs"
                            onClick={() => handleFocusAgent(selectedEmployee)}
                          >
                            Respond in Workbench ↵
                          </Button>
                        </div>
                      )}

                      {/* Conversation Excerpt / Transcript */}
                      <div className="space-y-3">
                        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                          Conversation Summary (Recent Excerpts)
                        </div>

                        {selectedEmployee.lastUserMessage ? (
                          <div className="p-2.5 rounded-lg bg-primary/10 border border-primary/20 text-xs text-foreground space-y-1">
                            <div className="text-[10px] font-semibold text-primary">User</div>
                            <p className="text-xs leading-relaxed">
                              {selectedEmployee.lastUserMessage}
                            </p>
                          </div>
                        ) : (
                          <div className="p-2.5 rounded-lg bg-muted/40 text-xs text-muted-foreground">
                            Task assigned: {selectedEmployee.task}
                          </div>
                        )}

                        {selectedEmployee.lastAgentMessage && (
                          <div className="p-2.5 rounded-lg bg-card border border-border/80 text-xs text-foreground space-y-1 shadow-sm">
                            <div className="text-[10px] font-semibold text-emerald-400 capitalize">
                              {selectedEmployee.agentType || 'Agent'}
                            </div>
                            <p className="text-xs leading-relaxed whitespace-pre-wrap">
                              {selectedEmployee.lastAgentMessage}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Reply in Workbench Action (No fake composer that loses text) */}
                      <div className="space-y-2 pt-2 border-t border-border/50">
                        <Button
                          size="sm"
                          className="w-full"
                          onClick={() => handleFocusAgent(selectedEmployee)}
                          title="Open native chat workbench in Classic View to reply"
                        >
                          <MessageSquare className="size-3.5 mr-1.5" />
                          <span>Open in Classic to Reply</span>
                        </Button>
                        <p className="text-[10px] text-muted-foreground text-center">
                          Full interactive chat and tool dispatch are hosted in the Native Chat workbench
                        </p>
                      </div>
                    </div>
                  ) : (
                    /* Fleet Overview in Chat tab when no agent is selected */
                    <div className="space-y-4">
                      <div className="p-3 rounded-lg border border-dashed border-border/80 text-center space-y-2">
                        <Bot className="size-8 mx-auto text-primary/70" />
                        <div className="text-xs font-semibold text-foreground">
                          Live Fleet Overview
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Click any 3D agent character in the Moonlight Campus to inspect its live
                          chat session.
                        </p>
                      </div>

                      {snapshot.cards.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                            Active Agents ({snapshot.cards.length})
                          </div>
                          <div className="space-y-1.5">
                            {snapshot.cards.map((card) => {
                              const emp = world.employees.find((e) => e.paneKey === card.paneKey)
                              return (
                                <button
                                  key={card.paneKey}
                                  type="button"
                                  className="w-full text-left p-2.5 rounded-lg border border-border/60 bg-muted/20 hover:bg-muted/50 transition-colors space-y-1"
                                  onClick={() => {
                                    if (emp) {
                                      handleSelectEmployee(emp)
                                    }
                                  }}
                                >
                                  <div className="flex items-center justify-between gap-1 text-xs">
                                    <span className="font-medium text-foreground truncate max-w-[180px]">
                                      {card.conversationName || card.task || 'Agent Session'}
                                    </span>
                                    <Badge
                                      variant={
                                        card.bucket === 'attention'
                                          ? 'destructive'
                                          : card.bucket === 'working'
                                            ? 'default'
                                            : 'secondary'
                                      }
                                      className="text-[9px] py-0"
                                    >
                                      {card.bucket}
                                    </Badge>
                                  </div>
                                  <div className="text-[11px] text-muted-foreground truncate">
                                    {card.worktreeName} ·{' '}
                                    <span className="capitalize">{card.agentType}</span>
                                  </div>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                {rightActiveTab === 'history' && (
                  <div className="space-y-3">
                    <div className="relative">
                      <Search className="size-3.5 absolute left-2.5 top-2.5 text-muted-foreground pointer-events-none" />
                      <input
                        type="text"
                        value={historySearchFilter}
                        onChange={(e) => setHistorySearchFilter(e.target.value)}
                        placeholder="Filter active sessions..."
                        className="w-full h-8 pl-8 pr-2.5 rounded-md bg-muted/40 border border-border/60 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>

                    <div className="space-y-1.5">
                      {snapshot.cards
                        .filter((c) =>
                          historySearchFilter
                            ? (c.conversationName || c.task || '')
                                .toLowerCase()
                                .includes(historySearchFilter.toLowerCase()) ||
                              c.worktreeName
                                .toLowerCase()
                                .includes(historySearchFilter.toLowerCase())
                            : true
                        )
                        .map((card) => {
                          const emp = world.employees.find((e) => e.paneKey === card.paneKey)
                          const isSelected = selectedEmployee?.paneKey === card.paneKey
                          return (
                            <div
                              key={card.paneKey}
                              className={`p-2.5 rounded-lg border transition-all space-y-1.5 ${
                                isSelected
                                  ? 'border-primary bg-primary/5 shadow-sm'
                                  : 'border-border/60 bg-muted/20 hover:border-border'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className="font-medium text-xs text-foreground truncate">
                                  {card.conversationName || card.task || 'Agent Session'}
                                </span>
                                <Badge variant="outline" className="text-[9px] py-0 shrink-0">
                                  {card.bucket}
                                </Badge>
                              </div>
                              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                <span>{card.worktreeName}</span>
                                <span className="capitalize">{card.agentType}</span>
                              </div>
                              <div className="pt-1 flex items-center justify-between gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 px-2 text-[10px]"
                                  onClick={() => {
                                    if (emp) handleSelectEmployee(emp)
                                  }}
                                >
                                  Select in 3D
                                </Button>
                                {emp && emp.isRoutable && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-[10px] text-primary hover:text-primary"
                                    onClick={() => handleFocusAgent(emp)}
                                  >
                                    <ExternalLink className="size-3 mr-1" />
                                    <span>Open</span>
                                  </Button>
                                )}
                              </div>
                            </div>
                          )
                        })}
                    </div>
                  </div>
                )}

                {rightActiveTab === 'details' && (
                  <div className="space-y-3 text-xs">
                    {selectedEmployee ? (
                      <div className="space-y-3">
                        <div className="font-semibold text-sm text-foreground">
                          Agent Inspection Details
                        </div>

                        <div className="space-y-2 divide-y divide-border/40">
                          <div className="flex items-center justify-between py-1.5">
                            <span className="text-muted-foreground">Employee ID:</span>
                            <span className="font-mono text-foreground text-[11px] truncate max-w-[180px]">
                              {selectedEmployee.employeeId}
                            </span>
                          </div>
                          <div className="flex items-center justify-between py-1.5">
                            <span className="text-muted-foreground">Desk Slot:</span>
                            <span className="font-mono text-foreground">
                              Slot {selectedEmployee.slotIndex + 1}
                            </span>
                          </div>
                          <div className="flex items-center justify-between py-1.5">
                            <span className="text-muted-foreground">Workspace:</span>
                            <span className="font-medium text-foreground truncate max-w-[180px]">
                              {world.lookup.zoneById.get(selectedEmployee.zoneId)?.displayName ??
                                'Workspace'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between py-1.5">
                            <span className="text-muted-foreground">Host Kind:</span>
                            <span className="font-medium text-foreground capitalize">
                              {world.lookup.zoneById.get(selectedEmployee.zoneId)?.hostKind ??
                                'local'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between py-1.5">
                            <span className="text-muted-foreground">Agent Engine:</span>
                            <span className="font-medium text-foreground capitalize">
                              {selectedEmployee.agentType || 'Orca'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between py-1.5">
                            <span className="text-muted-foreground">PTY Attached:</span>
                            <span className="font-mono text-[11px] text-foreground">
                              {selectedEmployee.ptyId ? 'Live' : 'None'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between py-1.5">
                            <span className="text-muted-foreground">Routable Workbench:</span>
                            <span className="font-medium text-foreground">
                              {selectedEmployee.isRoutable ? 'Yes' : 'No'}
                            </span>
                          </div>
                        </div>

                        <div className="pt-2">
                          <Button
                            className="w-full"
                            size="sm"
                            disabled={!selectedEmployee.isRoutable}
                            onClick={() => handleFocusAgent(selectedEmployee)}
                          >
                            <ExternalLink className="size-3.5 mr-1.5" />
                            <span>Open Full Session in Classic View</span>
                          </Button>
                        </div>
                      </div>
                    ) : selectedDesk ? (
                      <div className="space-y-3">
                        <div className="font-semibold text-sm text-foreground">
                          Desk Inspection Details
                        </div>
                        <div className="space-y-2 divide-y divide-border/40">
                          <div className="flex items-center justify-between py-1.5">
                            <span className="text-muted-foreground">Desk ID:</span>
                            <span className="font-mono text-foreground text-[11px] truncate max-w-[180px]">
                              {selectedDesk.desk.deskId}
                            </span>
                          </div>
                          <div className="flex items-center justify-between py-1.5">
                            <span className="text-muted-foreground">Status:</span>
                            <Badge
                              variant="outline"
                              className="text-emerald-400 border-emerald-400/40"
                            >
                              Vacant Slot {selectedDesk.desk.slotIndex + 1}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between py-1.5">
                            <span className="text-muted-foreground">Zone:</span>
                            <span className="font-medium text-foreground truncate max-w-[180px]">
                              {selectedDesk.zone.displayName}
                            </span>
                          </div>
                          <div className="flex items-center justify-between py-1.5">
                            <span className="text-muted-foreground">Host:</span>
                            <span className="font-medium text-foreground capitalize">
                              {selectedDesk.zone.hostLabel}
                            </span>
                          </div>
                        </div>
                        <div className="pt-2">
                          <Button
                            className="w-full"
                            size="sm"
                            onClick={() => handleOpenWorkspace(selectedDesk.zone.worktreeId)}
                          >
                            <ExternalLink className="size-3.5 mr-1.5" />
                            <span>Open Workspace in Classic</span>
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 text-center text-muted-foreground space-y-2">
                        <Info className="size-6 mx-auto text-muted-foreground/60" />
                        <p>Select any agent character or desk in the 3D scene to inspect full details.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* Fallback DOM Overview Mode (Metrics, Foundation, and Fleet breakdown) */}
      {(activeTab === 'dom' || !hasWebGL) && (
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-sleek p-6 space-y-6">
          {/* Metrics Overview Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between pb-2">
                  <CardTitle>
                    {translate('auto.components.office3d.workspaces', 'Workspaces')}
                  </CardTitle>
                  <FolderGit2 className="size-4 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalWorkspaces}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {translate('auto.components.office3d.activeId', 'Active ID:')}{' '}
                  {activeWorktreeId
                    ? activeWorktreeId.slice(0, 8)
                    : translate('auto.components.office3d.none', 'None')}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between pb-2">
                  <CardTitle>
                    {translate('auto.components.office3d.fleetAgents', 'Fleet Agent Panes')}
                  </CardTitle>
                  <Bot className="size-4 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalCards}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {translate(
                    'auto.components.office3d.liveFleetProcesses',
                    'Live fleet processes'
                  )}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between pb-2">
                  <CardTitle>
                    {translate('auto.components.office3d.working', 'Working')}
                  </CardTitle>
                  <Activity className="size-4 text-primary" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary">{workingCards.length}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {translate(
                    'auto.components.office3d.executingTurnsOrTasks',
                    'Executing turns or tasks'
                  )}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between pb-2">
                  <CardTitle>
                    {translate(
                      'auto.components.office3d.attentionRequired',
                      'Attention Required'
                    )}
                  </CardTitle>
                  <AlertCircle className="size-4 text-destructive" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-destructive">
                  {attentionCards.length}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {translate(
                    'auto.components.office3d.waitingOnApprovalInput',
                    'Waiting on approval/input'
                  )}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between pb-2">
                  <CardTitle>
                    {translate('auto.components.office3d.idleOrDone', 'Idle / Done')}
                  </CardTitle>
                  <CheckCircle2 className="size-4 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-muted-foreground">
                  {idleOrDoneCards.length}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {translate(
                    'auto.components.office3d.readyForAssignment',
                    'Ready for assignment'
                  )}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Foundation Status & Architecture Notice (Required by M1 contracts) */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Layers className="size-4 text-primary" />
                <CardTitle>
                  {translate(
                    'auto.components.office3d.retentionVerificationTitle',
                    'M1 View Architecture & Retention Foundation'
                  )}
                </CardTitle>
              </div>
              <CardDescription>
                {translate(
                  'auto.components.office3d.retentionVerificationDesc',
                  'This top-level view establishes routing, feature-flag fallback, navigation history, and terminal workbench retention.'
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-sm space-y-2 text-muted-foreground">
                <div className="flex items-center gap-2">
                  <div className="size-1.5 rounded-full bg-primary/70 shrink-0" />
                  <span>
                    {translate(
                      'auto.components.office3d.detailRetention',
                      'Terminal Workbench mounted in DOM (hidden & inert) to keep running PTY and agent sessions alive.'
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="size-1.5 rounded-full bg-primary/70 shrink-0" />
                  <span>
                    {translate(
                      'auto.components.office3d.detailNav',
                      'Sidebar navigation and project hierarchy fully preserved.'
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="size-1.5 rounded-full bg-primary/70 shrink-0" />
                  <span>
                    {translate(
                      'auto.components.office3d.detailHistory',
                      'Modal-view history pattern intact; feature flag OFF safely falls back to Classic view.'
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="size-1.5 rounded-full bg-primary/70 shrink-0" />
                  <span>
                    {translate(
                      'auto.components.office3d.detailM3',
                      'Interactive 3D scene (Three.js/Canvas) will be integrated in subsequent milestones (M3+).'
                    )}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Real Live Fleet Agent Breakdown (DOM View / Overview) */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold tracking-tight text-foreground flex items-center gap-2">
              <Bot className="size-4" />
              {translate('auto.components.office3d.fleetTitle', 'Live Agent Fleet')} ({totalCards})
            </h2>

            {totalCards === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                {translate(
                  'auto.components.office3d.noAgents',
                  'No active agents running. Launch an agent in Classic view to see its status here.'
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {snapshot.cards.map((card) => {
                  const matchingEmp = world.employees.find((e) => e.paneKey === card.paneKey)
                  return (
                    <div
                      key={card.paneKey}
                      className="rounded-lg border border-border/60 bg-card p-3 space-y-2 text-xs hover:border-primary/50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-semibold truncate text-foreground">
                          {card.conversationName ||
                            card.task ||
                            translate('auto.components.office3d.agentSession', 'Agent Session')}
                        </div>
                        <Badge
                          variant={
                            card.bucket === 'attention'
                              ? 'destructive'
                              : card.bucket === 'working'
                                ? 'default'
                                : 'secondary'
                          }
                        >
                          {card.bucket}
                        </Badge>
                      </div>
                      <div className="text-muted-foreground truncate">
                        {translate('auto.components.office3d.workspaceLabel', 'Workspace:')}{' '}
                        <span className="text-foreground">{card.worktreeName}</span>
                      </div>
                      <div className="text-muted-foreground truncate">
                        {translate('auto.components.office3d.typeLabel', 'Type:')}{' '}
                        <span className="text-foreground">{card.agentType}</span>
                      </div>
                      {matchingEmp && (
                        <div className="pt-2 border-t border-border/40 flex items-center justify-between">
                          <span className="text-muted-foreground text-[11px]">
                            Desk Slot {matchingEmp.slotIndex + 1}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[11px] text-primary hover:text-primary"
                            disabled={!matchingEmp.isRoutable}
                            onClick={() => handleFocusAgent(matchingEmp)}
                          >
                            <ExternalLink className="size-3 mr-1" />
                            <span>Focus</span>
                          </Button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default Office3DPage
