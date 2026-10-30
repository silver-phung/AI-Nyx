import { useCallback, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import type { OfficeDesk, OfficeEmployee, OfficeWorld, OfficeZone } from '../model/office-world-types'
import { getDeskGridCoordinates } from '../model/office-desk-allocator'
import { getZoneCenterCoordinates } from './ZonePod3D'
import { getZoneDef, type CampusZoneId } from './campus/campus-layout'
import { presetPose, zonePose, type CampusViewPreset } from './campus/campus-view'

interface OfficeCameraRigProps {
  readonly world: OfficeWorld
  readonly selectedEmployee: OfficeEmployee | null
  readonly selectedDesk?: { desk: OfficeDesk; zone: OfficeZone } | null
  readonly selectedZone?: OfficeZone | null
  readonly width: number
  readonly depth: number
  readonly viewPreset: CampusViewPreset
  readonly focusZoneId: CampusZoneId | null
  /** Increment to re-run the preset / zone fly-to even if the values did not change. */
  readonly viewNonce: number
}

interface Fly {
  readonly toTarget: THREE.Vector3
  readonly toPosition: THREE.Vector3
  elapsed: number
}

const FLY_SECONDS = 2.2

/**
 * Orbit camera for the campus. Flights run once per request (preset, zone or selection change) and
 * stop as soon as the user touches the controls, so orbit/pan/zoom are never fought.
 */
export function OfficeCameraRig({
  world,
  selectedEmployee,
  selectedDesk,
  selectedZone,
  viewPreset,
  focusZoneId,
  viewNonce
}: OfficeCameraRigProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null)
  const { camera } = useThree()
  const flyRef = useRef<Fly | null>(null)
  const initialised = useRef(false)

  const startFly = useCallback((target: THREE.Vector3, position: THREE.Vector3): void => {
    flyRef.current = { toTarget: target.clone(), toPosition: position.clone(), elapsed: 0 }
  }, [])

  // Initial pose (no animation) and preset changes.
  useEffect(() => {
    const pose = presetPose(viewPreset)
    const target = new THREE.Vector3(pose.target.x, pose.target.y, pose.target.z)
    const position = new THREE.Vector3(pose.position.x, pose.position.y, pose.position.z)
    if (!initialised.current) {
      initialised.current = true
      camera.position.copy(position)
      controlsRef.current?.target.copy(target)
      controlsRef.current?.update()
    } else {
      startFly(target, position)
    }
  }, [viewPreset, viewNonce, camera, startFly])

  // Zone chips.
  useEffect(() => {
    if (!focusZoneId) return
    const yaw = (Math.atan2(camera.position.x - (controlsRef.current?.target.x ?? 0), camera.position.z - (controlsRef.current?.target.z ?? 0)) * 180) / Math.PI
    const pose = zonePose(getZoneDef(focusZoneId), Number.isFinite(yaw) ? yaw : 38)
    startFly(
      new THREE.Vector3(pose.target.x, pose.target.y, pose.target.z),
      new THREE.Vector3(pose.position.x, pose.position.y, pose.position.z)
    )
  }, [focusZoneId, viewNonce, camera, startFly])

  // Selection: fly once to the selected desk / agent / pod, keeping the current view direction.
  const selectionPoint = useMemo(() => {
    const pod = (zone: OfficeZone, slot?: number): THREE.Vector3 => {
      const { x, z } = getZoneCenterCoordinates(zone.floorIndex)
      if (slot === undefined) return new THREE.Vector3(x, 1.0, z)
      const { gridX, gridY } = getDeskGridCoordinates(slot)
      return new THREE.Vector3(x + gridX * 1.8, 1.0, z + gridY * 1.8)
    }
    if (selectedEmployee) {
      const zone = world.lookup.zoneById.get(selectedEmployee.zoneId)
      return zone ? { key: `e:${selectedEmployee.employeeId}`, point: pod(zone, selectedEmployee.slotIndex) } : null
    }
    if (selectedDesk) return { key: `d:${selectedDesk.desk.deskId}`, point: pod(selectedDesk.zone, selectedDesk.desk.slotIndex) }
    if (selectedZone) return { key: `z:${selectedZone.zoneId}`, point: pod(selectedZone) }
    return null
  }, [world, selectedEmployee, selectedDesk, selectedZone])

  const selectionKey = selectionPoint?.key ?? null
  const selectionPointRef = useRef(selectionPoint)
  selectionPointRef.current = selectionPoint
  useEffect(() => {
    const point = selectionPointRef.current?.point
    if (!selectionKey || !point || !controlsRef.current) return
    const controls = controlsRef.current
    const offset = camera.position.clone().sub(controls.target)
    const dist = THREE.MathUtils.clamp(offset.length(), 7, 16)
    offset.setLength(dist)
    startFly(point, point.clone().add(offset))
  }, [selectionKey, camera, startFly])

  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return undefined
    const cancel = (): void => {
      flyRef.current = null
    }
    controls.addEventListener('start', cancel)
    return () => controls.removeEventListener('start', cancel)
  }, [])

  useFrame((_, delta) => {
    const controls = controlsRef.current
    const fly = flyRef.current
    if (!controls || !fly) return
    fly.elapsed += delta
    const k = 1 - Math.exp(-delta * 3.4)
    controls.target.lerp(fly.toTarget, k)
    camera.position.lerp(fly.toPosition, k)
    controls.update()
    if (fly.elapsed > FLY_SECONDS || (controls.target.distanceTo(fly.toTarget) < 0.05 && camera.position.distanceTo(fly.toPosition) < 0.1)) {
      flyRef.current = null
    }
  })


  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.07}
      maxPolarAngle={Math.PI * 0.47}
      minDistance={5}
      maxDistance={150}
      rotateSpeed={0.7}
      zoomSpeed={0.9}
      panSpeed={0.8}
      screenSpacePanning={false}
    />
  )
}
