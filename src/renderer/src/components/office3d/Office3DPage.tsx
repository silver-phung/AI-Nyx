import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { useLiveDashboardSnapshot } from '@/components/dashboard/useLiveDashboardSnapshot'
import { revealDashboardAgent } from '@/components/dashboard/reveal-dashboard-agent'
import { buildOfficeWorld } from './model/build-office-world'
import type { OfficeEmployee } from './model/office-world-types'
import { verifyAgentTerminal } from './model/verify-agent-terminal'
import { campusEventBus, type CampusActivityEvent } from './scene/campus/campus-events'
import { useOffice3DSelection } from './hooks/useOffice3DSelection'
import { useOffice3DLayoutState } from './hooks/useOffice3DLayoutState'
import { Office3DHeader } from './layout/Office3DHeader'
import { Office3DDomOverview } from './layout/Office3DDomOverview'
import { Office3DViewport } from './panels/Office3DViewport'
import { Office3DTerminalPanel } from './panels/Office3DTerminalPanel'
import { Office3DRightPanel } from './panels/Office3DRightPanel'
import { useCampusAgentActivity } from './hooks/useCampusAgentActivity'

function isInteractiveOrFocusTrapped(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false
  }
  return Boolean(
    target.closest(
      'input, textarea, select, button, [role="button"], [role="dialog"], [role="menu"], [role="listbox"], [role="option"], [contenteditable="true"], .xterm, [data-testid="agent-terminal-preview"], [data-testid="office3d-native-chat-surface"], [data-testid="office3d-right-panel"], [data-testid="office3d-terminal-panel"]'
    )
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
    if (!gl) {
      return false
    }
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

  // Build the deterministic agent world from live snapshot
  const world = useMemo(() => buildOfficeWorld(snapshot), [snapshot])

  // Selection hook
  const {
    selectedEmployee,
    selectedDesk,
    selectedZone,
    handleSelectEmployee,
    handleSelectDesk,
    handleSelectZone,
    handleClearSelection
  } = useOffice3DSelection(world, snapshot, isDevOrTest)

  // Layout resizing & collapse hook
  const {
    bottomPanelHeight,
    isBottomPanelCollapsed,
    setIsBottomPanelCollapsed,
    rightPanelWidth,
    isRightPanelCollapsed,
    setIsRightPanelCollapsed,
    bottomActiveTab,
    setBottomActiveTab,
    rightActiveTab,
    setRightActiveTab,
    interactiveInputUnlocked,
    setInteractiveInputUnlocked,
    handleBottomResizeStart,
    handleRightResizeStart
  } = useOffice3DLayoutState()

  // Campus activity events
  const [campusEvents, setCampusEvents] = useState<readonly CampusActivityEvent[]>([])

  // WebGL & Viewport state
  const hasWebGL = useMemo(() => checkWebGLSupport(), [])
  const [activeTab, setActiveTab] = useState<'3d' | 'dom'>(hasWebGL ? '3d' : 'dom')
  const [qualityMode, setQualityMode] = useState<'high' | 'low'>('high')
  const fpsBadgeRef = useRef<HTMLDivElement>(null)

  const handleFpsUpdate = useCallback((newFps: number) => {
    if (fpsBadgeRef.current) {
      fpsBadgeRef.current.textContent = `${newFps} FPS`
    }
  }, [])

  // Focus agent in Classic View
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

  // Strict verification of Terminal stream
  const verifiedTerminal = useMemo(() => {
    return verifyAgentTerminal(selectedEmployee, snapshot.cards, tabsByWorktree, ptyIdsByTabId)
  }, [selectedEmployee, snapshot.cards, tabsByWorktree, ptyIdsByTabId])

  // Re-lock terminal input immediately whenever agent or terminal target changes
  const verifiedPtyId = verifiedTerminal.status === 'verified' ? verifiedTerminal.ptyId : null
  const verifiedHostId =
    verifiedTerminal.status === 'verified' ? verifiedTerminal.card.executionHostId : null
  const verifiedInputSafe =
    verifiedTerminal.status === 'verified' ? verifiedTerminal.isSafeForDirectInput : false

  useEffect(() => {
    setInteractiveInputUnlocked(false)
  }, [
    selectedEmployee?.employeeId,
    verifiedPtyId,
    verifiedHostId,
    verifiedInputSafe,
    setInteractiveInputUnlocked
  ])

  // Subscribe to campus events for truthful timeline
  useEffect(() => {
    const unsub = campusEventBus.subscribe((event) => {
      setCampusEvents((prev) => [event, ...prev].slice(0, 50))
    })
    return unsub
  }, [])
  // Declared after the timeline subscription so the first real events are logged too.
  useCampusAgentActivity(world)

  // Keyboard navigation: Enter to focus selected agent, Escape to deselect or return
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.defaultPrevented || isInteractiveOrFocusTrapped(event.target)) {
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

  return (
    <div
      className="flex flex-col flex-1 min-w-0 min-h-0 bg-background text-foreground overflow-hidden select-text"
      data-testid="office3d-page-root"
    >
      <Office3DHeader
        hasWebGL={hasWebGL}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        qualityMode={qualityMode}
        setQualityMode={setQualityMode}
        fpsBadgeRef={fpsBadgeRef}
        onClose={closeOffice3DPage}
      />

      {activeTab === '3d' && hasWebGL ? (
        <div className="flex flex-row flex-1 min-w-0 min-h-0 overflow-hidden relative">
          <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
            <Office3DViewport
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

            <Office3DTerminalPanel
              bottomPanelHeight={bottomPanelHeight}
              isBottomPanelCollapsed={isBottomPanelCollapsed}
              setIsBottomPanelCollapsed={setIsBottomPanelCollapsed}
              bottomActiveTab={bottomActiveTab}
              setBottomActiveTab={setBottomActiveTab}
              onResizeStart={handleBottomResizeStart}
              verifiedTerminal={verifiedTerminal}
              interactiveInputUnlocked={interactiveInputUnlocked}
              setInteractiveInputUnlocked={setInteractiveInputUnlocked}
              selectedEmployee={selectedEmployee}
              onFocusAgent={handleFocusAgent}
              onCloseOffice3D={closeOffice3DPage}
              campusEvents={campusEvents}
            />
          </div>

          <Office3DRightPanel
            rightPanelWidth={rightPanelWidth}
            isRightPanelCollapsed={isRightPanelCollapsed}
            setIsRightPanelCollapsed={setIsRightPanelCollapsed}
            rightActiveTab={rightActiveTab}
            setRightActiveTab={setRightActiveTab}
            onResizeStart={handleRightResizeStart}
            selectedEmployee={selectedEmployee}
            selectedDesk={selectedDesk}
            cards={snapshot.cards}
            world={world}
            verifiedTerminal={verifiedTerminal}
            onSelectEmployee={handleSelectEmployee}
            onFocusAgent={handleFocusAgent}
            onOpenWorkspace={handleOpenWorkspace}
          />
        </div>
      ) : null}

      {(activeTab === 'dom' || !hasWebGL) && (
        <Office3DDomOverview
          snapshot={snapshot}
          activeWorktreeId={activeWorktreeId}
          world={world}
          onFocusAgent={handleFocusAgent}
        />
      )}
    </div>
  )
}

export default Office3DPage
