import { memo, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Html, useGLTF } from '@react-three/drei'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { OfficeEmployee } from '../model/office-world-types'
import { STATUS_COLORS, getAgentColorByType } from './OfficeTheme'
import { OFFICE_MODELS } from './OfficeAssetRegistry'
import { humanModelUrl, isRobotAgent, SEAT_LIFT_HUMAN, SEAT_LIFT_ROBOT } from './agent-appearance'
import { campusPresence } from './campus/campus-events'

interface AgentAvatar3DProps {
  readonly employee: OfficeEmployee
  readonly isSelected: boolean
  readonly onSelect: (employee: OfficeEmployee) => void
  readonly onFocusAgent?: (employee: OfficeEmployee) => void
  readonly shadows?: boolean
}

// Preload models for seamless instant rendering
useGLTF.preload(OFFICE_MODELS.charMaleA)
useGLTF.preload(OFFICE_MODELS.charFemaleA)
useGLTF.preload(OFFICE_MODELS.robot)

export const AgentAvatar3D = memo(function AgentAvatar3D({
  employee,
  isSelected,
  onSelect,
  onFocusAgent,
  shadows = true
}: AgentAvatar3DProps) {
  const [hovered, setHovered] = useState(false)
  const groupRef = useRef<THREE.Group>(null)
  const haloRef = useRef<THREE.Mesh>(null)

  // Determine avatar model: robots for AI engines, stylized human characters for others
  const isRobot = useMemo(() => isRobotAgent(employee.agentType), [employee.agentType])

  // While this agent is walking around the campus, its seated avatar hides (visual only).
  const isAway = useSyncExternalStore(
    campusPresence.subscribe,
    () => campusPresence.isAway(employee.employeeId),
    () => false
  )

  const modelUrl = useMemo(() => {
    if (isRobot) return OFFICE_MODELS.robot
    return humanModelUrl(employee.employeeId)
  }, [isRobot, employee.employeeId])

  const gltf = useGLTF(modelUrl)

  const statusConfig = STATUS_COLORS[employee.displayState] ?? STATUS_COLORS.idle
  const outfitColor = getAgentColorByType(employee.agentType ?? 'codex')

  // Clone skinned skeleton cleanly per employee
  const { scene, scale, sitLift } = useMemo(() => {
    const s = cloneSkinned(gltf.scene) as THREE.Group
    const box = new THREE.Box3().setFromObject(gltf.scene)
    const h = box.max.y - box.min.y || 1

    let sc = 1.0
    let lift = 0.0

    if (isRobot) {
      sc = 1.25 / h
      lift = SEAT_LIFT_ROBOT
    } else {
      sc = 1.7 / h
      lift = SEAT_LIFT_HUMAN
    }

    s.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = shadows
      mesh.receiveShadow = shadows
      mesh.frustumCulled = false

      if (isRobot && mesh.material) {
        const mat = (mesh.material as THREE.MeshStandardMaterial).clone()
        if (mat.name === 'Main' || mat.name.toLowerCase().includes('primary')) {
          mat.color = new THREE.Color(outfitColor)
        }
        mesh.material = mat
      }
    })

    return { scene: s, scale: sc, sitLift: lift }
  }, [gltf.scene, isRobot, outfitColor, shadows])

  // Setup AnimationMixer
  const mixer = useMemo(() => new THREE.AnimationMixer(scene), [scene])

  useEffect(() => {
    if (!gltf.animations || gltf.animations.length === 0) return

    // Find the best sitting animation
    const clipNames = gltf.animations.map((a) => a.name)
    const sitClipName = isRobot
      ? clipNames.find((n) => n.toLowerCase().includes('sitting') || n.toLowerCase().includes('sit')) ?? 'Idle'
      : clipNames.find((n) => n.toLowerCase() === 'sit' || n.toLowerCase().includes('sit')) ?? 'idle'

    const targetClip = gltf.animations.find((a) => a.name === sitClipName) || gltf.animations[0]
    if (targetClip) {
      const action = mixer.clipAction(targetClip)
      action.reset().fadeIn(0.2).play()
      return () => {
        action.fadeOut(0.2)
      }
    }
    return undefined
  }, [gltf.animations, mixer, isRobot])

  // Update mixer every frame
  useFrame((_, delta) => {
    mixer.update(delta)

    if (haloRef.current) {
      haloRef.current.rotation.y += delta * 1.5
      const pulse = employee.displayState === 'working' ? Math.sin(Date.now() * 0.006) * 0.12 : 0
      const scaleBase = isSelected || hovered ? 1.3 : 1.0
      haloRef.current.scale.setScalar(scaleBase + pulse)
    }
  })

  // Cursor handling
  useEffect(() => {
    if (hovered) {
      document.body.style.cursor = 'pointer'
      return () => {
        document.body.style.cursor = 'auto'
      }
    }
    return undefined
  }, [hovered])

  // Clear hover when hidden so the pointer cursor cannot get stuck.
  useEffect(() => {
    if (isAway) setHovered(false)
  }, [isAway])

  if (isAway) return null

  return (
    <group
      ref={groupRef}
      position={[0, sitLift, 0]}
      rotation={[0, Math.PI, 0]}
      onClick={(e) => {
        e.stopPropagation()
        onSelect(employee)
      }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        onFocusAgent?.(employee)
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHovered(true)
      }}
      onPointerOut={() => {
        setHovered(false)
      }}
    >
      {/* 3D Model Instance */}
      <primitive object={scene} scale={scale} />

      {/* Floor Focus Highlight Ring */}
      {(isSelected || hovered) && (
        <mesh position={[0, -sitLift + 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.5, 0.62, 32]} />
          <meshBasicMaterial
            color={statusConfig.primary}
            side={THREE.DoubleSide}
            transparent
            opacity={isSelected ? 0.95 : 0.6}
          />
        </mesh>
      )}

      {/* Floating Status Halo Beacon above Head */}
      <mesh ref={haloRef} position={[0, 1.45, 0]} rotation={[Math.PI / 5, 0, 0]}>
        <torusGeometry args={[0.16, 0.03, 12, 24]} />
        <meshStandardMaterial
          color={statusConfig.primary}
          emissive={statusConfig.glow}
          emissiveIntensity={isSelected || hovered ? 2.8 : 1.6}
          roughness={0.2}
        />
      </mesh>

      {/* Hover Preview Tag */}
      {hovered && !isSelected && (
        <group position={[0, 1.7, 0]}>
          <Html center distanceFactor={12} className="pointer-events-none select-none">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900/95 border border-slate-700/80 text-[11px] text-slate-100 shadow-xl backdrop-blur-md whitespace-nowrap animate-in fade-in zoom-in-95 duration-100">
              <span
                className="size-2 rounded-full shrink-0"
                style={{ backgroundColor: statusConfig.primary }}
              />
              <span className="font-semibold max-w-[160px] truncate">
                {employee.task || 'Agent Session'}
              </span>
              <span className="text-slate-400 text-[10px]">({statusConfig.label})</span>
            </div>
          </Html>
        </group>
      )}

      {/* Direct In-World 3D Floating Action Card (Active when selected) */}
      {isSelected && (
        <group position={[0, 1.85, 0]}>
          <Html
            center
            distanceFactor={13}
            style={{ pointerEvents: 'auto' }}
            className="select-none"
          >
            <div
              className="w-72 rounded-xl bg-slate-950/95 backdrop-blur-md border border-slate-700/80 shadow-2xl p-3.5 text-xs text-slate-100 space-y-2.5 animate-in fade-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="size-2.5 rounded-full shrink-0 animate-pulse"
                    style={{ backgroundColor: statusConfig.primary }}
                  />
                  <div className="font-semibold text-xs text-white truncate">
                    {employee.task || 'Agent Session'}
                  </div>
                </div>
                <Badge
                  variant={
                    employee.displayState === 'attention'
                      ? 'destructive'
                      : employee.displayState === 'working'
                        ? 'default'
                        : 'secondary'
                  }
                  className="text-[10px] px-1.5 py-0"
                >
                  {statusConfig.label}
                </Badge>
              </div>

              {/* Body Info */}
              <div className="space-y-1 text-[11px] text-slate-300">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Agent Engine:</span>
                  <span className="font-medium capitalize text-slate-200">
                    {employee.agentType}
                  </span>
                </div>
                {employee.askSummary && (
                  <div className="p-2 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] leading-tight">
                    {employee.askSummary}
                  </div>
                )}
                {employee.lastAgentMessage && !employee.askSummary && (
                  <div className="p-1.5 rounded bg-slate-900 border border-slate-800 text-slate-300 text-[10px] truncate">
                    &ldquo;{employee.lastAgentMessage}&rdquo;
                  </div>
                )}
              </div>

              {/* Direct Action Button */}
              <Button
                size="sm"
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold flex items-center justify-center gap-1.5 shadow-md h-8 text-xs"
                disabled={!employee.isRoutable}
                onClick={(e) => {
                  e.stopPropagation()
                  onFocusAgent?.(employee)
                }}
              >
                <ExternalLink className="size-3.5" />
                <span>Focus &amp; Open Session</span>
                <span className="ml-auto text-[9px] bg-primary-foreground/20 px-1 py-0.5 rounded font-mono">
                  ↵
                </span>
              </Button>
            </div>
          </Html>
        </group>
      )}
    </group>
  )
})
