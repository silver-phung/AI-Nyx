import type {
  DashboardCard,
  DashboardCardTerminalInput
} from '../../../../../shared/dashboard-snapshot'
import type { OfficeEmployee } from './office-world-types'

export type TerminalVerificationResult =
  | {
      readonly status: 'no_agent'
      readonly reason: string
      readonly ptyId: null
      readonly card: null
    }
  | {
      readonly status: 'unverified'
      readonly reason: string
      readonly ptyId: null
      readonly card: DashboardCard | null
    }
  | {
      readonly status: 'verified'
      readonly ptyId: string
      readonly card: DashboardCard
      readonly isRemote: boolean
      readonly isMultiPane: boolean
      readonly isSafeForDirectInput: boolean
      readonly terminalInput: DashboardCardTerminalInput | null
    }

export type WorkspaceTabRef = {
  readonly id: string
  readonly ptyId?: string | null
}

/**
 * Strict verification for Terminal attachment in Office 3D.
 *
 * Safety requirements:
 * 1. An Agent MUST be actively selected.
 * 2. The PTY must belong to the exact selected Agent, pane/leaf, workspace, and execution host.
 * 3. ZERO fallback to tab[0] or an arbitrary active card.
 * 4. Multi-pane and remote (SSH/WSL) hosts are flagged so direct input is restricted.
 */
export function verifyAgentTerminal(
  selectedEmployee: OfficeEmployee | null,
  snapshotCards: readonly DashboardCard[],
  tabsByWorktree?: Record<string, readonly WorkspaceTabRef[]> | null,
  ptyIdsByTabId?: Record<string, readonly string[]> | null
): TerminalVerificationResult {
  if (!selectedEmployee) {
    return {
      status: 'no_agent',
      reason: 'No agent selected. Pick an agent character in the 3D Campus or Active Sessions.',
      ptyId: null,
      card: null
    }
  }

  if (!selectedEmployee.ptyId) {
    return {
      status: 'unverified',
      reason: 'No verified terminal for this agent (session has no active PTY stream)',
      ptyId: null,
      card: null
    }
  }

  // 1. Authoritative card match
  const card = snapshotCards.find(
    (c) =>
      c.paneKey === selectedEmployee.paneKey &&
      c.worktreeId === selectedEmployee.revealTarget.worktreeId &&
      c.tabId === selectedEmployee.revealTarget.tabId &&
      (selectedEmployee.leafId === null || c.leafId === selectedEmployee.leafId)
  )

  if (!card) {
    return {
      status: 'unverified',
      reason: 'No verified terminal for this agent (agent pane not found in current live snapshot)',
      ptyId: null,
      card: null
    }
  }

  // 2. Strict PTY identity match
  if (!card.ptyId || card.ptyId !== selectedEmployee.ptyId) {
    return {
      status: 'unverified',
      reason: 'No verified terminal for this agent (PTY stream identity mismatch)',
      ptyId: null,
      card
    }
  }

  // 3. Workspace tab containment check
  if (tabsByWorktree) {
    const tabs = tabsByWorktree[selectedEmployee.revealTarget.worktreeId]
    if (tabs && tabs.length > 0) {
      const matchingTab = tabs.find((t) => t.id === selectedEmployee.revealTarget.tabId)
      if (!matchingTab) {
        return {
          status: 'unverified',
          reason: 'No verified terminal for this agent (tab does not belong to agent workspace)',
          ptyId: null,
          card
        }
      }
    }
  }

  // 4. Tab PTY registration check
  if (ptyIdsByTabId) {
    const knownPtys = ptyIdsByTabId[selectedEmployee.revealTarget.tabId]
    if (knownPtys && knownPtys.length > 0 && !knownPtys.includes(card.ptyId)) {
      return {
        status: 'unverified',
        reason: 'No verified terminal for this agent (PTY is not registered to agent tab)',
        ptyId: null,
        card
      }
    }
  }

  // 5. Host kind & multi-pane isolation analysis
  const isRemote =
    (card.hostKind !== undefined && card.hostKind !== 'local') ||
    selectedEmployee.executionHostId !== 'local'

  const isMultiPane =
    snapshotCards.filter((c) => c.tabId === card.tabId).length > 1 ||
    Boolean(ptyIdsByTabId && ptyIdsByTabId[card.tabId] && ptyIdsByTabId[card.tabId].length > 1)

  const isSafeForDirectInput = !isRemote && !isMultiPane && selectedEmployee.isRoutable

  return {
    status: 'verified',
    ptyId: card.ptyId,
    card,
    isRemote,
    isMultiPane,
    isSafeForDirectInput,
    terminalInput: card.terminalInput ?? null
  }
}
