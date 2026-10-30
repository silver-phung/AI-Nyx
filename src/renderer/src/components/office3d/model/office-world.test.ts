import { describe, expect, it } from 'vitest'
import type { DashboardCard, DashboardSnapshot } from '../../../../../shared/dashboard-snapshot'
import { UNRESOLVED_OWNER_HOST_ID } from '../../../../../shared/execution-host'
import { buildOfficeWorld } from './build-office-world'
import { createZoneId, parseZoneId } from './office-identity'
import { OfficeWorldSeatingHolder } from './office-seating-holder'

describe('OfficeWorld Deterministic Model', () => {
  it('correctly maps live DashboardSnapshot into OfficeWorld zones and employees', () => {
    const card: DashboardCard = {
      paneKey: 'tab-1:leaf-1',
      tabId: 'tab-1',
      leafId: 'leaf-1',
      ptyId: 'pty-100',
      executionHostId: 'local',
      hostKind: 'local',
      hostLabel: 'Local',
      repoId: 'repo-nyx',
      worktreeId: 'main',
      repoName: 'nyx',
      worktreeName: 'main',
      workspaceKind: 'worktree',
      bucket: 'working',
      dotState: 'working',
      task: 'Build 3D Office Sprint',
      conversationName: 'Sprint',
      startedAt: 1000,
      stateChangedAt: 2000,
      finishedAt: null,
      unseen: false,
      agentType: 'codex'
    }

    const snapshot: DashboardSnapshot = {
      generatedAt: 3000,
      workspaces: [
        {
          repoId: 'repo-nyx',
          worktreeId: 'main',
          repoName: 'nyx',
          worktreeName: 'main',
          workspaceKind: 'worktree',
          executionHostId: 'local',
          hostKind: 'local',
          hostLabel: 'Local'
        }
      ],
      cards: [card]
    }

    const seatingHolder = new OfficeWorldSeatingHolder()
    const world = buildOfficeWorld(snapshot, { seatingHolder })

    expect(world.zones.length).toBe(1)
    expect(world.employees.length).toBe(1)
    expect(world.stats.totalEmployees).toBe(1)
    expect(world.stats.workingCount).toBe(1)

    const emp = world.employees[0]
    expect(emp.tabId).toBe('tab-1')
    expect(emp.leafId).toBe('leaf-1')
    expect(emp.ptyId).toBe('pty-100')
    expect(emp.slotIndex).toBe(0)
    expect(emp.displayState).toBe('working')
    expect(emp.isRoutable).toBe(true)
    expect(emp.revealTarget.tabId).toBe('tab-1')
  })

  it('handles middle employee departure and reuses vacated desk slot for new arrival', () => {
    const seatingHolder = new OfficeWorldSeatingHolder()

    const makeCard = (id: string, startedAt: number): DashboardCard => ({
      paneKey: `tab-${id}:leaf-${id}`,
      tabId: `tab-${id}`,
      leafId: `leaf-${id}`,
      ptyId: `pty-${id}`,
      executionHostId: 'local',
      hostKind: 'local',
      hostLabel: 'Local',
      repoId: 'repo-nyx',
      worktreeId: 'main',
      repoName: 'nyx',
      worktreeName: 'main',
      workspaceKind: 'worktree',
      bucket: 'working',
      dotState: 'working',
      task: `Agent ${id}`,
      startedAt,
      stateChangedAt: startedAt + 100,
      finishedAt: null,
      unseen: false,
      agentType: 'codex'
    })

    // Step 1: Seat A, B, C
    const snap1: DashboardSnapshot = {
      generatedAt: 1000,
      cards: [makeCard('A', 10), makeCard('B', 20), makeCard('C', 30)]
    }
    const world1 = buildOfficeWorld(snap1, { seatingHolder, currentTimeMs: 1000 })
    expect(world1.lookup.employeeById.get('local::tab-A%3Aleaf-A')?.slotIndex).toBe(0)
    expect(world1.lookup.employeeById.get('local::tab-B%3Aleaf-B')?.slotIndex).toBe(1)
    expect(world1.lookup.employeeById.get('local::tab-C%3Aleaf-C')?.slotIndex).toBe(2)

    // Step 2: Remove B
    const snap2: DashboardSnapshot = {
      generatedAt: 2000,
      cards: [makeCard('A', 10), makeCard('C', 30)]
    }
    const world2 = buildOfficeWorld(snap2, { seatingHolder, currentTimeMs: 2000 })
    expect(world2.lookup.employeeById.get('local::tab-A%3Aleaf-A')?.slotIndex).toBe(0)
    expect(world2.lookup.employeeById.get('local::tab-C%3Aleaf-C')?.slotIndex).toBe(2)
    const desk1 = world2.zones[0].desks.find((d) => d.slotIndex === 1)
    expect(desk1?.isOccupied).toBe(false)
    expect(desk1?.employeeId).toBeNull()

    // Step 3: Add D -> D should reclaim freed slot 1
    const snap3: DashboardSnapshot = {
      generatedAt: 3000,
      cards: [makeCard('A', 10), makeCard('C', 30), makeCard('D', 40)]
    }
    const world3 = buildOfficeWorld(snap3, { seatingHolder, currentTimeMs: 3000 })
    expect(world3.lookup.employeeById.get('local::tab-D%3Aleaf-D')?.slotIndex).toBe(1)
    expect(world3.lookup.employeeById.get('local::tab-A%3Aleaf-A')?.slotIndex).toBe(0)
    expect(world3.lookup.employeeById.get('local::tab-C%3Aleaf-C')?.slotIndex).toBe(2)
  })

  it('safely handles missing executionHostId and marks unresolved hosts non-routable', () => {
    const card: DashboardCard = {
      paneKey: 'tab-unresolved:leaf-1',
      tabId: 'tab-unresolved',
      leafId: 'leaf-1',
      ptyId: null,
      hostKind: 'remote',
      hostLabel: 'Unknown',
      repoId: 'repo-isolated',
      worktreeId: 'isolated-branch',
      repoName: 'isolated',
      worktreeName: 'branch',
      workspaceKind: 'worktree',
      bucket: 'attention',
      dotState: 'waiting',
      task: 'Waiting for prompt',
      startedAt: 100,
      stateChangedAt: 200,
      finishedAt: null,
      unseen: false,
      agentType: 'claude'
    }

    const snapshot: DashboardSnapshot = {
      generatedAt: 500,
      cards: [card],
      workspaces: []
    }

    const world = buildOfficeWorld(snapshot)
    expect(world.employees.length).toBe(1)
    const emp = world.employees[0]
    expect(emp.executionHostId).toBe(UNRESOLVED_OWNER_HOST_ID)
    expect(emp.isRoutable).toBe(false)
    expect(emp.revealTarget.isRoutable).toBe(false)
    expect(world.diagnostics.some((d) => d.code === 'UNRESOLVED_HOST_ISOLATED')).toBe(true)
  })

  it('safely handles duplicate cards deterministically and emits diagnostic', () => {
    const duplicateCard1: DashboardCard = {
      paneKey: 'tab-dup:leaf-dup',
      tabId: 'tab-dup',
      leafId: 'leaf-dup',
      ptyId: 'pty-1',
      executionHostId: 'local',
      hostKind: 'local',
      hostLabel: 'Local',
      repoId: 'repo-1',
      worktreeId: 'main',
      repoName: 'r1',
      worktreeName: 'main',
      workspaceKind: 'worktree',
      bucket: 'working',
      dotState: 'working',
      task: 'Old run',
      startedAt: 100,
      stateChangedAt: 500,
      finishedAt: null,
      unseen: false,
      agentType: 'terminal'
    }

    const duplicateCard2: DashboardCard = {
      ...duplicateCard1,
      task: 'Newer run',
      stateChangedAt: 900 // higher stateChangedAt wins!
    }

    const snapshot: DashboardSnapshot = {
      generatedAt: 1000,
      cards: [duplicateCard1, duplicateCard2]
    }

    const world = buildOfficeWorld(snapshot)
    expect(world.employees.length).toBe(1)
    expect(world.employees[0].task).toBe('Newer run')
    expect(world.diagnostics.some((d) => d.code === 'DUPLICATE_CARD_DROPPED')).toBe(true)
  })

  it('encodes and parses ZoneId with special characters', () => {
    const zoneId = createZoneId('ssh:server:22', 'worktree', 'my::repo', 'feature::branch/sub')
    expect(zoneId).toBe(
      'zone:ssh%3Aserver%3A22:worktree:my%3A%3Arepo:feature%3A%3Abranch%2Fsub'
    )
    const parsed = parseZoneId(zoneId)
    expect(parsed?.executionHostId).toBe('ssh:server:22')
    expect(parsed?.repoId).toBe('my::repo')
    expect(parsed?.worktreeId).toBe('feature::branch/sub')
  })

  it('guarantees unique, collision-free floorIndex across active zones and waiting workspaces', () => {
    const seatingHolder = new OfficeWorldSeatingHolder()

    // 1 Active zone (W1) and 2 Waiting workspaces (W2, W3)
    const snapshot1: DashboardSnapshot = {
      generatedAt: 1000,
      workspaces: [
        {
          repoId: 'repo-1',
          worktreeId: 'wt-1',
          repoName: 'r1',
          worktreeName: 'w1',
          workspaceKind: 'worktree',
          executionHostId: 'local',
          hostKind: 'local'
        },
        {
          repoId: 'repo-2',
          worktreeId: 'wt-2',
          repoName: 'r2',
          worktreeName: 'w2',
          workspaceKind: 'worktree',
          executionHostId: 'local',
          hostKind: 'local'
        },
        {
          repoId: 'repo-3',
          worktreeId: 'wt-3',
          repoName: 'r3',
          worktreeName: 'w3',
          workspaceKind: 'worktree',
          executionHostId: 'local',
          hostKind: 'local'
        }
      ],
      cards: [
        {
          paneKey: 'tab-1:leaf-1',
          tabId: 'tab-1',
          leafId: 'leaf-1',
          ptyId: 'pty-1',
          executionHostId: 'local',
          repoId: 'repo-1',
          worktreeId: 'wt-1',
          repoName: 'r1',
          worktreeName: 'w1',
          workspaceKind: 'worktree',
          bucket: 'working',
          dotState: 'working',
          agentType: 'codex',
          task: 'Task on W1',
          startedAt: 100,
          stateChangedAt: 200,
          finishedAt: null,
          unseen: false
        }
      ]
    }

    const world1 = buildOfficeWorld(snapshot1, { seatingHolder, currentTimeMs: 1000 })
    expect(world1.zones.length).toBe(1)
    expect(world1.waitingRoom.workspaces.length).toBe(2)

    const floorIndices1 = [
      world1.zones[0].floorIndex,
      ...world1.waitingRoom.workspaces.map((w) => w.floorIndex)
    ]
    // All pods must have unique spatial positions
    expect(new Set(floorIndices1).size).toBe(3)
    const w1InitialFloor = world1.zones[0].floorIndex
    const w2InitialFloor = world1.waitingRoom.workspaces.find((w) => w.worktreeId === 'wt-2')!.floorIndex
    const w3InitialFloor = world1.waitingRoom.workspaces.find((w) => w.worktreeId === 'wt-3')!.floorIndex

    // Promotion: Launch an agent in W2 -> W2 becomes active zone, W1 remains active
    const snapshot2: DashboardSnapshot = {
      ...snapshot1,
      generatedAt: 2000,
      cards: [
        snapshot1.cards[0],
        {
          paneKey: 'tab-2:leaf-2',
          tabId: 'tab-2',
          leafId: 'leaf-2',
          ptyId: 'pty-2',
          executionHostId: 'local',
          repoId: 'repo-2',
          worktreeId: 'wt-2',
          repoName: 'r2',
          worktreeName: 'w2',
          workspaceKind: 'worktree',
          bucket: 'working',
          dotState: 'working',
          agentType: 'codex',
          task: 'Task on W2',
          startedAt: 1500,
          stateChangedAt: 1600,
          finishedAt: null,
          unseen: false
        }
      ]
    }

    const world2 = buildOfficeWorld(snapshot2, { seatingHolder, currentTimeMs: 2000 })
    expect(world2.zones.length).toBe(2)
    expect(world2.waitingRoom.workspaces.length).toBe(1)

    // W1 and W2 must keep their exact spatial positions, W3 must not shift
    const w1ActiveFloor = world2.zones.find((z) => z.worktreeId === 'wt-1')!.floorIndex
    const w2ActiveFloor = world2.zones.find((z) => z.worktreeId === 'wt-2')!.floorIndex
    const w3WaitingFloor = world2.waitingRoom.workspaces.find((w) => w.worktreeId === 'wt-3')!.floorIndex

    expect(w1ActiveFloor).toBe(w1InitialFloor)
    expect(w2ActiveFloor).toBe(w2InitialFloor)
    expect(w3WaitingFloor).toBe(w3InitialFloor)

    // Demotion: W1 finishes all agents -> returns to waiting room
    const snapshot3: DashboardSnapshot = {
      ...snapshot1,
      generatedAt: 3000,
      cards: [snapshot2.cards[1]] // Only W2 has an agent now
    }

    const world3 = buildOfficeWorld(snapshot3, { seatingHolder, currentTimeMs: 3000 })
    expect(world3.zones.length).toBe(1) // W2 is active
    expect(world3.waitingRoom.workspaces.length).toBe(2) // W1 and W3 are waiting

    const w1DemotedFloor = world3.waitingRoom.workspaces.find((w) => w.worktreeId === 'wt-1')!.floorIndex
    const w2RetainedFloor = world3.zones.find((z) => z.worktreeId === 'wt-2')!.floorIndex
    const w3RetainedFloor = world3.waitingRoom.workspaces.find((w) => w.worktreeId === 'wt-3')!.floorIndex

    expect(w1DemotedFloor).toBe(w1InitialFloor)
    expect(w2RetainedFloor).toBe(w2InitialFloor)
    expect(w3RetainedFloor).toBe(w3InitialFloor)
  })

  it('safely handles multi-host collisions for identical repo/worktree without guessing remote host', () => {
    // 2 workspaces with identical repoId and worktreeId on DIFFERENT hosts
    const workspaces = [
      {
        repoId: 'shared-repo',
        worktreeId: 'feature-x',
        repoName: 'shared',
        worktreeName: 'fx',
        workspaceKind: 'worktree' as const,
        executionHostId: 'local' as const,
        hostKind: 'local' as const
      },
      {
        repoId: 'shared-repo',
        worktreeId: 'feature-x',
        repoName: 'shared',
        worktreeName: 'fx',
        workspaceKind: 'worktree' as const,
        executionHostId: 'ssh:remote-server' as const,
        hostKind: 'remote' as const
      }
    ]

    // Card has NO executionHostId specified
    const card: DashboardCard = {
      paneKey: 'tab-collision:leaf-1',
      tabId: 'tab-collision',
      leafId: 'leaf-1',
      ptyId: null,
      repoId: 'shared-repo',
      worktreeId: 'feature-x',
      repoName: 'shared',
      worktreeName: 'fx',
      workspaceKind: 'worktree',
      bucket: 'working',
      dotState: 'working',
      agentType: 'codex',
      task: 'Colliding card without host',
      startedAt: 100,
      stateChangedAt: 200,
      finishedAt: null,
      unseen: false
    }

    const snapshot: DashboardSnapshot = {
      generatedAt: 1000,
      workspaces,
      cards: [card]
    }

    const world = buildOfficeWorld(snapshot)
    expect(world.employees.length).toBe(1)
    const emp = world.employees[0]
    // Because 2 matching workspaces on different hosts exist, resolution is ambiguous.
    // Must NEVER guess local or remote-server. Must isolate safely.
    expect(emp.executionHostId).toBe(UNRESOLVED_OWNER_HOST_ID)
    expect(emp.isRoutable).toBe(false)
    expect(emp.revealTarget.isRoutable).toBe(false)
    expect(world.diagnostics.some((d) => d.code === 'UNRESOLVED_HOST_ISOLATED')).toBe(true)
  })
})
