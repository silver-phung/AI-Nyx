import type {
  DashboardCard,
  DashboardCardWorkspaceKind,
  DashboardWorkspace
} from '../../../../../shared/dashboard-snapshot'
import {
  type ExecutionHostId,
  UNRESOLVED_OWNER_HOST_ID,
  parseRoutableExecutionHostId
} from '../../../../../shared/execution-host'
import type { EmployeeId, ZoneId } from './office-world-types'

export function createZoneId(
  executionHostId: ExecutionHostId,
  workspaceKind: DashboardCardWorkspaceKind,
  repoId: string,
  worktreeId: string
): ZoneId {
  return `zone:${encodeURIComponent(executionHostId)}:${encodeURIComponent(workspaceKind)}:${encodeURIComponent(repoId)}:${encodeURIComponent(worktreeId)}` as ZoneId
}

export function parseZoneId(zoneId: ZoneId): {
  executionHostId: ExecutionHostId
  workspaceKind: DashboardCardWorkspaceKind
  repoId: string
  worktreeId: string
} | null {
  const parts = zoneId.split(':')
  if (parts.length !== 5 || parts[0] !== 'zone') {
    return null
  }
  return {
    executionHostId: decodeURIComponent(parts[1]) as ExecutionHostId,
    workspaceKind: decodeURIComponent(parts[2]) as DashboardCardWorkspaceKind,
    repoId: decodeURIComponent(parts[3]),
    worktreeId: decodeURIComponent(parts[4])
  }
}

export function createEmployeeId(
  executionHostId: ExecutionHostId,
  paneKey: string
): EmployeeId {
  return `${encodeURIComponent(executionHostId)}::${encodeURIComponent(paneKey)}` as EmployeeId
}

export function deterministicCompareStrings(a: string, b: string): number {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

export function resolveCardExecutionHost(
  card: DashboardCard,
  workspaces: readonly DashboardWorkspace[] | undefined
): {
  rawExecutionHostId: ExecutionHostId | null
  executionHostId: ExecutionHostId
  isRoutable: boolean
} {
  // 1. If card already has an explicit executionHostId, validate it directly
  if (card.executionHostId) {
    const routable = parseRoutableExecutionHostId(card.executionHostId) !== null
    return {
      rawExecutionHostId: card.executionHostId,
      executionHostId: card.executionHostId,
      isRoutable: routable
    }
  }

  // 2. Search for an unambiguous matching workspace in snapshot.workspaces
  const matchingWorkspaces = (workspaces ?? []).filter(
    (w) =>
      w.repoId === card.repoId &&
      w.worktreeId === card.worktreeId &&
      (!card.workspaceKind || w.workspaceKind === card.workspaceKind)
  )

  // Disambiguation: if there are multiple workspaces with the same repoId/worktreeId
  // (e.g. identical repo/worktree on local vs remote host), it is AMBIGUOUS.
  // We must NEVER guess a remote host or synthesize a routable ID.
  if (matchingWorkspaces.length === 1 && matchingWorkspaces[0].executionHostId) {
    const candidateHostId = matchingWorkspaces[0].executionHostId
    const routableHost = parseRoutableExecutionHostId(candidateHostId)
    if (routableHost !== null) {
      return {
        rawExecutionHostId: null,
        executionHostId: routableHost.id,
        isRoutable: true
      }
    }
  }

  // 3. Ambiguous, missing, or non-routable match -> fallback to canonical UNRESOLVED_OWNER_HOST_ID
  return {
    rawExecutionHostId: null,
    executionHostId: UNRESOLVED_OWNER_HOST_ID,
    isRoutable: false
  }
}

export function compareDuplicateCards(a: DashboardCard, b: DashboardCard): number {
  // 1. Higher stateChangedAt wins (most recent state transition - GUARANTEED field)
  if (a.stateChangedAt !== b.stateChangedAt) {
    return b.stateChangedAt - a.stateChangedAt
  }
  // 2. Higher startedAt wins (more recently started session - GUARANTEED field)
  if (a.startedAt !== b.startedAt) {
    return b.startedAt - a.startedAt
  }
  // 3. Deterministic code-point comparison on task (GUARANTEED string)
  if (a.task !== b.task) {
    return deterministicCompareStrings(a.task, b.task)
  }
  // 4. Deterministic code-point comparison on conversationName
  const aConv = a.conversationName ?? ''
  const bConv = b.conversationName ?? ''
  if (aConv !== bConv) {
    return deterministicCompareStrings(aConv, bConv)
  }
  // 5. Final fallback on tabId/leafId strings (GUARANTEED strings)
  const aStr = `${a.tabId}:${a.leafId ?? ''}`
  const bStr = `${b.tabId}:${b.leafId ?? ''}`
  return deterministicCompareStrings(aStr, bStr)
}
