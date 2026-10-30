import { memo, useMemo } from 'react'
import type { OfficeDesk, OfficeEmployee, OfficeWorld, OfficeZone, ZoneId } from '../model/office-world-types'
import { getDeskGridCoordinates } from '../model/office-desk-allocator'
import { CampusWorld } from './CampusWorld'
import type { CampusZoneId } from './campus/campus-layout'
import type { CampusViewPreset } from './campus/campus-view'
import { ZonePod3D } from './ZonePod3D'
import { OfficeCameraRig } from './OfficeCameraRig'

interface Office3DSceneProps {
  readonly world: OfficeWorld
  readonly selectedEmployee: OfficeEmployee | null
  readonly selectedDesk?: { desk: OfficeDesk; zone: OfficeZone } | null
  readonly selectedZone?: OfficeZone | null
  readonly onSelectEmployee: (employee: OfficeEmployee | null) => void
  readonly onSelectDesk?: (desk: OfficeDesk, zone: OfficeZone) => void
  readonly onFocusEmployee?: (employee: OfficeEmployee) => void
  readonly onSelectZone?: (zone: OfficeZone) => void
  readonly qualityMode: 'high' | 'low'
  readonly viewPreset?: CampusViewPreset
  readonly focusZoneId?: CampusZoneId | null
  readonly viewNonce?: number
}

export const Office3DScene = memo(function Office3DScene({
  world,
  selectedEmployee,
  selectedDesk,
  selectedZone,
  onSelectEmployee,
  onSelectDesk,
  onFocusEmployee,
  onSelectZone,
  qualityMode,
  viewPreset = 'cinematic',
  focusZoneId = null,
  viewNonce = 0
}: Office3DSceneProps) {
  // Combine active zones and waiting room workspaces for 3D spatial layout
  const displayPods = useMemo(() => {
    const list: Array<{ zone: OfficeZone; employees: readonly OfficeEmployee[] }> = []

    // 1. Active zones with employees
    for (const zone of world.zones) {
      list.push({
        zone,
        employees: world.lookup.employeesByZoneId.get(zone.zoneId) ?? []
      })
    }

    // 2. Waiting workspaces (render vacant pods so the office always has desks)
    world.waitingRoom.workspaces.forEach((w) => {
      const vacantDesks: OfficeDesk[] = [0, 1, 2, 3].map((s) => {
        const { gridX, gridY } = getDeskGridCoordinates(s)
        return {
          deskId: `${w.zoneId}::desk-${s}`,
          zoneId: w.zoneId,
          slotIndex: s,
          gridX,
          gridY,
          employeeId: null,
          isOccupied: false
        }
      })

      const zone: OfficeZone = {
        zoneId: w.zoneId,
        repoId: w.repoId,
        worktreeId: w.worktreeId,
        repoName: w.repoName,
        worktreeName: w.worktreeName,
        displayName: `${w.repoName}/${w.worktreeName}`,
        workspaceKind: w.workspaceKind,
        rawExecutionHostId: w.rawExecutionHostId,
        executionHostId: w.executionHostId,
        hostKind: w.hostKind,
        hostLabel: w.hostLabel,
        isRoutable: w.isRoutable,
        desks: vacantDesks,
        capacity: 4,
        activeEmployeeCount: 0,
        review: w.review,
        floorIndex: w.floorIndex
      }

      list.push({ zone, employees: [] })
    })

    // 3. Fallback if repository has 0 workspaces and 0 cards
    if (list.length === 0) {
      const defaultZoneId = 'zone:local:worktree:workspace:main' as ZoneId
      const vacantDesks: OfficeDesk[] = [0, 1, 2, 3].map((s) => {
        const { gridX, gridY } = getDeskGridCoordinates(s)
        return {
          deskId: `${defaultZoneId}::desk-${s}`,
          zoneId: defaultZoneId,
          slotIndex: s,
          gridX,
          gridY,
          employeeId: null,
          isOccupied: false
        }
      })

      list.push({
        zone: {
          zoneId: defaultZoneId,
          repoId: 'repo',
          worktreeId: 'main',
          repoName: 'workspace',
          worktreeName: 'main',
          displayName: 'workspace/main',
          workspaceKind: 'worktree',
          rawExecutionHostId: null,
          executionHostId: 'local',
          hostKind: 'local',
          hostLabel: 'Local',
          isRoutable: true,
          desks: vacantDesks,
          capacity: 4,
          activeEmployeeCount: 0,
          floorIndex: 0
        },
        employees: []
      })
    }

    return list
  }, [world])

  // Determine floor size based on total pod count
  const { width, depth } = useMemo(() => {
    const podCount = Math.max(displayPods.length, 2)
    const rowCount = Math.ceil(podCount / 2)
    const calculatedWidth = 26
    const calculatedDepth = Math.max(20, rowCount * 10 + 6)
    return {
      width: calculatedWidth,
      depth: calculatedDepth
    }
  }, [displayPods.length])

  // Pod rows drive the length of the Coding Studio plinth (two pods per row).
  const podRows = useMemo(() => {
    let maxIndex = 0
    for (const { zone } of displayPods) maxIndex = Math.max(maxIndex, zone.floorIndex)
    return Math.floor(maxIndex / 2) + 1
  }, [displayPods])

  const shadows = qualityMode === 'high'

  return (
    <>
      <CampusWorld world={world} podRows={podRows} shadows={shadows} />

      {/* Render all Workspace Pods */}
      {displayPods.map(({ zone, employees }) => (
        <ZonePod3D
          key={zone.zoneId}
          zone={zone}
          employees={employees}
          selectedEmployeeId={selectedEmployee?.employeeId ?? null}
          selectedDeskId={selectedDesk?.desk.deskId ?? null}
          onSelectEmployee={onSelectEmployee}
          onSelectDesk={onSelectDesk}
          onFocusEmployee={onFocusEmployee}
          onSelectZone={onSelectZone}
          shadows={shadows}
        />
      ))}

      <OfficeCameraRig
        world={world}
        selectedEmployee={selectedEmployee}
        selectedDesk={selectedDesk}
        selectedZone={selectedZone}
        width={width}
        depth={depth}
        viewPreset={viewPreset}
        focusZoneId={focusZoneId}
        viewNonce={viewNonce}
      />
    </>
  )
})
