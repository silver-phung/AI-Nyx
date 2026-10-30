import { describe, expect, it } from 'vitest'
import type { DashboardCard } from '../../../../../shared/dashboard-snapshot'
import type { ExecutionHostId } from '../../../../../shared/execution-host'
import type { OfficeEmployee } from './office-world-types'
import { verifyAgentTerminal } from './verify-agent-terminal'

function createSampleEmployee(overrides: Partial<OfficeEmployee> = {}): OfficeEmployee {
  return {
    employeeId: 'local::tab-1:leaf-1',
    paneKey: 'tab-1:leaf-1',
    ptyId: 'pty-100',
    tabId: 'tab-1',
    leafId: 'leaf-1',
    zoneId: 'zone:local:worktree:repo-1:wt-1',
    deskId: 'zone:local:worktree:repo-1:wt-1::desk-0',
    slotIndex: 0,
    displayState: 'working',
    bucket: 'working',
    dotState: 'working',
    agentType: 'codex',
    task: 'Fix issue #123',
    startedAt: 1000,
    stateChangedAt: 1000,
    rawExecutionHostId: null,
    executionHostId: 'local',
    isRoutable: true,
    revealTarget: {
      repoId: 'repo-1',
      worktreeId: 'wt-1',
      tabId: 'tab-1',
      leafId: 'leaf-1',
      executionHostId: 'local',
      isRoutable: true
    },
    ...overrides
  }
}

function createSampleCard(overrides: Partial<DashboardCard> = {}): DashboardCard {
  return {
    paneKey: 'tab-1:leaf-1',
    ptyId: 'pty-100',
    tabId: 'tab-1',
    leafId: 'leaf-1',
    repoId: 'repo-1',
    worktreeId: 'wt-1',
    repoName: 'Repo',
    worktreeName: 'Main',
    workspaceKind: 'worktree',
    agentType: 'codex',
    bucket: 'working',
    dotState: 'working',
    task: 'Fix issue #123',
    hostKind: 'local',
    hostLabel: 'Local',
    executionHostId: 'local',
    startedAt: 1000,
    stateChangedAt: 1000,
    finishedAt: null,
    unseen: false,
    ...overrides
  }
}

describe('verifyAgentTerminal', () => {
  it('returns no_agent when no employee is selected (no fallback to first card)', () => {
    const card1 = createSampleCard({ ptyId: 'pty-1' })
    const card2 = createSampleCard({ paneKey: 'tab-2', ptyId: 'pty-2' })

    const result = verifyAgentTerminal(null, [card1, card2])
    expect(result.status).toBe('no_agent')
    expect(result.ptyId).toBeNull()
  })

  it('returns unverified when selected employee has no ptyId', () => {
    const emp = createSampleEmployee({ ptyId: null })
    const card = createSampleCard({ ptyId: 'pty-999' })

    const result = verifyAgentTerminal(emp, [card])
    expect(result.status).toBe('unverified')
    expect(result.ptyId).toBeNull()
    if (result.status === 'unverified') {
      expect(result.reason).toContain('no active PTY stream')
    }
  })

  it('selecting Agent A NEVER controls Agent B PTY, even if Agent B is first card', () => {
    const cardB = createSampleCard({
      paneKey: 'tab-b:leaf-b',
      tabId: 'tab-b',
      leafId: 'leaf-b',
      ptyId: 'pty-B'
    })
    const cardA = createSampleCard({
      paneKey: 'tab-a:leaf-a',
      tabId: 'tab-a',
      leafId: 'leaf-a',
      ptyId: 'pty-A'
    })

    const empA = createSampleEmployee({
      paneKey: 'tab-a:leaf-a',
      tabId: 'tab-a',
      leafId: 'leaf-a',
      ptyId: 'pty-A',
      revealTarget: {
        repoId: 'repo-1',
        worktreeId: 'wt-1',
        tabId: 'tab-a',
        leafId: 'leaf-a',
        executionHostId: 'local',
        isRoutable: true
      }
    })

    const result = verifyAgentTerminal(empA, [cardB, cardA])
    expect(result.status).toBe('verified')
    expect(result.ptyId).toBe('pty-A')
    expect(result.ptyId).not.toBe('pty-B')
  })

  it('returns unverified when snapshot card has a different PTY id', () => {
    const emp = createSampleEmployee({ ptyId: 'pty-100' })
    const card = createSampleCard({ ptyId: 'pty-DIFFERENT' })

    const result = verifyAgentTerminal(emp, [card])
    expect(result.status).toBe('unverified')
    expect(result.ptyId).toBeNull()
    if (result.status === 'unverified') {
      expect(result.reason).toContain('PTY stream identity mismatch')
    }
  })

  it('returns unverified when tab does not belong to selected workspace', () => {
    const emp = createSampleEmployee({ ptyId: 'pty-100' })
    const card = createSampleCard({ ptyId: 'pty-100' })
    const tabsByWorktree = {
      'wt-1': [{ id: 'other-tab-id', ptyId: 'pty-999' }]
    }

    const result = verifyAgentTerminal(emp, [card], tabsByWorktree)
    expect(result.status).toBe('unverified')
    if (result.status === 'unverified') {
      expect(result.reason).toContain('tab does not belong to agent workspace')
    }
  })

  it('identifies remote SSH/WSL hosts and flags safeForDirectInput as false', () => {
    const emp = createSampleEmployee({
      leafId: null,
      executionHostId: 'ssh:remote-server' as ExecutionHostId,
      revealTarget: {
        repoId: 'repo-1',
        worktreeId: 'wt-1',
        tabId: 'tab-1',
        leafId: null,
        executionHostId: 'ssh:remote-server' as ExecutionHostId,
        isRoutable: true
      }
    })
    const card = createSampleCard({
      hostKind: 'ssh',
      executionHostId: 'ssh:remote-server' as ExecutionHostId,
      leafId: null
    })

    const result = verifyAgentTerminal(emp, [card])
    expect(result.status).toBe('verified')
    expect(result.ptyId).toBe('pty-100')
    if (result.status === 'verified') {
      expect(result.isRemote).toBe(true)
      expect(result.isSafeForDirectInput).toBe(false)
    }
  })

  it('identifies multi-pane configurations and flags safeForDirectInput as false', () => {
    const emp = createSampleEmployee({ leafId: 'leaf-1' })
    const card1 = createSampleCard({ leafId: 'leaf-1', paneKey: 'tab-1:leaf-1' })
    const card2 = createSampleCard({ leafId: 'leaf-2', paneKey: 'tab-1:leaf-2', ptyId: 'pty-200' })

    const result = verifyAgentTerminal(emp, [card1, card2])
    expect(result.status).toBe('verified')
    if (result.status === 'verified') {
      expect(result.isMultiPane).toBe(true)
      expect(result.isSafeForDirectInput).toBe(false)
    }
  })

  it('allows direct input only for verified local single-pane routable agents', () => {
    const emp = createSampleEmployee({
      leafId: null,
      executionHostId: 'local',
      isRoutable: true
    })
    const card = createSampleCard({
      leafId: null,
      hostKind: 'local',
      executionHostId: 'local'
    })

    const result = verifyAgentTerminal(emp, [card])
    expect(result.status).toBe('verified')
    if (result.status === 'verified') {
      expect(result.isRemote).toBe(false)
      expect(result.isMultiPane).toBe(false)
      expect(result.isSafeForDirectInput).toBe(true)
    }
  })
})
