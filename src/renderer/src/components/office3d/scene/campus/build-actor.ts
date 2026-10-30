import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { ResourceBag, radialGlowTexture } from './campus-kit'

export type ActorModelKind = 'human' | 'robot'
export type ActorClipRole =
  | 'idle'
  | 'walk'
  | 'sit'
  | 'work'
  | 'inspect'
  | 'success'
  | 'failure'
  | 'handoff'

/** The parts of a loaded GLTF an actor needs (what drei's useGLTF returns). */
export interface ActorSource {
  readonly scene: THREE.Object3D
  readonly animations: readonly THREE.AnimationClip[]
}

const CLIP_CANDIDATES: Record<ActorModelKind, Record<ActorClipRole, readonly string[]>> = {
  human: {
    idle: ['idle'],
    walk: ['walk'],
    sit: ['sit'],
    work: ['interact-right', 'idle'],
    inspect: ['interact-left', 'idle'],
    success: ['emote-yes', 'idle'],
    failure: ['emote-no', 'idle'],
    handoff: ['pick-up', 'interact-right', 'idle']
  },
  robot: {
    idle: ['Idle', 'Standing'],
    walk: ['Walking'],
    sit: ['Sitting', 'Idle'],
    work: ['Standing', 'Idle'],
    inspect: ['Idle'],
    success: ['ThumbsUp', 'Yes', 'Idle'],
    failure: ['No', 'Idle'],
    handoff: ['Yes', 'Standing', 'Idle']
  }
}

export interface Actor {
  /** Place this in the scene. Position = feet, rotation.y = facing. */
  readonly root: THREE.Group
  readonly kind: ActorModelKind
  setClip(role: ActorClipRole, fadeSeconds?: number): void
  setCarrying(on: boolean): void
  /** Package glow pulse + handoff shrink factor 0..1 (1 = full size). */
  setPackageScale(s: number): void
  setStatusColor(color: number): void
  update(deltaSeconds: number, timeSeconds: number): void
  dispose(): void
}

export interface ActorOptions {
  readonly source: ActorSource
  readonly kind: ActorModelKind
  /** Tint for robot "Main" materials (agent colour). */
  readonly tint?: number
  readonly statusColor?: number
  readonly shadows?: boolean
}

function findClip(
  clips: readonly THREE.AnimationClip[],
  names: readonly string[]
): THREE.AnimationClip | undefined {
  for (const n of names) {
    const hit = clips.find((c) => c.name.toLowerCase() === n.toLowerCase())
    if (hit) return hit
  }
  return clips[0]
}

export function createActor(options: ActorOptions): Actor {
  const { source, kind } = options
  const bag = new ResourceBag()
  const root = new THREE.Group()
  root.name = `campus-actor-${kind}`

  const model = cloneSkinned(source.scene) as THREE.Object3D
  const box = new THREE.Box3().setFromObject(source.scene)
  const height = box.max.y - box.min.y || 1
  const scale = (kind === 'robot' ? 1.25 : 1.7) / height
  model.scale.setScalar(scale)

  const ownedMaterials: THREE.Material[] = []
  model.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = options.shadows ?? true
    mesh.receiveShadow = options.shadows ?? true
    mesh.frustumCulled = false
    if (kind === 'robot' && options.tint !== undefined && mesh.material) {
      const mat = (mesh.material as THREE.MeshStandardMaterial).clone()
      if (mat.name === 'Main' || mat.name.toLowerCase().includes('primary')) {
        mat.color = new THREE.Color(options.tint)
      }
      mesh.material = mat
      ownedMaterials.push(mat)
    }
  })
  root.add(model)

  const mixer = new THREE.AnimationMixer(model)
  const actions = new Map<ActorClipRole, THREE.AnimationAction>()
  let current: THREE.AnimationAction | null = null
  let currentRole: ActorClipRole | null = null

  function setClip(role: ActorClipRole, fade = 0.25): void {
    if (currentRole === role) return
    const clip = findClip(source.animations, CLIP_CANDIDATES[kind][role])
    if (!clip) return
    let action = actions.get(role)
    if (!action) {
      action = mixer.clipAction(clip)
      actions.set(role, action)
    }
    action.reset().setEffectiveWeight(1).fadeIn(fade).play()
    current?.fadeOut(fade)
    current = action
    currentRole = role
  }

  // glowing code package carried in front of the chest
  const pkg = new THREE.Group()
  pkg.position.set(0, 1.0, 0.42)
  pkg.visible = false
  const cube = new THREE.Mesh(
    bag.geo(new THREE.BoxGeometry(0.3, 0.3, 0.3)),
    bag.mat(
      new THREE.MeshStandardMaterial({
        color: 0x1b2a6b,
        emissive: 0x7aa2ff,
        emissiveIntensity: 2.4,
        roughness: 0.3
      })
    )
  )
  const wire = new THREE.LineSegments(
    bag.geo(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.36, 0.36, 0.36))),
    bag.mat(new THREE.LineBasicMaterial({ color: 0xe0ecff }))
  )
  const halo = new THREE.Sprite(
    bag.mat(
      new THREE.SpriteMaterial({
        map: radialGlowTexture(bag),
        color: 0x8fb0ff,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    )
  )
  halo.scale.setScalar(1.3)
  pkg.add(cube, wire, halo)
  root.add(pkg)

  // status halo above the head
  const statusMat = bag.mat(
    new THREE.MeshStandardMaterial({
      color: options.statusColor ?? 0x60a5fa,
      emissive: options.statusColor ?? 0x3b82f6,
      emissiveIntensity: 1.8,
      roughness: 0.2
    })
  )
  const ring = new THREE.Mesh(bag.geo(new THREE.TorusGeometry(0.16, 0.03, 10, 24)), statusMat)
  ring.position.y = (kind === 'robot' ? 1.5 : 1.95)
  ring.rotation.x = Math.PI / 5
  root.add(ring)

  setClip('idle', 0)

  let carrying = false
  let packageScale = 1
  return {
    root,
    kind,
    setClip,
    setCarrying(on) {
      carrying = on
      pkg.visible = on && packageScale > 0.02
    },
    setPackageScale(s) {
      packageScale = s
      pkg.scale.setScalar(Math.max(s, 0.001))
      pkg.visible = carrying && s > 0.02
    },
    setStatusColor(color) {
      statusMat.color.setHex(color)
      statusMat.emissive.setHex(color)
    },
    update(dt, t) {
      mixer.update(dt)
      ring.rotation.y += dt * 1.6
      if (pkg.visible) {
        pkg.position.y = 1.0 + Math.sin(t * 6) * 0.025
        cube.rotation.y = t * 1.8
        cube.rotation.x = t * 1.1
        halo.material.opacity = 0.7 + Math.sin(t * 5) * 0.15
      }
    },
    dispose() {
      mixer.stopAllAction()
      mixer.uncacheRoot(model)
      for (const m of ownedMaterials) m.dispose()
      bag.dispose()
      root.clear()
    }
  }
}
