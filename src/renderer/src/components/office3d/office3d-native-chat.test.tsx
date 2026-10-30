// @vitest-environment happy-dom

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { Office3DPage } from './Office3DPage'
import type { DashboardSnapshot } from '../../../../shared/dashboard-snapshot'
import { LOCAL_EXECUTION_HOST_ID } from '../../../../shared/execution-host'

const mockCloseOffice3DPage = vi.fn()
const mockRevealDashboardAgent = vi.fn()

const mockChatPropsReceived: Record<string, unknown>[] = []

vi.mock('../native-chat/NativeChatView', () => ({
  default: (props: Record<string, unknown>) => {
    mockChatPropsReceived.push(props)
    return (
      <div
        data-testid="mock-native-chat-view"
        data-mode={String(props.mode ?? 'bridge')}
        data-tab-id={String(props.terminalTabId ?? props.tabId ?? '')}
        data-pane-key={String(props.paneKey ?? '')}
        data-pty-id={String(props.targetPtyId ?? '')}
        data-agent={String(props.launchAgent ?? props.agent ?? '')}
        data-focused-group={String(props.isFocusedGroup)}
        data-owns-draft={String(props.ownsTabWideLaunchDraft)}
      >
        Native Chat Surface ({String(props.mode ?? 'bridge')}) - PTY:{' '}
        {String(props.targetPtyId ?? 'none')}
      </div>
    )
  }
}))

vi.mock('@/runtime/structured-agent-session-owner', () => ({
  structuredAgentSessionOwnerForTab: (_state: unknown, tab: { id: string }) => {
    if (tab.id === 'tab-remote-structured') {
      return 'ssh:cluster-prod'
    }
    if (tab.id === 'tab-structured') {
      return LOCAL_EXECUTION_HOST_ID
    }
    return null
  },
  structuredAgentSessionTargetForHost: (host: string | null) => {
    if (host === 'ssh:cluster-prod') {
      return { executionHostId: 'ssh:cluster-prod', kind: 'remote' }
    }
    if (host === LOCAL_EXECUTION_HOST_ID) {
      return { executionHostId: LOCAL_EXECUTION_HOST_ID, kind: 'local' }
    }
    return null
  }
}))

const mockSnapshot: DashboardSnapshot = {
  generatedAt: 1000,
  cards: [
    {
      paneKey: 'pane-alpha',
      ptyId: 'pty-ALPHA-123',
      agentType: 'claude',
      bucket: 'working',
      dotState: 'working',
      task: 'Task Alpha - Local Safe Agent',
      lastUserMessage: 'Please integrate native chat into the right panel',
      lastAgentMessage: 'Native chat integration ready for verification',
      repoId: 'repo-1',
      worktreeId: 'wt-1',
      tabId: 'tab-alpha',
      leafId: null,
      repoName: 'backend',
      worktreeName: 'feature/pantheon-office3d',
      hostKind: 'local',
      executionHostId: LOCAL_EXECUTION_HOST_ID,
      startedAt: 100,
      finishedAt: null,
      stateChangedAt: 120,
      unseen: false,
      conversationName: 'Alpha Agent'
    },
    {
      paneKey: 'pane-beta-unverified',
      ptyId: null,
      agentType: 'codex',
      bucket: 'attention',
      dotState: 'waiting',
      task: 'Task Beta - Unverified Terminal',
      lastUserMessage: 'Waiting for terminal initialization',
      lastAgentMessage: 'No verified terminal available',
      repoId: 'repo-1',
      worktreeId: 'wt-1',
      tabId: 'tab-beta',
      leafId: null,
      repoName: 'backend',
      worktreeName: 'feature/pantheon-office3d',
      hostKind: 'local',
      executionHostId: LOCAL_EXECUTION_HOST_ID,
      startedAt: 200,
      finishedAt: null,
      stateChangedAt: 250,
      unseen: true,
      conversationName: 'Beta Agent'
    },
    {
      paneKey: 'pane-gamma-remote',
      ptyId: 'pty-GAMMA-REMOTE',
      agentType: 'claude',
      bucket: 'working',
      dotState: 'working',
      task: 'Task Gamma - Remote SSH Agent',
      lastUserMessage: 'Run task in production cluster',
      lastAgentMessage: 'Executing remotely',
      repoId: 'repo-1',
      worktreeId: 'wt-1',
      tabId: 'tab-gamma',
      leafId: null,
      repoName: 'backend',
      worktreeName: 'feature/pantheon-office3d',
      hostKind: 'ssh',
      executionHostId:
        'ssh:cluster-prod' as unknown as DashboardSnapshot['cards'][0]['executionHostId'],
      startedAt: 300,
      finishedAt: null,
      stateChangedAt: 320,
      unseen: false,
      conversationName: 'Gamma Remote Agent'
    },
    {
      paneKey: 'pane-delta-multipane',
      ptyId: 'pty-DELTA-1',
      agentType: 'codex',
      bucket: 'working',
      dotState: 'working',
      task: 'Task Delta - Split Multi-pane Agent',
      lastUserMessage: 'Split pane operation',
      lastAgentMessage: 'Working in pane 1',
      repoId: 'repo-1',
      worktreeId: 'wt-1',
      tabId: 'tab-delta',
      leafId: 'leaf-1',
      repoName: 'backend',
      worktreeName: 'feature/pantheon-office3d',
      hostKind: 'local',
      executionHostId: LOCAL_EXECUTION_HOST_ID,
      startedAt: 400,
      finishedAt: null,
      stateChangedAt: 420,
      unseen: false,
      conversationName: 'Delta Multi-pane'
    },
    {
      paneKey: 'pane-delta-multipane-2',
      ptyId: 'pty-DELTA-2',
      agentType: 'codex',
      bucket: 'working',
      dotState: 'working',
      task: 'Task Delta - Split Multi-pane Sibling',
      lastUserMessage: 'Split pane sibling operation',
      lastAgentMessage: 'Working in pane 2',
      repoId: 'repo-1',
      worktreeId: 'wt-1',
      tabId: 'tab-delta',
      leafId: 'leaf-2',
      repoName: 'backend',
      worktreeName: 'feature/pantheon-office3d',
      hostKind: 'local',
      executionHostId: LOCAL_EXECUTION_HOST_ID,
      startedAt: 400,
      finishedAt: null,
      stateChangedAt: 420,
      unseen: false,
      conversationName: 'Delta Sibling'
    },
    {
      paneKey: 'pane-epsilon-structured',
      ptyId: null,
      agentType: 'claude',
      bucket: 'working',
      dotState: 'working',
      task: 'Task Epsilon - Local Structured Session',
      lastUserMessage: 'Run structured session query',
      lastAgentMessage: 'Structured response received',
      repoId: 'repo-1',
      worktreeId: 'wt-1',
      tabId: 'tab-structured',
      leafId: null,
      repoName: 'backend',
      worktreeName: 'feature/pantheon-office3d',
      hostKind: 'local',
      executionHostId: LOCAL_EXECUTION_HOST_ID,
      startedAt: 500,
      finishedAt: null,
      stateChangedAt: 520,
      unseen: false,
      conversationName: 'Epsilon Structured'
    },
    {
      paneKey: 'pane-zeta-unknown-engine',
      ptyId: 'pty-ZETA',
      agentType: 'mystery-engine',
      bucket: 'working',
      dotState: 'working',
      task: 'Task Zeta - Unknown Engine Agent',
      lastUserMessage: 'Run experimental engine',
      lastAgentMessage: 'Output from unknown engine',
      repoId: 'repo-1',
      worktreeId: 'wt-1',
      tabId: 'tab-zeta',
      leafId: null,
      repoName: 'backend',
      worktreeName: 'feature/pantheon-office3d',
      hostKind: 'local',
      executionHostId: LOCAL_EXECUTION_HOST_ID,
      startedAt: 600,
      finishedAt: null,
      stateChangedAt: 620,
      unseen: false,
      conversationName: 'Zeta Unknown'
    }
  ],
  workspaces: [
    {
      repoId: 'repo-1',
      worktreeId: 'wt-1',
      repoName: 'backend',
      worktreeName: 'feature/pantheon-office3d',
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
  AgentTerminalPreview: (props: { ptyId?: string }) => (
    <div data-testid="agent-terminal-preview" data-pty-id={props.ptyId}>
      Terminal {props.ptyId}
    </div>
  )
}))

vi.mock('./scene/Office3DCanvas', () => ({
  Office3DCanvas: (props: {
    world: { employees: { paneKey: string }[] }
    onSelectEmployee: (emp: unknown) => void
    onClearSelection: () => void
  }) => (
    <div data-testid="office3d-canvas-mock">
      <button
        data-testid="select-alpha-btn"
        onClick={() =>
          props.onSelectEmployee(props.world.employees.find((e) => e.paneKey === 'pane-alpha'))
        }
      >
        Select Alpha
      </button>
      <button
        data-testid="select-beta-btn"
        onClick={() =>
          props.onSelectEmployee(
            props.world.employees.find((e) => e.paneKey === 'pane-beta-unverified')
          )
        }
      >
        Select Beta
      </button>
      <button
        data-testid="select-gamma-remote-btn"
        onClick={() =>
          props.onSelectEmployee(
            props.world.employees.find((e) => e.paneKey === 'pane-gamma-remote')
          )
        }
      >
        Select Gamma Remote
      </button>
      <button
        data-testid="select-delta-multipane-btn"
        onClick={() =>
          props.onSelectEmployee(
            props.world.employees.find((e) => e.paneKey === 'pane-delta-multipane')
          )
        }
      >
        Select Delta Multi-pane
      </button>
      <button
        data-testid="select-epsilon-structured-btn"
        onClick={() =>
          props.onSelectEmployee(
            props.world.employees.find((e) => e.paneKey === 'pane-epsilon-structured')
          )
        }
      >
        Select Epsilon Structured
      </button>
      <button
        data-testid="select-zeta-unknown-btn"
        onClick={() =>
          props.onSelectEmployee(
            props.world.employees.find((e) => e.paneKey === 'pane-zeta-unknown-engine')
          )
        }
      >
        Select Zeta Unknown
      </button>
      <button data-testid="clear-selection-btn" onClick={() => props.onClearSelection()}>
        Clear
      </button>
    </div>
  )
}))

vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({
        closeOffice3DPage: mockCloseOffice3DPage,
        activeWorktreeId: 'wt-1',
        tabsByWorktree: {
          'wt-1': [
            { id: 'tab-alpha', ptyId: 'pty-ALPHA-123' },
            { id: 'tab-beta', ptyId: null },
            { id: 'tab-gamma', ptyId: 'pty-GAMMA-REMOTE' },
            { id: 'tab-delta', ptyId: 'pty-DELTA-1' },
            {
              id: 'tab-structured',
              entityId: 'session-struct-123',
              contentType: 'agent-session',
              agentSessionAgent: 'claude'
            },
            { id: 'tab-zeta', ptyId: 'pty-ZETA' }
          ]
        },
        unifiedTabsByWorktree: {
          'wt-1': [
            { id: 'tab-alpha', ptyId: 'pty-ALPHA-123' },
            { id: 'tab-beta', ptyId: null },
            { id: 'tab-gamma', ptyId: 'pty-GAMMA-REMOTE' },
            { id: 'tab-delta', ptyId: 'pty-DELTA-1' },
            {
              id: 'tab-structured',
              entityId: 'session-struct-123',
              contentType: 'agent-session',
              agentSessionAgent: 'claude'
            },
            { id: 'tab-zeta', ptyId: 'pty-ZETA' }
          ]
        },
        ptyIdsByTabId: {
          'tab-alpha': ['pty-ALPHA-123'],
          'tab-gamma': ['pty-GAMMA-REMOTE'],
          'tab-delta': ['pty-DELTA-1', 'pty-DELTA-2'],
          'tab-zeta': ['pty-ZETA']
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

describe('Office3D Native Chat Integration Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockChatPropsReceived.length = 0
    HTMLCanvasElement.prototype.getContext = vi.fn((type: string) => {
      if (type === 'webgl' || type === 'experimental-webgl') {
        return { getExtension: () => null }
      }
      return null
    }) as unknown as typeof HTMLCanvasElement.prototype.getContext
  })

  afterEach(() => {
    cleanup()
  })

  it('renders Live Fleet Overview prompt when no agent is selected', () => {
    render(<Office3DPage />)

    expect(screen.getByText('Live Fleet Overview')).toBeDefined()
    expect(screen.getByText(/Click any 3D agent character in the Moonlight Campus/i)).toBeDefined()
  })

  it('H1 & M2: mounts NativeChatView with verified targetPtyId and isFocusedGroup=false for safe local agent', async () => {
    render(<Office3DPage />)

    const selectAlpha = await screen.findByTestId('select-alpha-btn')
    fireEvent.click(selectAlpha)

    // Switch to Live Chat mode
    const liveChatBtn = screen.getByRole('button', { name: /Live Chat/i })
    fireEvent.click(liveChatBtn)

    const nativeChatSurface = screen.getByTestId('mock-native-chat-view')
    expect(nativeChatSurface).toBeDefined()
    expect(nativeChatSurface.getAttribute('data-pty-id')).toBe('pty-ALPHA-123')
    expect(nativeChatSurface.getAttribute('data-pane-key')).toBe('pane-alpha')
    expect(nativeChatSurface.getAttribute('data-agent')).toBe('claude')
    expect(nativeChatSurface.getAttribute('data-focused-group')).toBe('false')
    expect(nativeChatSurface.getAttribute('data-owns-draft')).toBe('false')

    // No safety lock banner for safe local agent
    expect(screen.queryByTestId('office3d-chat-safety-banner')).toBeNull()
  })

  it('H1 Safety: locks input and passes targetPtyId=null when terminal is unverified', async () => {
    render(<Office3DPage />)

    const selectBeta = await screen.findByTestId('select-beta-btn')
    fireEvent.click(selectBeta)

    const liveChatBtn = screen.getByRole('button', { name: /Live Chat/i })
    fireEvent.click(liveChatBtn)

    const nativeChatSurface = screen.getByTestId('mock-native-chat-view')
    expect(nativeChatSurface).toBeDefined()
    expect(nativeChatSurface.getAttribute('data-pty-id')).toBe('')

    const banner = screen.getByTestId('office3d-chat-safety-banner')
    expect(banner).toBeDefined()
    expect(screen.getAllByText(/No verified terminal for this agent/i).length).toBeGreaterThan(0)
  })

  it('H1 Safety: locks input for remote SSH/WSL agent and warns with Open in Classic', async () => {
    render(<Office3DPage />)

    const selectGamma = await screen.findByTestId('select-gamma-remote-btn')
    fireEvent.click(selectGamma)

    const liveChatBtn = screen.getByRole('button', { name: /Live Chat/i })
    fireEvent.click(liveChatBtn)

    const nativeChatSurface = screen.getByTestId('mock-native-chat-view')
    expect(nativeChatSurface.getAttribute('data-pty-id')).toBe('')

    const banner = screen.getByTestId('office3d-chat-safety-banner')
    expect(banner).toBeDefined()
    expect(
      screen.getByText(/Remote SSH\/WSL host: Chat sending from Office 3D is locked/i)
    ).toBeDefined()
  })

  it('H1 Safety: locks input for multi-pane split sessions', async () => {
    render(<Office3DPage />)

    const selectDelta = await screen.findByTestId('select-delta-multipane-btn')
    fireEvent.click(selectDelta)

    const liveChatBtn = screen.getByRole('button', { name: /Live Chat/i })
    fireEvent.click(liveChatBtn)

    const nativeChatSurface = screen.getByTestId('mock-native-chat-view')
    expect(nativeChatSurface.getAttribute('data-pty-id')).toBe('')

    const banner = screen.getByTestId('office3d-chat-safety-banner')
    expect(banner).toBeDefined()
    expect(
      screen.getByText(/Multi-pane \/ split session: Chat sending from Office 3D is locked/i)
    ).toBeDefined()
  })

  it('M4: routes structured session to mode="structured" without falling back to bridge mode', async () => {
    render(<Office3DPage />)

    const selectEpsilon = await screen.findByTestId('select-epsilon-structured-btn')
    fireEvent.click(selectEpsilon)

    const liveChatBtn = screen.getByRole('button', { name: /Live Chat/i })
    fireEvent.click(liveChatBtn)

    const nativeChatSurface = screen.getByTestId('mock-native-chat-view')
    expect(nativeChatSurface.getAttribute('data-mode')).toBe('structured')
    expect(nativeChatSurface.getAttribute('data-tab-id')).toBe('tab-structured')
    expect(nativeChatSurface.getAttribute('data-agent')).toBe('claude')
  })

  it('M3: rejects unknown agent engine without falling back to claude', async () => {
    render(<Office3DPage />)

    const selectZeta = await screen.findByTestId('select-zeta-unknown-btn')
    fireEvent.click(selectZeta)

    const liveChatBtn = screen.getByRole('button', { name: /Live Chat/i })
    fireEvent.click(liveChatBtn)

    // Does NOT render mock-native-chat-view with fallback claude
    expect(screen.queryByTestId('mock-native-chat-view')).toBeNull()
    expect(screen.getByText('No Compatible Chat Engine')).toBeDefined()
    expect(screen.getByText(/cannot be routed via TUI Native Chat bridge/i)).toBeDefined()
  })

  it('M1: protects keyboard events inside chat surface and controls from window Enter/Escape', async () => {
    render(<Office3DPage />)

    const selectAlpha = await screen.findByTestId('select-alpha-btn')
    fireEvent.click(selectAlpha)

    const chatSurface = screen.getByTestId('office3d-right-panel')
    const buttonInsideChat = chatSurface.querySelector('button')
    expect(buttonInsideChat).toBeDefined()

    if (buttonInsideChat) {
      // Press Enter inside right panel button: should NOT trigger reveal / classic navigation
      fireEvent.keyDown(buttonInsideChat, { key: 'Enter', bubbles: true })
      expect(mockRevealDashboardAgent).not.toHaveBeenCalled()

      // Press Escape inside right panel: should NOT close Office3D or deselect
      fireEvent.keyDown(buttonInsideChat, { key: 'Escape', bubbles: true })
      expect(mockCloseOffice3DPage).not.toHaveBeenCalled()
    }
  })
})
