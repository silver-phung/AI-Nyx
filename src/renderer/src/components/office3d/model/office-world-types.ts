import type {
  DashboardBucket,
  DashboardCardDotState,
  DashboardCardHostKind,
  DashboardCardWorkspaceKind
} from '../../../../../shared/dashboard-snapshot'
import type { ExecutionHostId } from '../../../../../shared/execution-host'

export type OfficeEmployeeDisplayState =
  | 'working'
  | 'monitoring'
  | 'attention'
  | 'done'
  | 'idle'

export type ZoneId = `zone:${string}:${DashboardCardWorkspaceKind}:${string}:${string}`
export type EmployeeId = `${string}::${string}`
export type DeskId = `${ZoneId}::desk-${number}`

export interface OfficeRevealTarget {
  readonly repoId: string
  readonly worktreeId: string
  readonly tabId: string
  readonly leafId: string | null
  readonly executionHostId: ExecutionHostId
  readonly isRoutable: boolean
}

export interface OfficeDesk {
  readonly deskId: DeskId
  readonly zoneId: ZoneId
  readonly slotIndex: number
  /** Invariant relative logical grid X coordinate (-1 for Left column, +1 for Right column) */
  readonly gridX: number
  /** Invariant relative logical grid Y coordinate (row offset along desk bank) */
  readonly gridY: number
  /** Currently seated employee ID, or null if slot is vacant */
  readonly employeeId: EmployeeId | null
  readonly isOccupied: boolean
}

export interface OfficeZone {
  readonly zoneId: ZoneId
  readonly repoId: string
  readonly worktreeId: string
  readonly repoName: string
  readonly worktreeName: string
  readonly displayName: string
  readonly workspaceKind: DashboardCardWorkspaceKind
  readonly rawExecutionHostId: ExecutionHostId | null
  readonly executionHostId: ExecutionHostId
  readonly hostKind: DashboardCardHostKind
  readonly hostLabel: string
  readonly isRoutable: boolean
  readonly desks: readonly OfficeDesk[]
  readonly capacity: number
  readonly activeEmployeeCount: number
  readonly review?: {
    readonly number: number
    readonly state: 'open' | 'closed' | 'merged' | 'draft'
  }
  readonly floorIndex: number
}

export interface OfficeEmployee {
  readonly employeeId: EmployeeId
  readonly paneKey: string
  readonly ptyId: string | null
  readonly tabId: string
  readonly leafId: string | null
  readonly zoneId: ZoneId
  readonly deskId: DeskId
  readonly slotIndex: number
  readonly displayState: OfficeEmployeeDisplayState
  readonly bucket: DashboardBucket
  readonly dotState: DashboardCardDotState
  readonly agentType?: string
  readonly task: string
  readonly askSummary?: string
  readonly lastUserMessage?: string
  readonly lastAgentMessage?: string
  readonly startedAt: number
  readonly stateChangedAt: number
  readonly rawExecutionHostId: ExecutionHostId | null
  readonly executionHostId: ExecutionHostId
  readonly isRoutable: boolean
  readonly revealTarget: OfficeRevealTarget
}

export interface OfficeWaitingWorkspace {
  readonly zoneId: ZoneId
  readonly repoId: string
  readonly worktreeId: string
  readonly repoName: string
  readonly worktreeName: string
  readonly workspaceKind: DashboardCardWorkspaceKind
  readonly rawExecutionHostId: ExecutionHostId | null
  readonly executionHostId: ExecutionHostId
  readonly hostKind: DashboardCardHostKind
  readonly hostLabel: string
  readonly isRoutable: boolean
  readonly review?: {
    readonly number: number
    readonly state: 'open' | 'closed' | 'merged' | 'draft'
  }
  readonly floorIndex: number
  readonly navigationTarget: {
    readonly repoId: string
    readonly worktreeId: string
    readonly executionHostId: ExecutionHostId
    readonly isRoutable: boolean
  }
}

export interface OfficeWaitingRoom {
  readonly count: number
  readonly workspaces: readonly OfficeWaitingWorkspace[]
}

export interface OfficeWorldDiagnostic {
  readonly code: 'DUPLICATE_CARD_DROPPED' | 'UNRESOLVED_HOST_ISOLATED' | 'SPARSE_CARD_SANITIZED'
  readonly message: string
  readonly paneKey?: string
  readonly repoId?: string
  readonly worktreeId?: string
  readonly executionHostId?: string
  readonly droppedCardDetails?: {
    readonly task: string
    readonly stateChangedAt: number
    readonly startedAt: number
  }
}

export interface OfficeWorldStats {
  readonly totalWorkspaces: number
  readonly activeZones: number
  readonly waitingWorkspaces: number
  readonly totalEmployees: number
  readonly workingCount: number
  readonly monitoringCount: number
  readonly attentionCount: number
  readonly doneCount: number
  readonly idleCount: number
}

export interface OfficeWorld {
  readonly generatedAt: number
  readonly zones: readonly OfficeZone[]
  readonly waitingRoom: OfficeWaitingRoom
  readonly employees: readonly OfficeEmployee[]
  readonly lookup: {
    readonly employeeById: ReadonlyMap<EmployeeId, OfficeEmployee>
    readonly employeesByZoneId: ReadonlyMap<ZoneId, readonly OfficeEmployee[]>
    readonly zoneById: ReadonlyMap<ZoneId, OfficeZone>
  }
  readonly diagnostics: readonly OfficeWorldDiagnostic[]
  readonly stats: OfficeWorldStats
}
