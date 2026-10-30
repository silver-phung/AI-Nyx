import { memo, useMemo, useState, Suspense } from 'react'
import * as THREE from 'three'
import { Html, useGLTF } from '@react-three/drei'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { OfficeDesk, OfficeEmployee, OfficeZone } from '../model/office-world-types'
import { STATUS_COLORS } from './OfficeTheme'
import { OFFICE_MODELS } from './OfficeAssetRegistry'
import { AgentAvatar3D } from './AgentAvatar3D'

interface Desk3DProps {
  readonly desk: OfficeDesk
  readonly zone: OfficeZone
  readonly employee?: OfficeEmployee
  readonly isSelected: boolean
  readonly isDeskSelected?: boolean
  readonly onSelectEmployee: (employee: OfficeEmployee) => void
  readonly onSelectDesk?: (desk: OfficeDesk, zone: OfficeZone) => void
  readonly onFocusEmployee?: (employee: OfficeEmployee) => void
  readonly shadows?: boolean
}

// Preload furniture models
useGLTF.preload(OFFICE_MODELS.desk)
useGLTF.preload(OFFICE_MODELS.chairDesk)
useGLTF.preload(OFFICE_MODELS.computerScreen)

const DeskModels = memo(function DeskModels({ shadows = true }: { shadows?: boolean }) {
  const deskGltf = useGLTF(OFFICE_MODELS.desk)
  const chairGltf = useGLTF(OFFICE_MODELS.chairDesk)
  const screenGltf = useGLTF(OFFICE_MODELS.computerScreen)

  const deskMesh = useMemo(() => {
    const cloned = deskGltf.scene.clone(true)
    cloned.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = shadows
        child.receiveShadow = shadows
      }
    })
    return cloned
  }, [deskGltf.scene, shadows])

  const chairMesh = useMemo(() => {
    const cloned = chairGltf.scene.clone(true)
    cloned.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = shadows
        child.receiveShadow = shadows
      }
    })
    return cloned
  }, [chairGltf.scene, shadows])

  const screenMesh = useMemo(() => {
    const cloned = screenGltf.scene.clone(true)
    cloned.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = shadows
      }
    })
    return cloned
  }, [screenGltf.scene, shadows])

  return (
    <>
      <group position={[0, 0, -0.15]}>
        <primitive object={deskMesh} scale={2.0} />
      </group>
      <group position={[0, 0.76, -0.22]}>
        <primitive object={screenMesh} scale={2.0} />
      </group>
      <group position={[0, 0, 0.55]} rotation={[0, Math.PI, 0]}>
        <primitive object={chairMesh} scale={2.0} />
      </group>
    </>
  )
})

const DeskPlaceholder = () => (
  <>
    <mesh position={[0, 0.72, -0.15]}>
      <boxGeometry args={[1.4, 0.04, 0.78]} />
      <meshStandardMaterial color="#8b5a2b" roughness={0.5} />
    </mesh>
    <mesh position={[-0.6, 0.35, -0.15]}>
      <boxGeometry args={[0.04, 0.7, 0.7]} />
      <meshStandardMaterial color="#1e293b" roughness={0.3} metalness={0.6} />
    </mesh>
    <mesh position={[0.6, 0.35, -0.15]}>
      <boxGeometry args={[0.04, 0.7, 0.7]} />
      <meshStandardMaterial color="#1e293b" roughness={0.3} metalness={0.6} />
    </mesh>
    <mesh position={[0, 0.42, 0.55]}>
      <boxGeometry args={[0.48, 0.08, 0.46]} />
      <meshStandardMaterial color="#1e293b" roughness={0.7} />
    </mesh>
  </>
)

export const Desk3D = memo(function Desk3D({
  desk,
  zone,
  employee,
  isSelected,
  isDeskSelected = false,
  onSelectEmployee,
  onSelectDesk,
  onFocusEmployee,
  shadows = true
}: Desk3DProps) {
  const [hovered, setHovered] = useState(false)

  const statusColor = employee
    ? STATUS_COLORS[employee.displayState]?.primary ?? '#60a5fa'
    : '#1e293b'
  const screenGlow = employee
    ? STATUS_COLORS[employee.displayState]?.glow ?? '#3b82f6'
    : '#040711'

  // Orientation: Left desks face +X (+PI/2), Right desks face -X (-PI/2)
  const facingY = desk.gridX < 0 ? Math.PI / 2 : -Math.PI / 2

  return (
    <group position={[desk.gridX * 1.8, 0, desk.gridY * 1.8]} rotation={[0, facingY, 0]}>
      {/* Clickable bounding volume for empty desk interaction */}
      {!employee && (
        <mesh
          position={[0, 0.6, 0.2]}
          visible={false}
          onClick={(e) => {
            e.stopPropagation()
            onSelectDesk?.(desk, zone)
          }}
          onPointerOver={(e) => {
            e.stopPropagation()
            setHovered(true)
            document.body.style.cursor = 'pointer'
          }}
          onPointerOut={() => {
            setHovered(false)
            document.body.style.cursor = 'auto'
          }}
        >
          <boxGeometry args={[1.5, 1.2, 1.6]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>
      )}

      {/* Desk Highlight Ring (when empty and hovered/selected) */}
      {!employee && (hovered || isDeskSelected) && (
        <mesh position={[0, 0.02, 0.2]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[1.6, 1.7]} />
          <meshBasicMaterial
            color="#38bdf8"
            transparent
            opacity={isDeskSelected ? 0.35 : 0.15}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Kenney Desk, Chair, and Monitor Models (with fallback) */}
      <Suspense fallback={<DeskPlaceholder />}>
        <DeskModels shadows={shadows} />
      </Suspense>

      {/* Glowing Screen Displaying Agent Status */}
      <mesh position={[0, 1.05, -0.19]}>
        <planeGeometry args={[0.56, 0.33]} />
        <meshStandardMaterial
          color={employee ? statusColor : '#090d16'}
          emissive={employee ? screenGlow : '#040711'}
          emissiveIntensity={employee ? 2.2 : 0.2}
          roughness={0.1}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Seated Agent (if occupied) */}
      {employee && (
        <group position={[0, 0, 0.55]}>
          <Suspense fallback={null}>
            <AgentAvatar3D
              employee={employee}
              isSelected={isSelected}
              onSelect={onSelectEmployee}
              onFocusAgent={onFocusEmployee}
              shadows={shadows}
            />
          </Suspense>
        </group>
      )}

      {/* Empty Desk 3D Action Card */}
      {!employee && isDeskSelected && (
        <group position={[0, 1.5, 0.2]}>
          <Html center distanceFactor={13} style={{ pointerEvents: 'auto' }}>
            <div
              className="w-64 rounded-xl bg-slate-950/95 backdrop-blur-md border border-slate-700/80 shadow-2xl p-3 text-xs text-slate-100 space-y-2 select-none animate-in fade-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                <span className="font-semibold text-slate-200">
                  Vacant Desk · Slot {desk.slotIndex + 1}
                </span>
                <span className="text-[10px] text-emerald-400 font-mono">Available</span>
              </div>
              <div className="text-[11px] text-slate-400">
                Workspace: <span className="text-slate-200 font-medium">{zone.displayName}</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="w-full h-7 text-xs border-primary/50 text-primary hover:bg-primary/10 flex items-center justify-center gap-1.5"
                onClick={(e) => {
                  e.stopPropagation()
                  onSelectDesk?.(desk, zone)
                }}
              >
                <ArrowRight className="size-3" />
                <span>Open in Classic View</span>
              </Button>
            </div>
          </Html>
        </group>
      )}
    </group>
  )
})
