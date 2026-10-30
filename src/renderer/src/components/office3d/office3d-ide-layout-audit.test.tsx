// @vitest-environment happy-dom

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { Office3DPage } from './Office3DPage'
import type { DashboardSnapshot } from '../../../../shared/dashboard-snapshot'
import { LOCAL_EXECUTION_HOST_ID } from '../../../../shared/execution-host'
import { campusEventBus } from './scene/campus/campus-events'

const mockCloseOffice3DPage = vi.fn()
const mockRevealDashboardAgent = vi.fn()

const mockSnapshot: DashboardSnapshot = {
  generatedAt: 1000,
  cards: [
    {
      paneKey: 'pane-a',
      ptyId: 'pty-AAA',
      agentType: 'claude',
      bucket: 'working',
      dotState: 'working',
      task: 'Task Alpha - Database optimization',
      lastUserMessage: 'Please optimize query indexing',
      lastAgentMessage: 'Query indices updated successfully',
      repoId: 'repo-1',
      worktreeId: 'wt-1',
      tabId: 'tab-a',
      leafId: null,
      repoName: 'backend',
      worktreeName: 'feature/auth',
      hostKind: 'local',
      executionHostId: LOCAL_EXECUTION_HOST_ID,
      startedAt: 100,
      finishedAt: null,
      stateChangedAt: 120,
      unseen: false,
      conversationName: 'Agent Alpha'
    },
    {
      paneKey: 'pane-b',
      ptyId: 'pty-BBB',
      agentType: 'codex',
      bucket: 'attention',
      dotState: 'waiting',
      task: 'Task Beta - Remote container deployment',
      lastUserMessage: 'Run deploy in remote cluster',
      lastAgentMessage: 'Waiting for cluster approval',
      repoId: 'repo-1',
      worktreeId: 'wt-1',
      tabId: 'tab-b',
      leafId: null,
      repoName: 'backend',
      worktreeName: 'feature/auth',
      hostKind: 'ssh',
      executionHostId: 'ssh:cluster-prod' as any,
      startedAt: 200,
      finishedAt: null,
      stateChangedAt: 250,
      unseen: true,
      conversationName: 'Agent Beta (Remote)'
    },
    {
      paneKey: 'pane-headless',
      ptyId: null,
      agentType: 'terminal',
      bucket: 'done',
      dotState: 'done',
      task: 'Task Gamma - Headless background sync',
      repoId: 'repo-1',
      worktreeId: 'wt-1',
      tabId: 'tab-c',
      leafId: null,
      repoName: 'backend',
      worktreeName: 'feature/auth',
      hostKind: 'local',
      executionHostId: LOCAL_EXECUTION_HOST_ID,
      startedAt: 300,
      finishedAt: 350,
      stateChangedAt: 350,
      unseen: false,
      conversationName: 'Agent Gamma'
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

vi.mock('@/components/dashboard/reveal-dashboard-agent', () => ({
  revealDashboardAgent: (args: unknown) => mockRevealDashboardAgent(args)
}))

vi.mock('../dashboard-popout/AgentTerminalPreview', () => ({
  AgentTerminalPreview: (props: any) => (
    <div
      data-testid="agent-terminal-preview"
      data-pty-id={props.ptyId}
      data-readonly={String(props.readOnly)}
      data-autofocus={String(props.disableAutoFocus)}
    >
      Preview for {props.ptyId}
    </div>
  )
}))

vi.mock('./scene/Office3DCanvas', () => ({
  Office3DCanvas: (props: any) => (
    <div data-testid="office3d-canvas-mock">
      <button
        data-testid="btn-select-agent-a"
        onClick={() => props.onSelectEmployee(props.world.employees.find((e: any) => e.paneKey === 'pane-a'))}
      >
        Select Agent A
      </button>
      <button
        data-testid="btn-select-agent-b"
        onClick={() => props.onSelectEmployee(props.world.employees.find((e: any) => e.paneKey === 'pane-b'))}
      >
        Select Agent B
      </button>
      <button
        data-testid="btn-select-agent-headless"
        onClick={() => props.onSelectEmployee(props.world.employees.find((e: any) => e.paneKey === 'pane-headless'))}
      >
        Select Headless Agent
      </button>
      <button data-testid="btn-clear-selection" onClick={() => props.onClearSelection()}>
        Clear Selection
      </button>
    </div>
  )
}))

vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: (s: any) => unknown) =>
      selector({
        closeOffice3DPage: mockCloseOffice3DPage,
        activeWorktreeId: 'wt-1',
        tabsByWorktree: {
          'wt-1': [
            { id: 'tab-a', ptyId: 'pty-AAA' },
            { id: 'tab-b', ptyId: 'pty-BBB' },
            { id: 'tab-c', ptyId: null }
          ]
        },
        ptyIdsByTabId: {
          'tab-a': ['pty-AAA'],
          'tab-b': ['pty-BBB']
        }
      }),
    {
      getState: () => ({
        setActiveWorktree: vi.fn(),
        closeOffice3DPage: mockCloseOffice3DPage
      })
    }
  )
}))

describe('Office 3D IDE Layout & Audit Remediation Regression Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock WebGL context so Office3DPage opens 3D IDE layout
    HTMLCanvasElement.prototype.getContext = vi.fn((type: string) => {
      if (type === 'webgl' || type === 'experimental-webgl') {
        return {
          getExtension: () => null
        }
      }
      return null
    }) as any
  })

  afterEach(() => {
    cleanup()
  })

  describe('Priority 1: Terminal Safety & Isolation (H1)', () => {
    it('does NOT mount terminal or fallback to arbitrary agent when no agent is selected', () => {
      render(<Office3DPage />)

      expect(screen.getByText('No Agent Selected')).toBeDefined()
      expect(screen.queryByTestId('agent-terminal-preview')).toBeNull()
    })

    it('displays unverified message and does NOT mount terminal when selected agent has no PTY', async () => {
      render(<Office3DPage />)

      const selectHeadlessBtn = await screen.findByTestId('btn-select-agent-headless')
      fireEvent.click(selectHeadlessBtn)

      expect(screen.getAllByText(/No verified terminal for this agent/i).length).toBeGreaterThan(0)
      expect(screen.queryByTestId('agent-terminal-preview')).toBeNull()
    })

    it('selecting Agent A mounts ONLY Agent A PTY and never Agent B PTY', async () => {
      render(<Office3DPage />)

      const selectBtn = await screen.findByTestId('btn-select-agent-a')
      fireEvent.click(selectBtn)

      const terminalPreview = await screen.findByTestId('agent-terminal-preview')
      expect(terminalPreview).toBeDefined()
      expect(terminalPreview.getAttribute('data-pty-id')).toBe('pty-AAA')
      expect(terminalPreview.getAttribute('data-pty-id')).not.toBe('pty-BBB')
    })

    it('enforces read-only mode for remote (SSH) host agents and blocks direct input', async () => {
      render(<Office3DPage />)

      const selectBtn = await screen.findByTestId('btn-select-agent-b')
      fireEvent.click(selectBtn)

      const terminalPreview = await screen.findByTestId('agent-terminal-preview')
      expect(terminalPreview).toBeDefined()
      expect(terminalPreview.getAttribute('data-pty-id')).toBe('pty-BBB')
      expect(terminalPreview.getAttribute('data-readonly')).toBe('true')
      expect(screen.getByText(/Read-Only Stream · Remote Host/i)).toBeDefined()
    })

    it('starts local agent terminal in protected read-only mode by default with disableAutoFocus=true', async () => {
      render(<Office3DPage />)

      const selectBtn = await screen.findByTestId('btn-select-agent-a')
      fireEvent.click(selectBtn)

      const terminalPreview = await screen.findByTestId('agent-terminal-preview')
      expect(terminalPreview.getAttribute('data-autofocus')).toBe('true') // disableAutoFocus is true
      expect(terminalPreview.getAttribute('data-readonly')).toBe('true') // readOnly initially true until user unlocks
      expect(screen.getByText(/Protected Stream · Read-Only/i)).toBeDefined()

      // User explicitly enables terminal input
      const enableInputBtn = screen.getByText('Enable Terminal Input')
      fireEvent.click(enableInputBtn)

      expect(terminalPreview.getAttribute('data-readonly')).toBe('false')
      expect(screen.getByText('Interactive Input Active')).toBeDefined()
    })
  })

  describe('Priority 2: Elimination of Misleading Indicators (H2)', () => {
    it('problems tab shows No Diagnostic Source Connected and does NOT claim 0 errors with checkmark', () => {
      render(<Office3DPage />)

      const problemsTabBtn = screen.getByRole('button', { name: /Problems/i })
      fireEvent.click(problemsTabBtn)

      expect(screen.getByText('No Diagnostic Source Connected')).toBeDefined()
      expect(screen.queryByText('No Problems Detected')).toBeNull()
      expect(screen.queryByText(/0 errors/i)).toBeNull()
    })

    it('output tab is labeled Task Summary and does not fake Stream Active', async () => {
      render(<Office3DPage />)

      const selectBtn = await screen.findByTestId('btn-select-agent-a')
      fireEvent.click(selectBtn)

      const taskSummaryTabBtn = screen.getByRole('button', { name: /Task Summary/i })
      fireEvent.click(taskSummaryTabBtn)

      expect(screen.getByText(/Task Summary · claude Engine/i)).toBeDefined()
      expect(screen.getAllByText('Task Alpha - Database optimization').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Please optimize query indexing').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Query indices updated successfully').length).toBeGreaterThan(0)
      expect(screen.queryByText(/Stream Active/i)).toBeNull()
    })

    it('logs tab connects to campusEventBus and truthfully distinguishes REAL vs DEV PREVIEW', () => {
      render(<Office3DPage />)

      const logsTabBtn = screen.getByRole('button', { name: /Logs/i })
      fireEvent.click(logsTabBtn)

      act(() => {
        campusEventBus.emit({
          activityId: 'act-real-1',
          employeeId: 'local::pane-a',
          kind: 'git-push',
          status: 'succeeded',
          source: 'orca',
          detail: 'feature/auth -> origin',
          occurredAt: Date.now()
        })

        campusEventBus.emit({
          activityId: 'act-preview-1',
          employeeId: 'preview-agent-1',
          kind: 'test-run',
          status: 'started',
          source: 'dev-preview',
          detail: 'Synthetic Test Suite',
          occurredAt: Date.now()
        })
      })

      expect(screen.getByText('REAL')).toBeDefined()
      expect(screen.getByText('DEV PREVIEW')).toBeDefined()
      expect(screen.getByText('feature/auth -> origin')).toBeDefined()
      expect(screen.getByText('Synthetic Test Suite')).toBeDefined()
    })
  })

  describe('Priority 3: Chat & History UI Safety', () => {
    it('chat tab does not contain fake prompt input and offers Open in Classic to Reply', async () => {
      render(<Office3DPage />)

      const selectBtn = await screen.findByTestId('btn-select-agent-a')
      fireEvent.click(selectBtn)

      expect(screen.queryByPlaceholderText(/Send follow-up instruction/i)).toBeNull()
      expect(screen.getByText(/Conversation Summary \(Recent Excerpts\)/i)).toBeDefined()

      const replyBtn = screen.getByText('Open in Classic to Reply')
      expect(replyBtn).toBeDefined()
      fireEvent.click(replyBtn)

      expect(mockCloseOffice3DPage).toHaveBeenCalled()
      expect(mockRevealDashboardAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          tabId: 'tab-a',
          repoId: 'repo-1'
        })
      )
    })

    it('history tab is truthfully named Active Sessions', () => {
      render(<Office3DPage />)

      const activeSessionsTabBtn = screen.getByRole('button', { name: /Active Sessions/i })
      expect(activeSessionsTabBtn).toBeDefined()
      fireEvent.click(activeSessionsTabBtn)

      expect(screen.getByPlaceholderText('Filter active sessions...')).toBeDefined()
      expect(screen.getByText('Agent Alpha')).toBeDefined()
      expect(screen.getByText('Agent Beta (Remote)')).toBeDefined()
    })
  })
})
