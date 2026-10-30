import {
  dashboardCardDisplayState,
  type DashboardCard,
  type DashboardCardReview,
  type DashboardSnapshot,
  type DashboardWorkspace
} from '../../../../../shared/dashboard-snapshot'
import type {
  DeskId,
  EmployeeId,
  OfficeEmployee,
  OfficeEmployeeDisplayState,
  OfficeRevealTarget,
  OfficeWaitingRoom,
  OfficeWaitingWorkspace,
  OfficeWorld,
  OfficeWorldDiagnostic,
  OfficeWorldStats,
  OfficeZone,
  ZoneId
} from './office-world-types'
import {
  compareDuplicateCards,
  createEmployeeId,
  createZoneId,
  resolveCardExecutionHost
} from './office-identity'
import { allocateZoneDesks } from './office-desk-allocator'
import { OfficeWorldSeatingHolder } from './office-seating-holder'

export interface BuildOfficeWorldOptions {
  readonly currentTimeMs?: number
  readonly seatingHolder?: OfficeWorldSeatingHolder
}

export function cloneReview(
  review?: DashboardCardReview
): { readonly number: number; readonly state: 'open' | 'closed' | 'merged' | 'draft' } | undefined {
  if (!review) return undefined
  return {
    number: review.number,
    state: review.state
  }
}

export function toOfficeDisplayState(
  card: Pick<DashboardCard, 'dotState' | 'workingMode' | 'unseen' | 'bucket'>
): OfficeEmployeeDisplayState {
  if (card.bucket === 'attention') {
    return 'attention'
  }
  const raw = dashboardCardDisplayState(card)
  if (raw === 'blocked' || raw === 'waiting') {
    return 'attention'
  }
  if (raw === 'monitoring') {
    return 'monitoring'
  }
  if (raw === 'done') {
    return 'done'
  }
  if (raw === 'working') {
    return 'working'
  }
  return 'idle'
}

export function buildOfficeWorld(
  snapshot: DashboardSnapshot,
  options?: BuildOfficeWorldOptions
): OfficeWorld {
  const currentTimeMs = options?.currentTimeMs ?? snapshot.generatedAt
  const seatingHolder = options?.seatingHolder ?? OfficeWorldSeatingHolder.getInstance()
  const diagnostics: OfficeWorldDiagnostic[] = []

  interface ResolvedCardEntry {
    readonly card: DashboardCard
    readonly rawExecutionHostId: DashboardCard['executionHostId'] | null
    readonly executionHostId: DashboardCard['executionHostId'] & string
    readonly isRoutable: boolean
    readonly employeeId: EmployeeId
    readonly zoneId: ZoneId
  }

  const rawEntries: ResolvedCardEntry[] = []
  for (const card of snapshot.cards) {
    const hostResolution = resolveCardExecutionHost(card, snapshot.workspaces)
    if (!hostResolution.isRoutable && hostResolution.rawExecutionHostId === null) {
      diagnostics.push({
        code: 'UNRESOLVED_HOST_ISOLATED',
        message: `Card ${card.paneKey} has no dialable executionHostId; routing disabled`,
        paneKey: card.paneKey,
        repoId: card.repoId,
        worktreeId: card.worktreeId,
        executionHostId: hostResolution.executionHostId
      })
    }

    const employeeId = createEmployeeId(hostResolution.executionHostId, card.paneKey)
    const workspaceKind = card.workspaceKind ?? 'worktree'
    const zoneId = createZoneId(
      hostResolution.executionHostId,
      workspaceKind,
      card.repoId,
      card.worktreeId
    )

    rawEntries.push({
      card: { ...card, executionHostId: hostResolution.executionHostId },
      rawExecutionHostId: hostResolution.rawExecutionHostId,
      executionHostId: hostResolution.executionHostId,
      isRoutable: hostResolution.isRoutable,
      employeeId,
      zoneId
    })
  }

  // Deduplicate by employeeId using deterministic compareDuplicateCards
  const entriesByEmployeeId = new Map<EmployeeId, ResolvedCardEntry[]>()
  for (const entry of rawEntries) {
    const list = entriesByEmployeeId.get(entry.employeeId) ?? []
    list.push(entry)
    entriesByEmployeeId.set(entry.employeeId, list)
  }

  const deduplicatedEntries: ResolvedCardEntry[] = []
  for (const [empId, group] of entriesByEmployeeId) {
    if (group.length === 1) {
      deduplicatedEntries.push(group[0])
    } else {
      group.sort((a, b) => compareDuplicateCards(a.card, b.card))
      const winner = group[0]
      deduplicatedEntries.push(winner)

      for (let i = 1; i < group.length; i++) {
        const dropped = group[i]
        diagnostics.push({
          code: 'DUPLICATE_CARD_DROPPED',
          message: `Duplicate card dropped for employee ${empId}`,
          paneKey: dropped.card.paneKey,
          repoId: dropped.card.repoId,
          worktreeId: dropped.card.worktreeId,
          executionHostId: dropped.executionHostId,
          droppedCardDetails: {
            task: dropped.card.task,
            stateChangedAt: dropped.card.stateChangedAt,
            startedAt: dropped.card.startedAt
          }
        })
      }
    }
  }

  // 2. Group deduplicated cards by zoneId
  const entriesByZoneId = new Map<ZoneId, ResolvedCardEntry[]>()
  for (const entry of deduplicatedEntries) {
    const list = entriesByZoneId.get(entry.zoneId) ?? []
    list.push(entry)
    entriesByZoneId.set(entry.zoneId, list)
  }

  // 3. Process each active Zone
  const zones: OfficeZone[] = []
  const allEmployees: OfficeEmployee[] = []
  const employeeById = new Map<EmployeeId, OfficeEmployee>()
  const employeesByZoneId = new Map<ZoneId, readonly OfficeEmployee[]>()
  const zoneById = new Map<ZoneId, OfficeZone>()

  // Keep a set of active workspace keys for pruning seatingHolder if workspaces were provided
  if (snapshot.workspaces && snapshot.workspaces.length > 0) {
    const activeWorkspaceKeys = new Set<string>()
    for (const w of snapshot.workspaces) {
      activeWorkspaceKeys.add(`${w.repoId}::${w.worktreeId}`)
    }
    seatingHolder.pruneStaleWorkspaces(activeWorkspaceKeys)
  }

  for (const [zoneId, zoneEntries] of entriesByZoneId) {
    const sample = zoneEntries[0]
    const matchingWorkspace: DashboardWorkspace | undefined = (snapshot.workspaces ?? []).find(
      (w) => w.repoId === sample.card.repoId && w.worktreeId === sample.card.worktreeId
    )

    const previousRecord = seatingHolder.getZoneRecord(zoneId)
    const floorIndex = seatingHolder.allocateFloorIndex(zoneId)

    const allocation = allocateZoneDesks(
      zoneId,
      zoneEntries.map((e) => e.card),
      previousRecord?.seatMap,
      previousRecord?.capacity ?? 4
    )

    seatingHolder.setZoneRecord(
      zoneId,
      {
        floorIndex,
        capacity: allocation.capacity,
        seatMap: allocation.employeeSeats,
        lastActiveAt: currentTimeMs
      },
      currentTimeMs
    )

    const workspaceKind = sample.card.workspaceKind ?? 'worktree'
    const zone: OfficeZone = {
      zoneId,
      repoId: sample.card.repoId,
      worktreeId: sample.card.worktreeId,
      repoName: sample.card.repoName,
      worktreeName: sample.card.worktreeName,
      displayName: `${sample.card.repoName}/${sample.card.worktreeName}`,
      workspaceKind,
      rawExecutionHostId: sample.rawExecutionHostId ?? null,
      executionHostId: sample.executionHostId,
      hostKind: sample.card.hostKind ?? 'local',
      hostLabel: sample.card.hostLabel ?? 'Local',
      isRoutable: sample.isRoutable,
      desks: allocation.desks,
      capacity: allocation.capacity,
      activeEmployeeCount: zoneEntries.length,
      review: cloneReview(matchingWorkspace?.review ?? sample.card.review),
      floorIndex
    }

    zones.push(zone)
    zoneById.set(zoneId, zone)

    const zoneEmployees: OfficeEmployee[] = []
    for (const entry of zoneEntries) {
      const slotIndex = allocation.employeeSeats.get(entry.employeeId) ?? 0
      const deskId = `${zoneId}::desk-${slotIndex}` as DeskId
      const displayState = toOfficeDisplayState(entry.card)

      const revealTarget: OfficeRevealTarget = {
        repoId: entry.card.repoId,
        worktreeId: entry.card.worktreeId,
        tabId: entry.card.tabId,
        leafId: entry.card.leafId,
        executionHostId: entry.executionHostId,
        isRoutable: entry.isRoutable
      }

      const emp: OfficeEmployee = {
        employeeId: entry.employeeId,
        paneKey: entry.card.paneKey,
        ptyId: entry.card.ptyId,
        tabId: entry.card.tabId,
        leafId: entry.card.leafId,
        zoneId,
        deskId,
        slotIndex,
        displayState,
        bucket: entry.card.bucket,
        dotState: entry.card.dotState,
        agentType: entry.card.agentType ?? 'codex',
        task: entry.card.task,
        askSummary: entry.card.askSummary,
        lastUserMessage: entry.card.lastUserMessage,
        lastAgentMessage: entry.card.lastAgentMessage,
        startedAt: entry.card.startedAt,
        stateChangedAt: entry.card.stateChangedAt,
        rawExecutionHostId: entry.rawExecutionHostId ?? null,
        executionHostId: entry.executionHostId,
        isRoutable: entry.isRoutable,
        revealTarget
      }

      zoneEmployees.push(emp)
      allEmployees.push(emp)
      employeeById.set(emp.employeeId, emp)
    }

    employeesByZoneId.set(zoneId, zoneEmployees)
  }

  // 4. Waiting Room: workspaces with 0 cards
  const waitingWorkspaces: OfficeWaitingWorkspace[] = []
  for (const w of snapshot.workspaces ?? []) {
    const isOccupied = zones.some((z) => z.repoId === w.repoId && z.worktreeId === w.worktreeId)
    if (!isOccupied) {
      const workspaceKind = w.workspaceKind ?? 'worktree'
      const resolvedHost = resolveCardExecutionHost(
        {
          repoId: w.repoId,
          worktreeId: w.worktreeId,
          workspaceKind,
          executionHostId: w.executionHostId
        } as DashboardCard,
        snapshot.workspaces
      )

      const zoneId = createZoneId(
        resolvedHost.executionHostId,
        workspaceKind,
        w.repoId,
        w.worktreeId
      )

      const floorIndex = seatingHolder.allocateFloorIndex(zoneId)

      waitingWorkspaces.push({
        zoneId,
        repoId: w.repoId,
        worktreeId: w.worktreeId,
        repoName: w.repoName,
        worktreeName: w.worktreeName,
        workspaceKind,
        rawExecutionHostId: resolvedHost.rawExecutionHostId ?? null,
        executionHostId: resolvedHost.executionHostId,
        hostKind: w.hostKind ?? 'local',
        hostLabel: w.hostLabel ?? 'Local',
        isRoutable: resolvedHost.isRoutable,
        review: cloneReview(w.review),
        floorIndex,
        navigationTarget: {
          repoId: w.repoId,
          worktreeId: w.worktreeId,
          executionHostId: resolvedHost.executionHostId,
          isRoutable: resolvedHost.isRoutable
        }
      })
    }
  }

  const waitingRoom: OfficeWaitingRoom = {
    count: waitingWorkspaces.length,
    workspaces: waitingWorkspaces
  }

  // 5. Aggregate stats
  let workingCount = 0
  let monitoringCount = 0
  let attentionCount = 0
  let doneCount = 0
  let idleCount = 0

  for (const emp of allEmployees) {
    switch (emp.displayState) {
      case 'working':
        workingCount++
        break
      case 'monitoring':
        monitoringCount++
        break
      case 'attention':
        attentionCount++
        break
      case 'done':
        doneCount++
        break
      case 'idle':
        idleCount++
        break
    }
  }

  const stats: OfficeWorldStats = {
    totalWorkspaces: (snapshot.workspaces?.length ?? 0) || (zones.length + waitingWorkspaces.length),
    activeZones: zones.length,
    waitingWorkspaces: waitingWorkspaces.length,
    totalEmployees: allEmployees.length,
    workingCount,
    monitoringCount,
    attentionCount,
    doneCount,
    idleCount
  }

  return {
    generatedAt: snapshot.generatedAt,
    zones,
    waitingRoom,
    employees: allEmployees,
    lookup: {
      employeeById,
      employeesByZoneId,
      zoneById
    },
    diagnostics,
    stats
  }
}
