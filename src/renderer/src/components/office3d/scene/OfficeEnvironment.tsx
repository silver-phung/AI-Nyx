import { memo, useMemo, Suspense } from 'react'
import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import { OFFICE_MODELS } from './OfficeAssetRegistry'

interface OfficeEnvironmentProps {
  readonly width: number
  readonly depth: number
  readonly shadows?: boolean
}

// Preload environment decor models
useGLTF.preload(OFFICE_MODELS.loungeSofa)
useGLTF.preload(OFFICE_MODELS.tableCoffee)
useGLTF.preload(OFFICE_MODELS.rugRound)
useGLTF.preload(OFFICE_MODELS.plantSmall)
useGLTF.preload(OFFICE_MODELS.bookcase)
useGLTF.preload(OFFICE_MODELS.lampRoundFloor)

// Isolated decor layer that can suspend independently without hiding the room/floor
const OfficeDecor = memo(function OfficeDecor({ shadows = true }: { shadows?: boolean }) {
  const sofaGltf = useGLTF(OFFICE_MODELS.loungeSofa)
  const coffeeTableGltf = useGLTF(OFFICE_MODELS.tableCoffee)
  const rugGltf = useGLTF(OFFICE_MODELS.rugRound)
  const smallPlantGltf = useGLTF(OFFICE_MODELS.plantSmall)
  const bookcaseGltf = useGLTF(OFFICE_MODELS.bookcase)
  const lampGltf = useGLTF(OFFICE_MODELS.lampRoundFloor)

  const sofaMesh = useMemo(() => {
    const c = sofaGltf.scene.clone(true)
    c.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = shadows
    })
    return c
  }, [sofaGltf.scene, shadows])

  const tableMesh = useMemo(() => {
    const c = coffeeTableGltf.scene.clone(true)
    c.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = shadows
    })
    return c
  }, [coffeeTableGltf.scene, shadows])

  const bookcaseMesh = useMemo(() => {
    const c = bookcaseGltf.scene.clone(true)
    c.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = shadows
    })
    return c
  }, [bookcaseGltf.scene, shadows])

  const lampMesh = useMemo(() => {
    const c = lampGltf.scene.clone(true)
    c.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = shadows
    })
    return c
  }, [lampGltf.scene, shadows])

  return (
    <group>
      {/* Bookcase along the back wall */}
      <group position={[5.5, 0, 1.2]} rotation={[0, 0, 0]}>
        <primitive object={bookcaseMesh} scale={2.0} />
      </group>

      {/* Modern Lounge & Breakout Area right next to Pod 0 */}
      <group position={[11.8, 0, 5.5]} rotation={[0, -Math.PI / 4, 0]}>
        <primitive object={rugGltf.scene.clone(true)} scale={2.2} />
        <group position={[0, 0, -0.6]}>
          <primitive object={sofaMesh} scale={1.8} />
        </group>
        <group position={[0, 0, 0.7]}>
          <primitive object={tableMesh} scale={1.6} />
          <group position={[0, 0.45, 0]}>
            <primitive object={smallPlantGltf.scene.clone(true)} scale={1.2} />
          </group>
        </group>
      </group>

      {/* Decorative Floor Lamp with Warm Point Light */}
      <group position={[1.8, 0, 5.5]}>
        <primitive object={lampMesh} scale={1.8} />
        <pointLight color="#fde047" intensity={1.2} distance={6} decay={2} position={[0, 2.5, 0]} />
      </group>
    </group>
  )
})

export const OfficeEnvironment = memo(function OfficeEnvironment({
  width,
  depth,
  shadows = true
}: OfficeEnvironmentProps) {
  const cx = width / 2
  const cz = depth / 2
  const maxSpan = Math.max(width, depth, 32)

  // Pantheon-inspired procedural wood floor plank texture
  const floorTexture = useMemo(() => {
    if (typeof document === 'undefined') return null
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 512
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    // Base rich warm studio oak
    ctx.fillStyle = '#6b4423'
    ctx.fillRect(0, 0, 512, 512)

    // Wood planks
    const plankH = 48
    for (let y = 0; y < 512; y += plankH) {
      const offset = (y * 5) % 256
      for (let x = -offset; x < 512; x += 256) {
        ctx.strokeStyle = '#3e2410'
        ctx.lineWidth = 2
        ctx.strokeRect(x, y, 256, plankH)

        // Subtle plank tone variation
        const tone = (x * 7 + y * 13) % 25
        ctx.fillStyle = `rgba(255, 255, 255, ${0.03 + tone * 0.002})`
        ctx.fillRect(x + 1, y + 1, 254, plankH - 2)

        // Wood grain lines
        ctx.fillStyle = 'rgba(0, 0, 0, 0.12)'
        ctx.fillRect(x + 10, y + plankH * 0.35, 235, 1.2)
        ctx.fillRect(x + 25, y + plankH * 0.68, 210, 1.2)
      }
    }

    const tex = new THREE.CanvasTexture(canvas)
    tex.wrapS = THREE.RepeatWrapping
    tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(width / 3.5, depth / 3.5)
    tex.anisotropy = 8
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }, [width, depth])

  return (
    <group>
      {/* Background Atmosphere */}
      <color attach="background" args={['#0f172a']} />

      {/* Pantheon Hemisphere Light */}
      <hemisphereLight
        color="#ffffff"
        groundColor="#5c442c"
        intensity={1.4}
      />

      {/* Directional Sun Light with Soft PCF Shadows */}
      <directionalLight
        position={[cx - maxSpan * 0.4, maxSpan * 0.9, cz + maxSpan * 0.5]}
        intensity={2.4}
        color="#fff4e0"
        castShadow={shadows}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={1}
        shadow-camera-far={maxSpan * 3.5}
        shadow-camera-left={-maxSpan * 0.85}
        shadow-camera-right={maxSpan * 0.85}
        shadow-camera-top={maxSpan * 0.85}
        shadow-camera-bottom={-maxSpan * 0.85}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      >
        <object3D attach="target" position={[cx, 0, cz]} />
      </directionalLight>

      {/* Cool Sky Fill Light */}
      <directionalLight
        position={[cx + maxSpan * 0.5, maxSpan * 0.6, cz - maxSpan * 0.4]}
        intensity={0.6}
        color="#93c5fd"
      />

      {/* Main Office Wood Plank Floor (Always rendered immediately) */}
      <mesh
        position={[cx, -0.01, cz]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow={shadows}
      >
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial
          map={floorTexture ?? undefined}
          color={floorTexture ? '#ffffff' : '#6b4423'}
          roughness={0.65}
          metalness={0.1}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Perimeter Charcoal Baseboards */}
      <mesh position={[cx, 0.12, -0.05]}>
        <boxGeometry args={[width, 0.24, 0.1]} />
        <meshStandardMaterial color="#0f172a" roughness={0.4} />
      </mesh>
      <mesh position={[cx, 0.12, depth + 0.05]}>
        <boxGeometry args={[width, 0.24, 0.1]} />
        <meshStandardMaterial color="#0f172a" roughness={0.4} />
      </mesh>
      <mesh position={[-0.05, 0.12, cz]}>
        <boxGeometry args={[0.1, 0.24, depth]} />
        <meshStandardMaterial color="#0f172a" roughness={0.4} />
      </mesh>
      <mesh position={[width + 0.05, 0.12, cz]}>
        <boxGeometry args={[0.1, 0.24, depth]} />
        <meshStandardMaterial color="#0f172a" roughness={0.4} />
      </mesh>

      {/* Modern Back Wall with Large Window Panes */}
      <group position={[cx, 0, -0.1]}>
        <mesh position={[0, 4.5, 0]}>
          <boxGeometry args={[width, 9, 0.12]} />
          <meshStandardMaterial color="#1e293b" roughness={0.6} />
        </mesh>
        <mesh position={[0, 4.2, 0.08]}>
          <planeGeometry args={[width * 0.88, 6.2]} />
          <meshStandardMaterial
            color="#94a3b8"
            roughness={0.15}
            metalness={0.85}
            transparent
            opacity={0.35}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>

      {/* Office Decor (Loads asynchronously without blocking floor or lighting) */}
      <Suspense fallback={null}>
        <OfficeDecor shadows={shadows} />
      </Suspense>
    </group>
  )
})
