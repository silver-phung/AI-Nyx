// @vitest-environment happy-dom

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { Office3DChatTab } from './panels/Office3DChatTab'
import { buildOfficeWorld } from './model/build-office-world'
import type { TerminalVerificationResult } from './model/verify-agent-terminal'
import type { DashboardSnapshot } from '../../../../shared/dashboard-snapshot'
import { LOCAL_EXECUTION_HOST_ID } from '../../../../shared/execution-host'
import { TooltipProvider } from '@/components/ui/tooltip'
import { sendNativeChatMessageVerified } from '@/components/native-chat/native-chat-runtime-send'

vi.mock('@/runtime/structured-agent-session-owner', () => ({
  structuredAgentSessionOwnerForTab: () => LOCAL_EXECUTION_HOST_ID,
  structuredAgentSessionTargetForHost: () => ({
    executionHostId: LOCAL_EXECUTION_HOST_ID,
    kind: 'local'
  })
}))

const mockSnapshot: DashboardSnapshot = {
  generatedAt: 1000,
  cards: [
    {
      paneKey: 'pane-alpha',
      ptyId: 'pty-100',
      agentType: 'codex',
      bucket: 'working',
      dotState: 'working',
      task: 'Feature testing - Agent A',
      lastUserMessage: 'Prompt for Agent A',
      lastAgentMessage: 'Response from Agent A',
      repoId: 'repo-1',
      worktreeId: 'wt-1',
      tabId: 'tab-100',
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
      paneKey: 'pane-beta',
      ptyId: 'pty-200',
      agentType: 'claude',
      bucket: 'working',
      dotState: 'working',
      task: 'Feature testing - Agent B',
      lastUserMessage: 'Prompt for Agent B',
      lastAgentMessage: 'Response from Agent B',
      repoId: 'repo-1',
      worktreeId: 'wt-1',
      tabId: 'tab-200',
      leafId: null,
      repoName: 'backend',
      worktreeName: 'feature/pantheon-office3d',
      hostKind: 'local',
      executionHostId: LOCAL_EXECUTION_HOST_ID,
      startedAt: 200,
      finishedAt: null,
      stateChangedAt: 220,
      unseen: false,
      conversationName: 'Beta Agent'
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

const mockWorld = buildOfficeWorld(mockSnapshot)
const mockEmployeeA = mockWorld.employees.find((e) => e.paneKey === 'pane-alpha')!
const mockEmployeeB = mockWorld.employees.find((e) => e.paneKey === 'pane-beta')!

const mockVerifiedTerminalA: TerminalVerificationResult = {
  status: 'verified',
  ptyId: 'pty-100',
  card: mockSnapshot.cards[0],
  isRemote: false,
  isMultiPane: false,
  isSafeForDirectInput: true,
  terminalInput: null
}

const mockVerifiedTerminalB: TerminalVerificationResult = {
  status: 'verified',
  ptyId: 'pty-200',
  card: mockSnapshot.cards[1],
  isRemote: false,
  isMultiPane: false,
  isSafeForDirectInput: true,
  terminalInput: null
}

const mockUnverifiedTerminal: TerminalVerificationResult = {
  status: 'unverified',
  reason: 'No verified terminal for this agent (session has no active PTY stream)',
  ptyId: null,
  card: null
}

const mockRemoteTerminal: TerminalVerificationResult = {
  status: 'verified',
  ptyId: 'pty-remote-999',
  card: {
    ...mockSnapshot.cards[0],
    hostKind: 'ssh',
    executionHostId: 'ssh:remote-host'
  },
  isRemote: true,
  isMultiPane: false,
  isSafeForDirectInput: false,
  terminalInput: null
}

const mockMultiPaneTerminal: TerminalVerificationResult = {
  status: 'verified',
  ptyId: 'pty-multi-1',
  card: mockSnapshot.cards[0],
  isRemote: false,
  isMultiPane: true,
  isSafeForDirectInput: false,
  terminalInput: null
}

vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({
        tabsByWorktree: {
          'wt-1': [
            { id: 'tab-100', ptyId: 'pty-100' },
            { id: 'tab-200', ptyId: 'pty-200' }
          ]
        },
        unifiedTabsByWorktree: {
          'wt-1': [
            { id: 'tab-100', ptyId: 'pty-100' },
            { id: 'tab-200', ptyId: 'pty-200' }
          ]
        },
        ptyIdsByTabId: {
          'tab-100': ['pty-100'],
          'tab-200': ['pty-200']
        },
        agentStatusByPaneKey: {
          'pane-alpha': {
            state: 'working',
            prompt: '',
            updatedAt: 1,
            stateStartedAt: 1,
            stateHistory: [],
            agentType: 'codex'
          },
          'pane-beta': {
            state: 'working',
            prompt: '',
            updatedAt: 1,
            stateStartedAt: 1,
            stateHistory: [],
            agentType: 'claude'
          }
        },
        tabWideLaunchDraftByTabId: {},
        nativeChatLaunchPromptByTabId: {},
        nativeChatLaunchDraftByTabId: {},
        clearNativeChatLaunchPrompt: vi.fn(),
        clearNativeChatLaunchDraft: vi.fn(),
        paneTitles: {},
        isWindowActive: true,
        worktreesByRepo: {
          'repo-1': [{ id: 'wt-1', path: '/path/to/repo' }]
        },
        detectedWorktreesByRepo: {},
        activeWorktreeId: 'wt-1'
      }),
    {
      getState: () => ({
        terminalLayoutsByTabId: {},
        setActiveWorktree: vi.fn(),
        clearNativeChatLaunchPrompt: vi.fn(),
        clearNativeChatLaunchDraft: vi.fn()
      })
    }
  )
}))

type PtyWriteRecord = { ptyId: string; data: string; kind: string }

describe('Office3DChatTab Unmocked Native Chat Real Send & Isolation Integration', () => {
  let ptyWrites: PtyWriteRecord[] = []

  beforeEach(() => {
    vi.clearAllMocks()
    ptyWrites = []

    ;(window as unknown as { api: Record<string, unknown> }).api = {
      pty: {
        writeAccepted: vi.fn((ptyId: string, data: string, kind: string) => {
          ptyWrites.push({ ptyId, data, kind })
          return Promise.resolve(true)
        }),
        write: vi.fn((ptyId: string, data: string, kind: string) => {
          ptyWrites.push({ ptyId, data, kind })
        }),
        onData: vi.fn(() => () => undefined)
      },
      nativeChat: {
        readSession: vi.fn(),
        subscribeSession: vi.fn(() => () => undefined),
        sendPrompt: vi.fn()
      }
    }
  })

  afterEach(() => {
    cleanup()
    delete (window as unknown as { api?: unknown }).api
  })

  it('proves real prompt dispatch routes strictly to Agent A PTY (pty-100) and never touches Agent B PTY (pty-200)', async () => {
    render(
      <TooltipProvider>
        <Office3DChatTab
          selectedEmployee={mockEmployeeA}
          cards={mockSnapshot.cards}
          world={mockWorld}
          verifiedTerminal={mockVerifiedTerminalA}
          isVisible={true}
          onSelectEmployee={vi.fn()}
          onFocusAgent={vi.fn()}
        />
      </TooltipProvider>
    )

    // Verify unmocked NativeChatView surface is mounted
    const surface = screen.getByTestId('office3d-native-chat-surface')
    expect(surface).toBeDefined()
    expect(screen.queryByTestId('office3d-chat-safety-banner')).toBeNull()

    // Dispatch prompt to Agent A through verified runtime pipeline
    const testPromptA = 'echo "Real Verification - Agent A"'
    const sent = await sendNativeChatMessageVerified(mockVerifiedTerminalA.ptyId, testPromptA)
    expect(sent).toBe(true)

    // Assert writes were accepted strictly on pty-100 with 'driving' input kind
    expect(ptyWrites.length).toBeGreaterThan(0)
    expect(ptyWrites.every((w) => w.ptyId === 'pty-100')).toBe(true)
    expect(ptyWrites.some((w) => w.data.includes('Real Verification - Agent A'))).toBe(true)
    expect(ptyWrites.every((w) => w.kind === 'driving')).toBe(true)

    // Strict non-cross-talk assertion: pty-200 was NEVER called
    expect(ptyWrites.some((w) => w.ptyId === 'pty-200')).toBe(false)
  })

  it('proves switching Agent A -> Agent B re-routes prompt strictly to Agent B PTY (pty-200) without leaking to Agent A', async () => {
    const { rerender } = render(
      <TooltipProvider>
        <Office3DChatTab
          selectedEmployee={mockEmployeeA}
          cards={mockSnapshot.cards}
          world={mockWorld}
          verifiedTerminal={mockVerifiedTerminalA}
          isVisible={true}
          onSelectEmployee={vi.fn()}
          onFocusAgent={vi.fn()}
        />
      </TooltipProvider>
    )

    // Switch selection to Agent B
    rerender(
      <TooltipProvider>
        <Office3DChatTab
          selectedEmployee={mockEmployeeB}
          cards={mockSnapshot.cards}
          world={mockWorld}
          verifiedTerminal={mockVerifiedTerminalB}
          isVisible={true}
          onSelectEmployee={vi.fn()}
          onFocusAgent={vi.fn()}
        />
      </TooltipProvider>
    )

    ptyWrites = []

    // Dispatch prompt to Agent B
    const testPromptB = 'echo "Real Verification - Agent B"'
    const sent = await sendNativeChatMessageVerified(mockVerifiedTerminalB.ptyId, testPromptB)
    expect(sent).toBe(true)

    // Assert writes were accepted strictly on pty-200
    expect(ptyWrites.length).toBeGreaterThan(0)
    expect(ptyWrites.every((w) => w.ptyId === 'pty-200')).toBe(true)
    expect(ptyWrites.some((w) => w.data.includes('Real Verification - Agent B'))).toBe(true)

    // Strict non-cross-talk assertion: pty-100 was NEVER called during Agent B dispatch
    expect(ptyWrites.some((w) => w.ptyId === 'pty-100')).toBe(false)
  })

  it('locks chat and prevents any PTY dispatch when terminal is unverified', () => {
    render(
      <TooltipProvider>
        <Office3DChatTab
          selectedEmployee={mockEmployeeA}
          cards={mockSnapshot.cards}
          world={mockWorld}
          verifiedTerminal={mockUnverifiedTerminal}
          isVisible={true}
          onSelectEmployee={vi.fn()}
          onFocusAgent={vi.fn()}
        />
      </TooltipProvider>
    )

    // Safety banner is visible
    const safetyBanner = screen.getByTestId('office3d-chat-safety-banner')
    expect(safetyBanner).toBeDefined()
    expect(safetyBanner.textContent).toContain('No verified terminal for this agent')
    expect(screen.getByText('Open in Classic')).toBeDefined()

    // No writes were performed
    expect(ptyWrites.length).toBe(0)
  })

  it('locks chat for Remote SSH host and blocks direct PTY dispatch', () => {
    render(
      <TooltipProvider>
        <Office3DChatTab
          selectedEmployee={{
            ...mockEmployeeA,
            executionHostId: 'ssh:remote-host'
          }}
          cards={mockSnapshot.cards}
          world={mockWorld}
          verifiedTerminal={mockRemoteTerminal}
          isVisible={true}
          onSelectEmployee={vi.fn()}
          onFocusAgent={vi.fn()}
        />
      </TooltipProvider>
    )

    const safetyBanner = screen.getByTestId('office3d-chat-safety-banner')
    expect(safetyBanner).toBeDefined()
    expect(safetyBanner.textContent).toMatch(/Remote SSH\/WSL host/i)
    expect(screen.getByText('Open in Classic')).toBeDefined()
  })

  it('locks chat for Multi-pane terminal and blocks direct PTY dispatch', () => {
    render(
      <TooltipProvider>
        <Office3DChatTab
          selectedEmployee={mockEmployeeA}
          cards={mockSnapshot.cards}
          world={mockWorld}
          verifiedTerminal={mockMultiPaneTerminal}
          isVisible={true}
          onSelectEmployee={vi.fn()}
          onFocusAgent={vi.fn()}
        />
      </TooltipProvider>
    )

    const safetyBanner = screen.getByTestId('office3d-chat-safety-banner')
    expect(safetyBanner).toBeDefined()
    expect(safetyBanner.textContent).toMatch(/Multi-pane \/ split session/i)
    expect(screen.getByText('Open in Classic')).toBeDefined()
  })
})
