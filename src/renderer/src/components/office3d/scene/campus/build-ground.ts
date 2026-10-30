import * as THREE from 'three'
import {
  ALL_ZONE_DEFS,
  CAMPUS_HUB,
  CAMPUS_ZONES,
  HUB_RADIUS,
  STUDIO_GATE,
  STUDIO_X0,
  STUDIO_X1,
  studioDepth,
  type CampusPoint
} from './campus-layout'
import {
  ResourceBag,
  drawCanvas,
  emissiveMat,
  mulberry32,
  radialGlowTexture,
  stdMat
} from './campus-kit'

export interface CampusGround {
  readonly group: THREE.Group
  update(timeSeconds: number): void
}

function distToSegment(p: CampusPoint, a: CampusPoint, b: CampusPoint): number {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const l2 = dx * dx + dz * dz || 1
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2))
  return Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t))
}

function lawnTexture(bag: ResourceBag): THREE.CanvasTexture {
  const rnd = mulberry32(5)
  const c = drawCanvas(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#1b4553'
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < 2600; i++) {
      const x = rnd() * w
      const y = rnd() * h
      const g = 60 + Math.floor(rnd() * 50)
      ctx.fillStyle = `rgba(${30 + Math.floor(rnd() * 30)},${g + 70},${g + 60},${0.05 + rnd() * 0.09})`
      ctx.fillRect(x, y, 2 + rnd() * 2, 2 + rnd() * 4)
    }
  })
  const t = bag.tex(new THREE.CanvasTexture(c))
  t.wrapS = THREE.RepeatWrapping
  t.wrapT = THREE.RepeatWrapping
  t.repeat.set(26, 26)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

function stoneTexture(bag: ResourceBag, base: string, line: string): THREE.CanvasTexture {
  const c = drawCanvas(256, 256, (ctx, w, h) => {
    ctx.fillStyle = base
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = line
    ctx.lineWidth = 3
    for (let y = 0; y <= h; y += 64) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
      ctx.stroke()
      const off = (y / 64) % 2 === 0 ? 0 : 64
      for (let x = off; x <= w; x += 128) {
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x, y + 64)
        ctx.stroke()
      }
    }
  })
  const t = bag.tex(new THREE.CanvasTexture(c))
  t.wrapS = THREE.RepeatWrapping
  t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

export function buildGround(bag: ResourceBag, podRows: number): CampusGround {
  const group = new THREE.Group()
  group.name = 'campus-ground'
  const depth = studioDepth(podRows)

  // ---- Lawn + distant hills --------------------------------------------------------
  const lawn = new THREE.Mesh(
    bag.geo(new THREE.CircleGeometry(190, 72)),
    bag.mat(new THREE.MeshStandardMaterial({ map: lawnTexture(bag), color: 0xffffff, roughness: 1 }))
  )
  lawn.rotation.x = -Math.PI / 2
  lawn.position.set(35, -0.03, 14)
  lawn.receiveShadow = true
  group.add(lawn)

  const hillMat = stdMat(bag, 0x14123a, 1)
  const hillRnd = mulberry32(31)
  const hillGeo = bag.geo(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2))
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + hillRnd() * 0.2
    const r = 185 + hillRnd() * 30
    const hill = new THREE.Mesh(hillGeo, hillMat)
    const s = 30 + hillRnd() * 40
    hill.scale.set(s * 1.8, 3 + hillRnd() * 8, s)
    hill.position.set(35 + Math.cos(a) * r, -0.5, 14 + Math.sin(a) * r)
    hill.rotation.y = hillRnd() * Math.PI
    group.add(hill)
  }

  // ---- Studio plinth -----------------------------------------------------------------
  const stoneDark = stoneTexture(bag, '#262a4a', '#343a66')
  stoneDark.repeat.set(12, Math.max(6, depth / 2.5))
  const plinth = new THREE.Mesh(
    bag.geo(new THREE.BoxGeometry(STUDIO_X1 - STUDIO_X0, 0.3, depth)),
    bag.mat(new THREE.MeshStandardMaterial({ map: stoneDark, roughness: 0.8, metalness: 0.1 }))
  )
  plinth.position.set((STUDIO_X0 + STUDIO_X1) / 2, -0.12, depth / 2 - 2)
  plinth.receiveShadow = true
  group.add(plinth)

  // glowing edge trim around the plinth
  const trimMat = emissiveMat(bag, 0x4f8cff, 1.8)
  const trim = (w: number, d: number, x: number, z: number): void => {
    const m = new THREE.Mesh(bag.geo(new THREE.BoxGeometry(w, 0.06, d)), trimMat)
    m.position.set(x, 0.05, z)
    group.add(m)
  }
  const cx = (STUDIO_X0 + STUDIO_X1) / 2
  const cz = depth / 2 - 2
  trim(STUDIO_X1 - STUDIO_X0, 0.12, cx, cz - depth / 2 + 0.06)
  trim(STUDIO_X1 - STUDIO_X0, 0.12, cx, cz + depth / 2 - 0.06)
  trim(0.12, depth, STUDIO_X0 + 0.06, cz)
  trim(0.12, depth, STUDIO_X1 - 0.06, cz)

  // ---- Central plaza ---------------------------------------------------------------
  const plazaTex = stoneTexture(bag, '#2c3156', '#3e4678')
  plazaTex.repeat.set(5, 5)
  const plaza = new THREE.Mesh(
    bag.geo(new THREE.CylinderGeometry(HUB_RADIUS, HUB_RADIUS + 0.15, 0.14, 64)),
    bag.mat(new THREE.MeshStandardMaterial({ map: plazaTex, roughness: 0.7, metalness: 0.1 }))
  )
  plaza.position.set(CAMPUS_HUB.x, 0.02, CAMPUS_HUB.z)
  plaza.receiveShadow = true
  group.add(plaza)

  const ringMat = emissiveMat(bag, 0xb18cff, 1.7)
  for (const r of [HUB_RADIUS - 0.35, HUB_RADIUS - 1.6]) {
    const ring = new THREE.Mesh(bag.geo(new THREE.TorusGeometry(r, 0.045, 8, 96)), ringMat)
    ring.rotation.x = Math.PI / 2
    ring.position.set(CAMPUS_HUB.x, 0.1, CAMPUS_HUB.z)
    group.add(ring)
  }

  // Nyx core: crystal on a pedestal
  const pedestal = new THREE.Mesh(
    bag.geo(new THREE.CylinderGeometry(0.9, 1.2, 0.7, 24)),
    stdMat(bag, 0x1b1f45, 0.4, 0.5)
  )
  pedestal.position.set(CAMPUS_HUB.x, 0.4, CAMPUS_HUB.z)
  pedestal.castShadow = true
  group.add(pedestal)
  const core = new THREE.Mesh(
    bag.geo(new THREE.OctahedronGeometry(0.85, 0)),
    bag.mat(
      new THREE.MeshStandardMaterial({
        color: 0x9bb8ff,
        emissive: 0x6d7dff,
        emissiveIntensity: 1.8,
        roughness: 0.15,
        metalness: 0.2,
        transparent: true,
        opacity: 0.92
      })
    )
  )
  core.scale.set(1, 1.5, 1)
  core.position.set(CAMPUS_HUB.x, 2.1, CAMPUS_HUB.z)
  group.add(core)
  const halo = new THREE.Sprite(
    bag.mat(
      new THREE.SpriteMaterial({
        map: radialGlowTexture(bag),
        color: 0x7c8cff,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    )
  )
  halo.position.copy(core.position)
  halo.scale.setScalar(6)
  group.add(halo)
  const orbit = new THREE.Mesh(bag.geo(new THREE.TorusGeometry(1.5, 0.025, 8, 64)), ringMat)
  orbit.position.copy(core.position)
  group.add(orbit)
  const coreLight = new THREE.PointLight(0x8a97ff, 14, 22, 2)
  coreLight.position.set(CAMPUS_HUB.x, 3.0, CAMPUS_HUB.z)
  group.add(coreLight)

  // ---- Paths -------------------------------------------------------------------------
  const pathTex = stoneTexture(bag, '#30365e', '#434b7e')
  const pathMat = bag.mat(new THREE.MeshStandardMaterial({ map: pathTex, roughness: 0.75, metalness: 0.08 }))
  const pathSegments: Array<{ a: CampusPoint; b: CampusPoint; accent: number }> = [
    { a: STUDIO_GATE, b: { x: CAMPUS_HUB.x - HUB_RADIUS, z: CAMPUS_HUB.z }, accent: 0x60a5fa }
  ]
  for (const z of Object.values(CAMPUS_ZONES)) {
    const a = z.hubEdge
    const ex = z.center.x - Math.cos(z.spokeAngle) * 2.5
    const ez = z.center.z - Math.sin(z.spokeAngle) * 2.5
    pathSegments.push({ a, b: { x: ex, z: ez }, accent: z.accent })
  }
  const PATH_W = 3.2
  for (const seg of pathSegments) {
    const dx = seg.b.x - seg.a.x
    const dz = seg.b.z - seg.a.z
    const len = Math.hypot(dx, dz)
    const mesh = new THREE.Mesh(bag.geo(new THREE.BoxGeometry(PATH_W, 0.1, len)), pathMat.clone())
    const tex = pathTex.clone()
    tex.needsUpdate = true
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(PATH_W / 3, len / 3)
    bag.tex(tex)
    ;(mesh.material as THREE.MeshStandardMaterial).map = tex
    bag.mat(mesh.material as THREE.Material)
    mesh.position.set((seg.a.x + seg.b.x) / 2, 0.03, (seg.a.z + seg.b.z) / 2)
    mesh.rotation.y = Math.atan2(dx, dz)
    mesh.receiveShadow = true
    group.add(mesh)

    const stripMat = emissiveMat(bag, seg.accent, 1.5)
    for (const side of [-1, 1]) {
      const strip = new THREE.Mesh(bag.geo(new THREE.BoxGeometry(0.08, 0.05, len)), stripMat)
      strip.position.set(0, 0.08, 0)
      const holder = new THREE.Group()
      holder.position.copy(mesh.position)
      holder.rotation.y = mesh.rotation.y
      strip.position.x = side * (PATH_W / 2 - 0.05)
      holder.add(strip)
      group.add(holder)
    }
  }

  // ---- Lamps (instanced posts + glow points) ---------------------------------------
  const lampPositions: THREE.Vector3[] = []
  for (const seg of pathSegments) {
    const dx = seg.b.x - seg.a.x
    const dz = seg.b.z - seg.a.z
    const len = Math.hypot(dx, dz)
    const nx = -dz / len
    const nz = dx / len
    const n = Math.max(2, Math.floor(len / 5.5))
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n
      for (const side of [-1, 1]) {
        lampPositions.push(
          new THREE.Vector3(
            seg.a.x + dx * t + nx * side * (PATH_W / 2 + 0.7),
            0,
            seg.a.z + dz * t + nz * side * (PATH_W / 2 + 0.7)
          )
        )
      }
    }
  }
  // studio perimeter poles
  for (let x = STUDIO_X0 + 1; x <= STUDIO_X1 - 1; x += 9.6) {
    lampPositions.push(new THREE.Vector3(x, 0, -1.6), new THREE.Vector3(x, 0, depth - 2.4))
  }
  const postGeo = bag.geo(new THREE.CylinderGeometry(0.06, 0.09, 1.9, 8))
  const postMat = stdMat(bag, 0x1a1e3a, 0.5, 0.6)
  const posts = new THREE.InstancedMesh(postGeo, postMat, lampPositions.length)
  const globeGeo = bag.geo(new THREE.SphereGeometry(0.2, 12, 10))
  const globeMat = bag.mat(
    new THREE.MeshStandardMaterial({ color: 0x221a10, emissive: 0xffc88a, emissiveIntensity: 2.4 })
  )
  const globes = new THREE.InstancedMesh(globeGeo, globeMat, lampPositions.length)
  const m = new THREE.Matrix4()
  const glowPos = new Float32Array(lampPositions.length * 3)
  lampPositions.forEach((p, i) => {
    m.makeTranslation(p.x, 0.95, p.z)
    posts.setMatrixAt(i, m)
    m.makeTranslation(p.x, 2.0, p.z)
    globes.setMatrixAt(i, m)
    glowPos.set([p.x, 2.0, p.z], i * 3)
  })
  posts.castShadow = true
  group.add(posts, globes)
  const glowGeo = bag.geo(new THREE.BufferGeometry())
  glowGeo.setAttribute('position', new THREE.BufferAttribute(glowPos, 3))
  const glowPts = new THREE.Points(
    glowGeo,
    bag.mat(
      new THREE.PointsMaterial({
        map: radialGlowTexture(bag),
        color: 0xffc27a,
        size: 3.4,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    )
  )
  group.add(glowPts)

  // ---- Trees (instanced) -------------------------------------------------------------
  const avoid: Array<{ p: CampusPoint; r: number }> = [
    { p: CAMPUS_HUB, r: HUB_RADIUS + 3 },
    ...ALL_ZONE_DEFS.filter((z) => z.id !== 'coding-studio').map((z) => ({ p: z.center, r: 8.5 }))
  ]
  const trunkGeo = bag.geo(new THREE.CylinderGeometry(0.16, 0.24, 1.6, 7))
  const coneGeo = bag.geo(new THREE.ConeGeometry(1.5, 3.6, 8))
  const blobGeo = bag.geo(new THREE.IcosahedronGeometry(1.5, 1))
  const trunkMat = stdMat(bag, 0x2a1d33, 0.9)
  const foliageMat = bag.mat(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, flatShading: true }))
  const treeRnd = mulberry32(99)
  const trees: Array<{ x: number; z: number; s: number; kind: number; hue: THREE.Color }> = []
  const palette = [0x1d5c63, 0x24706b, 0x2b4f8f, 0x3b3a8f, 0x1f6b52].map((c) => new THREE.Color(c))
  const blossom = [0xd78bd6, 0xb67bf0, 0xf2a0c8].map((c) => new THREE.Color(c))
  let attempts = 0
  while (trees.length < 90 && attempts < 4000) {
    attempts++
    const ang = treeRnd() * Math.PI * 2
    const rad = 31 + treeRnd() * 22
    const x = CAMPUS_HUB.x - 8 + Math.cos(ang) * rad * 1.35
    const z = CAMPUS_HUB.z + Math.sin(ang) * rad
    const p = { x, z }
    if (x > STUDIO_X0 - 2.5 && x < STUDIO_X1 + 2.5 && z > -4 && z < depth + 1) continue
    if (avoid.some((a) => Math.hypot(p.x - a.p.x, p.z - a.p.z) < a.r)) continue
    if (pathSegments.some((s) => distToSegment(p, s.a, s.b) < 3.4)) continue
        const isBlossom = treeRnd() < 0.2
    trees.push({
      x,
      z,
      s: 0.65 + treeRnd() * 0.6,
      kind: isBlossom ? 2 : treeRnd() < 0.55 ? 0 : 1,
      hue: (isBlossom ? blossom : palette)[Math.floor(treeRnd() * (isBlossom ? blossom : palette).length)]
    })
  }
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length)
  const conifers = new THREE.InstancedMesh(coneGeo, foliageMat, trees.length)
  const blobs = new THREE.InstancedMesh(blobGeo, foliageMat, trees.length)
  let nCone = 0
  let nBlob = 0
  const q = new THREE.Quaternion()
  const sc = new THREE.Vector3()
  const pp = new THREE.Vector3()
  trees.forEach((t, i) => {
    m.compose(pp.set(t.x, 0.8 * t.s, t.z), q, sc.set(t.s, t.s, t.s))
    trunks.setMatrixAt(i, m)
    if (t.kind === 0) {
      m.compose(pp.set(t.x, (1.6 + 1.7) * t.s, t.z), q, sc.set(t.s, t.s, t.s))
      conifers.setMatrixAt(nCone, m)
      conifers.setColorAt(nCone, t.hue)
      nCone++
    } else {
      m.compose(pp.set(t.x, 2.7 * t.s, t.z), q, sc.set(t.s * 1.05, t.s * 0.95, t.s * 1.05))
      blobs.setMatrixAt(nBlob, m)
      blobs.setColorAt(nBlob, t.hue)
      nBlob++
    }
  })
  conifers.count = nCone
  blobs.count = nBlob
  for (const mesh of [trunks, conifers, blobs]) {
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.instanceMatrix.needsUpdate = true
    group.add(mesh)
  }
  if (conifers.instanceColor) conifers.instanceColor.needsUpdate = true
  if (blobs.instanceColor) blobs.instanceColor.needsUpdate = true

  // ---- Fireflies ---------------------------------------------------------------------
  const fireflyCount = 90
  const ffBase = new Float32Array(fireflyCount * 3)
  const ffRnd = mulberry32(8)
  for (let i = 0; i < fireflyCount; i++) {
    const a = ffRnd() * Math.PI * 2
    const r = 6 + ffRnd() * 38
    ffBase[i * 3] = CAMPUS_HUB.x - 8 + Math.cos(a) * r
    ffBase[i * 3 + 1] = 0.5 + ffRnd() * 2.4
    ffBase[i * 3 + 2] = CAMPUS_HUB.z + Math.sin(a) * r
  }
  const ffPos = new Float32Array(ffBase)
  const ffGeo = bag.geo(new THREE.BufferGeometry())
  ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos, 3))
  const fireflies = new THREE.Points(
    ffGeo,
    bag.mat(
      new THREE.PointsMaterial({
        map: radialGlowTexture(bag),
        color: 0xd9ff8a,
        size: 0.7,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    )
  )
  fireflies.frustumCulled = false
  group.add(fireflies)

  return {
    group,
    update(t: number): void {
      core.rotation.y = t * 0.6
      core.position.y = 2.1 + Math.sin(t * 1.2) * 0.12
      orbit.rotation.x = t * 0.5
      orbit.rotation.z = t * 0.3
      halo.material.opacity = 0.6 + Math.sin(t * 1.7) * 0.12
      for (let i = 0; i < fireflyCount; i++) {
        const k = i * 3
        ffPos[k] = ffBase[k] + Math.sin(t * 0.4 + i) * 0.9
        ffPos[k + 1] = ffBase[k + 1] + Math.sin(t * 0.7 + i * 1.7) * 0.35
        ffPos[k + 2] = ffBase[k + 2] + Math.cos(t * 0.35 + i * 0.6) * 0.9
      }
      ffGeo.attributes.position.needsUpdate = true
    }
  }
}
