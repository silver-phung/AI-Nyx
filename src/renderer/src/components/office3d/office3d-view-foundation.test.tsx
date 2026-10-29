// @vitest-environment happy-dom

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { isTopLevelView, TOP_LEVEL_VIEW_LOOKUP } from '../../../../shared/top-level-view'
import { TopLevelViewSchema } from '../../../../shared/rpc-contract/client-ui-params'
import {
  sanitizeHydratedActiveView,
  resolveSafePreviousView,
  sanitizeDisabledOfficeViews
} from '../../store/slices/ui/ui-slice-hydration-sanitizers'
import { shouldShowOffice3DButton } from '../sidebar/SidebarNav'
import { canShowRightSidebarForView } from '../../lib/right-sidebar-visibility'
import { shouldShowWorktreeHistoryControls } from '../../lib/titlebar-worktree-history-controls'
import { createUIStore, makePersistedUI } from '../../store/slices/ui-slice-test-harness'
import { Office3DPage } from './Office3DPage'
import type { DashboardSnapshot } from '../../../../shared/dashboard-snapshot'
import { LOCAL_EXECUTION_HOST_ID } from '../../../../shared/execution-host'
import { getDefaultSettings } from '../../../../shared/constants'

const mockCloseOffice3DPage = vi.fn()
const mockSnapshot: DashboardSnapshot = {
  generatedAt: 1000,
  cards: [
    {
      paneKey: 'pane-1',
      ptyId: 'pty-1',
      agentType: 'claude',
      bucket: 'working',
      dotState: 'working',
      task: 'Refactoring auth service',
      repoId: 'repo-1',
      worktreeId: 'wt-1',
      tabId: 'tab-1',
      leafId: 'leaf-1',
      repoName: 'backend',
      worktreeName: 'feature/auth',
      startedAt: 100,
      finishedAt: null,
      stateChangedAt: 120,
      unseen: false,
      conversationName: 'Auth Agent'
    },
    {
      paneKey: 'pane-2',
      ptyId: 'pty-2',
      agentType: 'codex',
      bucket: 'attention',
      dotState: 'waiting',
      task: 'Waiting for database approval',
      repoId: 'repo-1',
      worktreeId: 'wt-1',
      tabId: 'tab-2',
      leafId: 'leaf-2',
      repoName: 'backend',
      worktreeName: 'feature/auth',
      startedAt: 200,
      finishedAt: null,
      stateChangedAt: 250,
      unseen: true,
      conversationName: 'Migration Reviewer'
    }
  ],
  workspaces: [
    {
      repoId: 'repo-1',
      worktreeId: 'wt-1',
      repoName: 'backend',
      worktreeName: 'feature/auth',
      hostKind: 'local',
      executionHostId: LOCAL_EXECUTION_HOST_ID,
      workspaceKind: 'worktree'
    }
  ]
}

vi.mock('@/components/dashboard/useLiveDashboardSnapshot', () => ({
  useLiveDashboardSnapshot: () => mockSnapshot
}))

vi.mock('@/store', () => ({
  useAppStore: (
    selector: (s: { closeOffice3DPage: () => void; activeWorktreeId: string }) => unknown
  ) =>
    selector({
      closeOffice3DPage: mockCloseOffice3DPage,
      activeWorktreeId: 'wt-1'
    })
}))

describe('Office 3D View Foundation — M1 Regression Suite', () => {
  beforeEach(() => {
    mockCloseOffice3DPage.mockReset()
    if (typeof window !== 'undefined') {
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: stubbing window.api in happy-dom test environment
      ;(window as unknown as { api?: { ui: { set: () => Promise<void> } } }).api = {
        ui: {
          set: vi.fn().mockResolvedValue(undefined)
        }
      }
    }
  })

  afterEach(() => {
    cleanup()
  })

  describe('1. View validation and RPC parity', () => {
    it('registers office3d in TopLevelView lookup and validation predicate', () => {
      expect(isTopLevelView('office3d')).toBe(true)
      expect(TOP_LEVEL_VIEW_LOOKUP.office3d).toBe(true)
      expect(isTopLevelView('invalid-custom-view')).toBe(false)
    })

    it('validates office3d in TopLevelViewSchema RPC contract', () => {
      const valid = TopLevelViewSchema.safeParse('office3d')
      expect(valid.success).toBe(true)
      if (valid.success) {
        expect(valid.data).toBe('office3d')
      }

      const invalid = TopLevelViewSchema.safeParse('unrecognized-view')
      expect(invalid.success).toBe(false)
    })
  })

  describe('2. Feature flag enforcement (Phase B — Fix H1)', () => {
    it('blocks openOffice3DPage when enableOffice3D is false or unset', () => {
      const store = createUIStore()
      store.setState({
        settings: { ...getDefaultSettings('/tmp'), enableOffice3D: false }
      })
      expect(store.getState().activeView).toBe('terminal')

      store.getState().openOffice3DPage()
      expect(store.getState().activeView).toBe('terminal')

      // When settings is null/undefined
      const storeNoSettings = createUIStore()
      storeNoSettings.getState().openOffice3DPage()
      expect(storeNoSettings.getState().activeView).toBe('terminal')
    })

    it('blocks direct setActiveView("office3d") when enableOffice3D is false or unset', () => {
      const store = createUIStore()
      store.setState({
        settings: { ...getDefaultSettings('/tmp'), enableOffice3D: false }
      })
      expect(store.getState().activeView).toBe('terminal')

      store.getState().setActiveView('office3d')
      expect(store.getState().activeView).toBe('terminal')

      const storeNoSettings = createUIStore()
      storeNoSettings.getState().setActiveView('office3d')
      expect(storeNoSettings.getState().activeView).toBe('terminal')
    })

    it('falls back to terminal when enableOffice3D is false or null in sanitizers', () => {
      expect(sanitizeHydratedActiveView('office3d', { enableOffice3D: false })).toBe('terminal')
      expect(sanitizeHydratedActiveView('office3d', null)).toBe('terminal')
      expect(sanitizeHydratedActiveView('office3d', undefined)).toBe('terminal')
      expect(resolveSafePreviousView('office3d', { enableOffice3D: false })).toBe('terminal')
      expect(resolveSafePreviousView('office3d', null)).toBe('terminal')
    })

    it('permits office3d activation only when enableOffice3D is explicitly true', () => {
      expect(sanitizeHydratedActiveView('office3d', { enableOffice3D: true })).toBe('office3d')
      expect(resolveSafePreviousView('office3d', { enableOffice3D: true })).toBe('office3d')

      const store = createUIStore()
      store.setState({
        settings: { ...getDefaultSettings('/tmp'), enableOffice3D: true }
      })
      store.getState().openOffice3DPage()
      expect(store.getState().activeView).toBe('office3d')
    })

    it('falls back to terminal on invalid or corrupted activeView strings', () => {
      expect(sanitizeHydratedActiveView('corrupted_view_name', { enableOffice3D: true })).toBe(
        'terminal'
      )
      expect(sanitizeHydratedActiveView(undefined, { enableOffice3D: true })).toBe('terminal')
    })

    it('hydrates office3d in UI store only when feature flag is enabled', () => {
      const storeWithFlagOff = createUIStore()
      storeWithFlagOff.setState({
        settings: { ...getDefaultSettings('/tmp'), enableOffice3D: false }
      })
      storeWithFlagOff
        .getState()
        .hydratePersistedUI(makePersistedUI({ activeView: 'office3d' }), 'startup')
      expect(storeWithFlagOff.getState().activeView).toBe('terminal')

      const storeWithFlagOn = createUIStore()
      storeWithFlagOn.setState({
        settings: { ...getDefaultSettings('/tmp'), enableOffice3D: true }
      })
      storeWithFlagOn
        .getState()
        .hydratePersistedUI(makePersistedUI({ activeView: 'office3d' }), 'startup')
      expect(storeWithFlagOn.getState().activeView).toBe('office3d')
    })
  })

  describe('3. Safe runtime disabling lifecycle (Phase C — Fix H2)', () => {
    it('executes the full lifecycle sequence: Classic -> enable Office -> Office -> Settings -> disable Office -> close Settings -> Classic', () => {
      const store = createUIStore()
      // 1. Initial Classic view
      expect(store.getState().activeView).toBe('terminal')

      // 2. Enable Office 3D feature flag
      store.setState({
        settings: { ...getDefaultSettings('/tmp'), enableOffice3D: true }
      })

      // 3. Navigate to Office 3D
      store.getState().openOffice3DPage()
      expect(store.getState().activeView).toBe('office3d')
      expect(store.getState().previousViewBeforeOffice3D).toBe('terminal')

      // 4. Open Settings while in Office 3D
      store.getState().openSettingsPage()
      expect(store.getState().activeView).toBe('settings')
      expect(store.getState().previousViewBeforeSettings).toBe('office3d')

      // 5. Disable Office 3D while Settings is open
      store.setState({
        settings: { ...getDefaultSettings('/tmp'), enableOffice3D: false }
      })

      // 6. Close Settings page -> must return to Classic ('terminal'), not disabled Office
      store.getState().closeSettingsPage()
      expect(store.getState().activeView).toBe('terminal')
      expect(store.getState().previousViewBeforeSettings).not.toBe('office3d')
    })

    it('automatically returns active Office to Classic when enableOffice3D toggles true -> false', () => {
      const store = createUIStore()
      store.setState({
        settings: { ...getDefaultSettings('/tmp'), enableOffice3D: true }
      })
      store.getState().openOffice3DPage()
      expect(store.getState().activeView).toBe('office3d')

      // Runtime flag disabled while viewing Office
      store.setState({
        settings: { ...getDefaultSettings('/tmp'), enableOffice3D: false }
      })
      expect(store.getState().activeView).toBe('terminal')
    })

    it('prevents closing Tasks from restoring disabled Office view', () => {
      const store = createUIStore()
      store.setState({
        settings: { ...getDefaultSettings('/tmp'), enableOffice3D: true }
      })
      store.getState().openOffice3DPage()
      store.getState().openTaskPage()
      expect(store.getState().activeView).toBe('tasks')
      expect(store.getState().previousViewBeforeTasks).toBe('office3d')

      // Disable office flag while in Tasks
      store.setState({
        settings: { ...getDefaultSettings('/tmp'), enableOffice3D: false }
      })

      // Closing tasks returns to terminal
      store.getState().closeTaskPage()
      expect(store.getState().activeView).toBe('terminal')
      expect(store.getState().previousViewBeforeTasks).not.toBe('office3d')
    })

    it('sanitizes all previousViewBefore* references via sanitizeDisabledOfficeViews', () => {
      const stateWithOfficeRefs = {
        activeView: 'office3d' as const,
        previousViewBeforeSettings: 'office3d' as const,
        previousViewBeforeTasks: 'office3d' as const,
        previousViewBeforeActivity: 'office3d' as const,
        previousViewBeforeAutomations: 'office3d' as const,
        previousViewBeforeSpace: 'office3d' as const,
        previousViewBeforeSkills: 'office3d' as const,
        previousViewBeforeMobile: 'office3d' as const,
        previousViewBeforeArtifacts: 'office3d' as const,
        previousViewBeforeOffice3D: 'office3d' as const
      }
      const sanitized = sanitizeDisabledOfficeViews(stateWithOfficeRefs)
      expect(sanitized.activeView).toBe('terminal')
      expect(sanitized.previousViewBeforeSettings).toBe('terminal')
      expect(sanitized.previousViewBeforeTasks).toBe('terminal')
      expect(sanitized.previousViewBeforeActivity).toBe('terminal')
      expect(sanitized.previousViewBeforeAutomations).toBe('terminal')
      expect(sanitized.previousViewBeforeSpace).toBe('terminal')
      expect(sanitized.previousViewBeforeSkills).toBe('terminal')
      expect(sanitized.previousViewBeforeMobile).toBe('terminal')
      expect(sanitized.previousViewBeforeArtifacts).toBe('terminal')
      expect(sanitized.previousViewBeforeOffice3D).toBe('terminal')
    })

    it('preserves non-terminal previous view on normal round-trip when enabled', () => {
      const store = createUIStore()
      store.setState({
        settings: { ...getDefaultSettings('/tmp'), enableOffice3D: true }
      })
      store.getState().openTaskPage()
      expect(store.getState().activeView).toBe('tasks')

      store.getState().openOffice3DPage()
      expect(store.getState().activeView).toBe('office3d')
      expect(store.getState().previousViewBeforeOffice3D).toBe('tasks')

      store.getState().closeOffice3DPage()
      expect(store.getState().activeView).toBe('tasks')
    })
  })

  describe('4. Navigation History and Right Sidebar Suppression', () => {
    it('office3d does not pollute worktree history simple view entry or history controls', () => {
      expect(shouldShowWorktreeHistoryControls('office3d')).toBe(false)
      expect(shouldShowWorktreeHistoryControls('terminal')).toBe(true)
      expect(shouldShowWorktreeHistoryControls('tasks')).toBe(true)
    })

    it('suppresses right sidebar controls in office3d view', () => {
      expect(canShowRightSidebarForView('office3d')).toBe(false)
      expect(canShowRightSidebarForView('terminal')).toBe(true)
      expect(canShowRightSidebarForView('tasks')).toBe(false)
    })

    it('controls sidebar button visibility via shouldShowOffice3DButton', () => {
      expect(shouldShowOffice3DButton(null)).toBe(false)
      expect(shouldShowOffice3DButton(undefined)).toBe(false)
      expect(shouldShowOffice3DButton({ enableOffice3D: false })).toBe(false)
      expect(shouldShowOffice3DButton({ enableOffice3D: true })).toBe(true)
    })
  })

  describe('5. DOM-only Foundation Rendering & Interactive Escape (Phase E)', () => {
    it('renders workspace and agent counts from live dashboard snapshot with accurate labels', () => {
      render(<Office3DPage />)

      expect(screen.getByText('Office 3D')).toBeDefined()
      expect(screen.getByText('M1 Foundation')).toBeDefined()
      expect(screen.getByText('Workspaces')).toBeDefined()
      expect(screen.getByText('Fleet Agent Panes')).toBeDefined()
      expect(screen.getByText('Live Agent Fleet (2)')).toBeDefined()
      expect(screen.getByText('Auth Agent')).toBeDefined()
      expect(screen.getByText('Migration Reviewer')).toBeDefined()
      expect(screen.getByText('M1 View Architecture & Retention Foundation')).toBeDefined()
      expect(screen.getByText(/subsequent milestones \(M3\+\)/)).toBeDefined()
    })

    it('calls closeOffice3DPage when Return to Classic View button is clicked', () => {
      render(<Office3DPage />)
      const returnBtn = screen.getByTestId('office3d-return-button')
      fireEvent.click(returnBtn)
      expect(mockCloseOffice3DPage).toHaveBeenCalledTimes(1)
    })

    it('calls closeOffice3DPage when Escape key is pressed', () => {
      render(<Office3DPage />)
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(mockCloseOffice3DPage).toHaveBeenCalledTimes(1)
    })
  })
})
