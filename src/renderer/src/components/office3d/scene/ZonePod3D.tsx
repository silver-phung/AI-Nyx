import { memo, useMemo, useState, Suspense } from 'react'
import * as THREE from 'three'
import { Html, useGLTF } from '@react-three/drei'
import { FolderGit2, Bot, GitPullRequest, ArrowRight } from 'lucide-react'
import type { OfficeDesk, OfficeEmployee, OfficeZone } from '../model/office-world-types'
import { Desk3D } from './Desk3D'
import { OFFICE_MODELS } from './OfficeAssetRegistry'

interface ZonePod3DProps {
  readonly zone: OfficeZone
  readonly employees: readonly OfficeEmployee[]
  readonly selectedEmployeeId: string | null
  readonly selectedDeskId: string | null
  readonly onSelectEmployee: (employee: OfficeEmployee) => void
  readonly onSelectDesk?: (desk: OfficeDesk, zone: OfficeZone) => void
  readonly onFocusEmployee?: (employee: OfficeEmployee) => void
  readonly onSelectZone?: (zone: OfficeZone) => void
  readonly shadows?: boolean
}

export function getZoneCenterCoordinates(floorIndex: number): { x: number; z: number } {
  const col = floorIndex % 2
  const row = Math.floor(floorIndex / 2)
  return {
    x: col * 10.5 + 5.5,
    z: row * 9.5 + 5.5
  }
}

// Preload plant
useGLTF.preload(OFFICE_MODELS.pottedPlant)

const PodPlant = memo(function PodPlant({ shadows = true }: { shadows?: boolean }) {
  const plantGltf = useGLTF(OFFICE_MODELS.pottedPlant)
  const plantMesh = useMemo(() => {
    const cloned = plantGltf.scene.clone(true)
    cloned.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = shadows
        child.receiveShadow = shadows
      }
    })
    return cloned
  }, [plantGltf.scene, shadows])

  return (
    <group position={[2.1, 0, -1.6]}>
      <primitive object={plantMesh} scale={1.8} />
    </group>
  )
})

export const ZonePod3D = memo(function ZonePod3D({
  zone,
  employees,
  selectedEmployeeId,
  selectedDeskId,
  onSelectEmployee,
  onSelectDesk,
  onFocusEmployee,
  onSelectZone,
  shadows = true
}: ZonePod3DProps) {
  const { x, z } = getZoneCenterCoordinates(zone.floorIndex)
  const [signHovered, setSignHovered] = useState(false)

  // Map employee by slot index
  const employeeBySlot = useMemo(() => {
    const map = new Map<number, OfficeEmployee>()
    for (const emp of employees) {
      map.set(emp.slotIndex, emp)
    }
    return map
  }, [employees])

  // Calculate pod footprint bounds
  const bankCount = Math.ceil(zone.capacity / 4)
  const podLength = bankCount * 3.8

  return (
    <group position={[x, 0, z]}>
      {/* Pod Overhead Soft Illumination */}
      <pointLight
        position={[0, 3.4, (bankCount - 1) * 0.9]}
        color="#ffffff"
        intensity={1.2}
        distance={12}
        decay={2}
      />

      {/* Pod Carpet Inset Floor Mat (Deep Slate Navy) */}
      <mesh
        position={[0, 0.006, (bankCount - 1) * 0.9]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow={shadows}
      >
        <planeGeometry args={[4.8, Math.max(4.2, podLength + 0.8)]} />
        <meshStandardMaterial color="#171e2e" roughness={0.88} side={THREE.DoubleSide} />
      </mesh>

      {/* Carpet Border Accent */}
      <mesh
        position={[0, 0.007, (bankCount - 1) * 0.9]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[2.36, 2.4, 4]} />
        <meshBasicMaterial color="#334155" transparent opacity={0.6} side={THREE.DoubleSide} />
      </mesh>

      {/* Potted Plant Decor at Corner of the Pod (Suspended independently) */}
      <Suspense fallback={null}>
        <PodPlant shadows={shadows} />
      </Suspense>

      {/* Floating 3D Workspace Sign Banner (Interactive on click) */}
      <group position={[0, 2.8, (bankCount - 1) * 0.9]}>
        <Html
          center
          distanceFactor={14}
          style={{ pointerEvents: 'auto' }}
          className="select-none"
        >
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full border shadow-xl backdrop-blur-md cursor-pointer transition-all duration-200 ${
              signHovered
                ? 'bg-slate-900 border-primary text-white scale-105 shadow-primary/20'
                : 'bg-slate-950/90 border-slate-700/80 text-slate-200'
            }`}
            onClick={(e) => {
              e.stopPropagation()
              onSelectZone?.(zone)
            }}
            onMouseEnter={() => setSignHovered(true)}
            onMouseLeave={() => setSignHovered(false)}
            title="Click to switch to this workspace in Classic view"
          >
            <FolderGit2 className="size-4 text-primary shrink-0" />
            <span className="font-semibold text-xs tracking-tight">{zone.displayName}</span>
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/20 text-primary text-[10px] font-medium">
              <Bot className="size-3" />
              <span>{zone.activeEmployeeCount}</span>
            </div>
            {zone.review && (
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[10px]">
                <GitPullRequest className="size-3" />
                <span>#{zone.review.number}</span>
              </div>
            )}
            <span className="text-[10px] text-slate-400 border-l border-slate-700 pl-1.5">
              {zone.hostLabel}
            </span>
            <ArrowRight className="size-3 text-slate-400" />
          </div>
        </Html>
      </group>

      {/* Desks in the Pod */}
      {zone.desks.map((desk) => {
        const emp = employeeBySlot.get(desk.slotIndex)
        return (
          <Desk3D
            key={desk.deskId}
            desk={desk}
            zone={zone}
            employee={emp}
            isSelected={emp !== undefined && emp.employeeId === selectedEmployeeId}
            isDeskSelected={desk.deskId === selectedDeskId}
            onSelectEmployee={onSelectEmployee}
            onSelectDesk={onSelectDesk}
            onFocusEmployee={onFocusEmployee}
            shadows={shadows}
          />
        )
      })}
    </group>
  )
})
