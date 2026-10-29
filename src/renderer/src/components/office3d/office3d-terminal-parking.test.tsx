// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { collectTerminalParkingPassCandidates } from '../terminal-parking-pass-candidates'
import type { TerminalParkingFoundation } from '../use-terminal-parking-foundation'
import {
  TERMINAL_WORKTREE_HOT_RETAIN_MS,
  selectColdParkedTerminalWorktrees
} from '../terminal-pane/terminal-hidden-view-parking'
import { TerminalWorkbenchContainer } from '../TerminalWorkbenchContainer'
import type { TerminalTab } from '../../../../shared/terminal-tab-types'

function makeTab(id: string, worktreeId: string, ptyId: string | null): TerminalTab {
  return {
    id,
    worktreeId,
    ptyId,
    title: `terminal-${id}`,
    customTitle: null,
    color: null,
    sortOrder: 0,
    createdAt: 0
  }
}

function createMockParkingController(
  overrides: Partial<TerminalParkingFoundation> = {}
): TerminalParkingFoundation {
  const hiddenSince = new Map<string, number>()
  const parkCooldownUntil = new Map<string, number>()
  const parkingTimers = new Map<string, number>()
  const measurableBackground = new Set<string>()
  const measuringTerminal = new Set<string>()
  const mountedWorktrees = new Set<string>(['wt-1', 'wt-2'])
  const surfaceIds = ['wt-1', 'wt-2']

  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: test fixture mocks only needed parking fields
  return {
    activeView: 'office3d',
    activityTerminalPortals: [],
    measurableBackgroundWorktreeIdsRef: { current: measurableBackground },
    measuringTerminalWorktreeIdsRef: { current: measuringTerminal },
    mountedWorktreeIdsRef: { current: mountedWorktrees },
    pairedRuntimeParkingEnvironmentIds: new Set<string>(),
    pendingStartupByTabId: {},
    renderedActiveWorktreeId: 'wt-1',
    tabsByWorktree: {
      'wt-1': [makeTab('tab-1', 'wt-1', 'wt-1@@session-1')],
      'wt-2': [makeTab('tab-2', 'wt-2', 'wt-2@@session-2')]
    },
    terminalParkingEnabled: true,
    terminalSshParkingEnabled: false,
    terminalWorktreeHiddenSinceRef: { current: hiddenSince },
    terminalWorktreeParkCooldownUntilRef: { current: parkCooldownUntil },
    terminalWorktreeParkingTimersRef: { current: parkingTimers },
    workspaceSurfaceIds: surfaceIds,
    workspaceSurfaceIdSet: new Set(surfaceIds),
    ...overrides
  } as unknown as TerminalParkingFoundation
}

describe('Office 3D Terminal Parking Parity — Phase D (Fix H3)', () => {
  describe('1. Parity between Office 3D, Tasks, and Settings secondary views', () => {
    it('treats active worktree as hidden (isVisible: false) identically across office3d, tasks, and settings', () => {
      const officeController = createMockParkingController({ activeView: 'office3d' })
      const tasksController = createMockParkingController({ activeView: 'tasks' })
      const settingsController = createMockParkingController({ activeView: 'settings' })
      const terminalController = createMockParkingController({ activeView: 'terminal' })

      const officePass = collectTerminalParkingPassCandidates(officeController)
      const tasksPass = collectTerminalParkingPassCandidates(tasksController)
      const settingsPass = collectTerminalParkingPassCandidates(settingsController)
      const terminalPass = collectTerminalParkingPassCandidates(terminalController)

      // In terminal view, renderedActiveWorktreeId (wt-1) is visible
      const terminalWt1 = terminalPass.retentionCandidates.find((c) => c.worktreeId === 'wt-1')
      expect(terminalWt1?.isVisible).toBe(true)

      // In office3d, tasks, and settings, wt-1 is hidden
      const officeWt1 = officePass.retentionCandidates.find((c) => c.worktreeId === 'wt-1')
      const tasksWt1 = tasksPass.retentionCandidates.find((c) => c.worktreeId === 'wt-1')
      const settingsWt1 = settingsPass.retentionCandidates.find((c) => c.worktreeId === 'wt-1')

      expect(officeWt1?.isVisible).toBe(false)
      expect(tasksWt1?.isVisible).toBe(false)
      expect(settingsWt1?.isVisible).toBe(false)

      // Behavior is exactly identical across the secondary views
      expect(officeWt1?.shouldMeasureHiddenWorktree).toBe(tasksWt1?.shouldMeasureHiddenWorktree)
      expect(officeWt1?.shouldMeasureHiddenWorktree).toBe(settingsWt1?.shouldMeasureHiddenWorktree)
      expect(officePass.nextParkedTerminalWorktreeIds).toEqual(
        tasksPass.nextParkedTerminalWorktreeIds
      )
      expect(officePass.nextParkedTerminalWorktreeIds).toEqual(
        settingsPass.nextParkedTerminalWorktreeIds
      )
    })
  })

  describe('2. Visible vs Hidden Worktrees in Office 3D', () => {
    it('tracks hidden duration and selects aged worktrees for cold parking while in office3d', () => {
      const now = 200000
      const hiddenSince = new Map<string, number>([
        ['wt-1', now - TERMINAL_WORKTREE_HOT_RETAIN_MS - 5000],
        ['wt-2', now - TERMINAL_WORKTREE_HOT_RETAIN_MS - 10000]
      ])
      const controller = createMockParkingController({
        activeView: 'office3d',
        terminalWorktreeHiddenSinceRef: { current: hiddenSince }
      })

      const pass = collectTerminalParkingPassCandidates(controller)
      expect(pass.retentionCandidates.every((c) => !c.isVisible)).toBe(true)

      // selectColdParkedTerminalWorktrees retains the most recently hidden worktree (wt-1) and parks wt-2
      const parked = selectColdParkedTerminalWorktrees({
        worktrees: pass.retentionCandidates,
        pendingStartupByTabId: {},
        parkingEnabled: true,
        nowMs: now,
        hotRetainLimit: 0
      })
      expect(parked).toEqual(new Set(['wt-2']))
    })
  })

  describe('3. Activity terminal portal exemptions', () => {
    it('exempts worktrees with active activity portals from being hidden or cold-parked in office3d', () => {
      const now = 200000
      const hiddenSince = new Map<string, number>([
        ['wt-1', now - TERMINAL_WORKTREE_HOT_RETAIN_MS - 5000]
      ])
      const controller = createMockParkingController({
        activeView: 'office3d',
        // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: stub portal
        activityTerminalPortals: [{ worktreeId: 'wt-1', tabId: 'tab-1' } as never],
        terminalWorktreeHiddenSinceRef: { current: hiddenSince }
      })

      const pass = collectTerminalParkingPassCandidates(controller)
      const wt1 = pass.retentionCandidates.find((c) => c.worktreeId === 'wt-1')

      // Has activity portal
      expect(wt1?.hasActivityTerminalPortal).toBe(true)
      // Hidden timestamp was cleared because portal keeps it live
      expect(hiddenSince.has('wt-1')).toBe(false)

      const parked = selectColdParkedTerminalWorktrees({
        worktrees: pass.retentionCandidates,
        pendingStartupByTabId: {},
        parkingEnabled: true,
        nowMs: now,
        hotRetainLimit: 0
      })
      // wt-1 is protected by portal exemption
      expect(parked.has('wt-1')).toBe(false)
    })
  })

  describe('4. Pending process startup protection', () => {
    it('protects worktrees with in-flight agent or process startup from parking during office3d', () => {
      const now = 200000
      const hiddenSince = new Map<string, number>([
        ['wt-1', now - TERMINAL_WORKTREE_HOT_RETAIN_MS - 10000],
        ['wt-2', now - TERMINAL_WORKTREE_HOT_RETAIN_MS - 20000]
      ])
      const controller = createMockParkingController({
        activeView: 'office3d',
        pendingStartupByTabId: {
          // tab-2 in wt-2 has pending startup in progress
          'tab-2': { command: 'echo starting agent' }
        },
        terminalWorktreeHiddenSinceRef: { current: hiddenSince }
      })

      const pass = collectTerminalParkingPassCandidates(controller)
      const parked = selectColdParkedTerminalWorktrees({
        worktrees: pass.retentionCandidates,
        pendingStartupByTabId: controller.pendingStartupByTabId,
        parkingEnabled: true,
        nowMs: now,
        hotRetainLimit: 0
      })

      // wt-2 cannot be parked because tab-2 has a pending startup
      expect(parked.has('wt-2')).toBe(false)
    })
  })

  describe('5. Restorable vs non-restorable PTYs', () => {
    it('does not cold-park terminals with non-restorable PTYs during office3d view', () => {
      const now = 200000
      const hiddenSince = new Map<string, number>([
        ['wt-1', now - TERMINAL_WORKTREE_HOT_RETAIN_MS - 10000],
        ['wt-2', now - TERMINAL_WORKTREE_HOT_RETAIN_MS - 20000]
      ])
      const controller = createMockParkingController({
        activeView: 'office3d',
        tabsByWorktree: {
          'wt-1': [makeTab('tab-1', 'wt-1', 'wt-1@@session-1')], // restorable daemon session
          'wt-2': [makeTab('tab-2', 'wt-2', 'local-unbacked-pty')] // non-restorable PTY handle
        },
        terminalWorktreeHiddenSinceRef: { current: hiddenSince }
      })

      const pass = collectTerminalParkingPassCandidates(controller)
      const parked = selectColdParkedTerminalWorktrees({
        worktrees: pass.retentionCandidates,
        pendingStartupByTabId: {},
        parkingEnabled: true,
        nowMs: now,
        hotRetainLimit: 0
      })

      // wt-2 has non-restorable PTY and cannot be safely parked
      expect(parked.has('wt-2')).toBe(false)
    })
  })

  describe('6. Remote and SSH capability-dependent behavior', () => {
    it('parks SSH tabs only when terminalSshParkingEnabled is true', () => {
      const now = 200000
      const hiddenSince = new Map<string, number>([
        ['wt-1', now - TERMINAL_WORKTREE_HOT_RETAIN_MS - 10000],
        ['wt-ssh', now - TERMINAL_WORKTREE_HOT_RETAIN_MS - 20000]
      ])

      // Without SSH parking
      const disabledController = createMockParkingController({
        activeView: 'office3d',
        mountedWorktreeIdsRef: { current: new Set(['wt-1', 'wt-ssh']) },
        workspaceSurfaceIds: ['wt-1', 'wt-ssh'],
        workspaceSurfaceIdSet: new Set(['wt-1', 'wt-ssh']),
        tabsByWorktree: {
          'wt-1': [makeTab('tab-1', 'wt-1', 'wt-1@@session-1')],
          'wt-ssh': [makeTab('tab-ssh', 'wt-ssh', 'ssh:host-1@@pty-1')]
        },
        terminalSshParkingEnabled: false,
        terminalWorktreeHiddenSinceRef: { current: new Map(hiddenSince) }
      })

      const disabledPass = collectTerminalParkingPassCandidates(disabledController)
      const disabledParked = selectColdParkedTerminalWorktrees({
        worktrees: disabledPass.retentionCandidates,
        pendingStartupByTabId: {},
        parkingEnabled: true,
        restorePolicy: {
          sshParkingEnabled: false,
          pairedRuntimeParkingEnvironmentIds: new Set()
        },
        nowMs: now,
        hotRetainLimit: 0
      })
      expect(disabledParked.has('wt-ssh')).toBe(false)

      // With SSH parking enabled
      const enabledController = createMockParkingController({
        activeView: 'office3d',
        mountedWorktreeIdsRef: { current: new Set(['wt-1', 'wt-ssh']) },
        workspaceSurfaceIds: ['wt-1', 'wt-ssh'],
        workspaceSurfaceIdSet: new Set(['wt-1', 'wt-ssh']),
        tabsByWorktree: {
          'wt-1': [makeTab('tab-1', 'wt-1', 'wt-1@@session-1')],
          'wt-ssh': [makeTab('tab-ssh', 'wt-ssh', 'ssh:host-1@@pty-1')]
        },
        terminalSshParkingEnabled: true,
        terminalWorktreeHiddenSinceRef: { current: new Map(hiddenSince) }
      })

      const enabledPass = collectTerminalParkingPassCandidates(enabledController)
      const enabledParked = selectColdParkedTerminalWorktrees({
        worktrees: enabledPass.retentionCandidates,
        pendingStartupByTabId: {},
        parkingEnabled: true,
        restorePolicy: {
          sshParkingEnabled: true,
          pairedRuntimeParkingEnvironmentIds: new Set()
        },
        nowMs: now,
        hotRetainLimit: 0
      })
      expect(enabledParked.has('wt-ssh')).toBe(true)
    })
  })

  describe('7. TerminalWorkbenchContainer mounting and inert retention', () => {
    it('TerminalWorkbenchContainer stays mounted in DOM with inert and aria-hidden attributes when isVisible is false', () => {
      const { container } = render(
        <TerminalWorkbenchContainer isVisible={false}>
          <div data-testid="live-terminal-dom">Live Terminal Canvas</div>
        </TerminalWorkbenchContainer>
      )

      const wrapper = container.querySelector('[data-terminal-workbench-container]')
      expect(wrapper).not.toBeNull()
      if (!wrapper) {
        throw new Error('wrapper not found')
      }

      // Terminal elements remain in DOM (not destroyed/unmounted)
      const terminalContent = container.querySelector('[data-testid="live-terminal-dom"]')
      expect(terminalContent).not.toBeNull()
      expect(terminalContent?.textContent).toBe('Live Terminal Canvas')

      // Inactive/hidden workbench container is marked inert and hidden from user interaction
      expect(wrapper.hasAttribute('inert')).toBe(true)
      expect(wrapper.getAttribute('aria-hidden')).toBe('true')
      expect(wrapper.className).toContain('hidden')

      cleanup()
    })
  })
})
