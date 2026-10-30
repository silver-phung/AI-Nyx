import { memo, useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import type { EmployeeId, OfficeWorld } from '../model/office-world-types'
import { getDeskGridCoordinates } from '../model/office-desk-allocator'
import { OFFICE_MODELS } from './OfficeAssetRegistry'
import { getAgentColorByType } from './OfficeTheme'
import { getZoneCenterCoordinates } from './ZonePod3D'
import { humanModelUrl, isRobotAgent, SEAT_LIFT_HUMAN, SEAT_LIFT_ROBOT } from './agent-appearance'
import type { Campus } from './campus/build-campus'
import { CampusDirector, type DirectorEmployeeInfo } from './campus/campus-director'
import { campusEventBus, campusPresence } from './campus/campus-events'
import {
  CAMPUS_ZONES,
  deskSeatPoint,
  deskStandPoint,
  podAisleZ,
  routeDeskToZone,
  routeZoneToZone
} from './campus/campus-layout'
import type { ActorSource } from './campus/build-actor'

interface CampusActorsProps {
  readonly world: OfficeWorld
  readonly campus: Campus
  readonly shadows: boolean
}

useGLTF.preload(OFFICE_MODELS.robot)
useGLTF.preload(OFFICE_MODELS.charMaleA)
useGLTF.preload(OFFICE_MODELS.charFemaleA)

/** Narrowing guard: real employee ids are always `<scope>::<id>`. */
function isEmployeeId(value: string): value is EmployeeId {
  const sep = value.indexOf('::')
  return sep > 0 && sep < value.length - 2
}

function previewIndex(employeeId: string): number {
  let h = 0
  for (let i = 0; i < employeeId.length; i++) h = (h * 31 + employeeId.charCodeAt(i)) >>> 0
  return h
}

/**
 * Renders agents walking between campus zones in response to campus activity events.
 * Visualisation only: it reads the world model and never calls back into Orca.
 */
export const CampusActors = memo(function CampusActors({ world, campus, shadows }: CampusActorsProps) {
  const robot = useGLTF(OFFICE_MODELS.robot) as unknown as ActorSource
  const male = useGLTF(OFFICE_MODELS.charMaleA) as unknown as ActorSource
  const female = useGLTF(OFFICE_MODELS.charFemaleA) as unknown as ActorSource
  const groupRef = useRef<THREE.Group>(null)
  const directorRef = useRef<CampusDirector | null>(null)
  const worldRef = useRef(world)
  worldRef.current = world

  useEffect(() => {
    const parent = groupRef.current
    if (!parent) return undefined
    const garden = CAMPUS_ZONES['waiting-garden']
    const director = new CampusDirector({
      campus,
      parent,
      shadows,
      getSource: (kind, employeeId) => {
        if (kind === 'robot') return robot
        return humanModelUrl(employeeId) === OFFICE_MODELS.charMaleA ? male : female
      },
      setAway: (employeeId, away) => campusPresence.setAway(employeeId, away),
      resolveEmployee: (event): DirectorEmployeeInfo | null => {
        if (event.source === 'dev-preview') {
          const idx = previewIndex(event.employeeId)
          const seat = { x: garden.spot.x + ((idx % 3) - 1) * 1.1, z: garden.spot.z + 1.4 }
          return {
            seat,
            seatYaw: Math.PI,
            seatLift: 0,
            modelKind: idx % 2 === 0 ? 'robot' : 'human',
            tint: parseInt(getAgentColorByType(idx % 3 === 0 ? 'claude' : 'codex').slice(1), 16),
            route: (target) => routeZoneToZone(garden, target)
          }
        }
        const w = worldRef.current
        // Unknown or malformed ids are ignored: no actor, no navigation, no side effects.
        if (!isEmployeeId(event.employeeId)) return null
        const employee = w.lookup.employeeById.get(event.employeeId)
        if (!employee) return null
        const zone = w.lookup.zoneById.get(employee.zoneId)
        if (!zone) return null
        const pod = getZoneCenterCoordinates(zone.floorIndex)
        const { gridX, gridY } = getDeskGridCoordinates(employee.slotIndex)
        const robotModel = isRobotAgent(employee.agentType)
        const stand = deskStandPoint(pod, gridX, gridY)
        const facingY = gridX < 0 ? Math.PI / 2 : -Math.PI / 2
        return {
          seat: deskSeatPoint(pod, gridX, gridY),
          seatYaw: facingY + Math.PI,
          seatLift: robotModel ? SEAT_LIFT_ROBOT : SEAT_LIFT_HUMAN,
          modelKind: robotModel ? 'robot' : 'human',
          tint: parseInt(getAgentColorByType(employee.agentType ?? 'codex').slice(1), 16),
          route: (target) => routeDeskToZone(stand, podAisleZ(pod, Math.ceil(zone.capacity / 4)), target)
        }
      }
    })
    directorRef.current = director
    const unsubscribe = campusEventBus.subscribe((e) => director.handle(e))
    return () => {
      unsubscribe()
      director.dispose()
      directorRef.current = null
    }
  }, [campus, shadows, robot, male, female])

  useFrame((state, delta) => {
    directorRef.current?.update(Math.min(delta, 0.1), state.clock.elapsedTime)
  })

  return <group ref={groupRef} name="campus-actors" />
})
