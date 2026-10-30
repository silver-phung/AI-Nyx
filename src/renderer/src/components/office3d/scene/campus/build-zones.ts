import * as THREE from 'three'
import {
  CAMPUS_HUB,
  CAMPUS_ZONES,
  STUDIO_GATE,
  STUDIO_X0,
  STUDIO_X1,
  STUDIO_ZONE,
  studioDepth,
  type CampusZoneDef,
  type CampusZoneId
} from './campus-layout'
import {
  ResourceBag,
  drawCanvas,
  emissiveMat,
  hex,
  makeStationBoard,
  makeZoneLabel,
  mulberry32,
  radialGlowTexture,
  roundRect,
  stdMat,
  type StationStatus
} from './campus-kit'

export interface ZoneView {
  readonly id: CampusZoneId
  readonly group: THREE.Group
  /** World-space point where a carried package is delivered. */
  readonly packageTarget: THREE.Vector3
  /** Billboards that should keep a readable on-screen size. */
  readonly labels: THREE.Sprite[]
  update(timeSeconds: number): void
  /** Visual state only. Never triggers any real operation. */
  setStatus(status: StationStatus, headline: string, detail?: string, preview?: boolean): void
  /** Agent handed over a package: flash/pulse the station. */
  receivePackage(): void
}

interface Ctx {
  bag: ResourceBag
  def: CampusZoneDef
  group: THREE.Group
  local: THREE.Group
  tickers: Array<(t: number, state: ZoneState) => void>
  labels: THREE.Sprite[]
}

interface ZoneState {
  status: StationStatus
  statusSince: number
  pulse: number // 0..1 decays
  now: number
}

function box(ctx: Ctx, w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, parent?: THREE.Object3D): THREE.Mesh {
  const m = new THREE.Mesh(ctx.bag.geo(new THREE.BoxGeometry(w, h, d)), mat)
  m.position.set(x, y, z)
  m.castShadow = true
  m.receiveShadow = true
  ;(parent ?? ctx.local).add(m)
  return m
}

function cyl(ctx: Ctx, rt: number, rb: number, h: number, mat: THREE.Material, x: number, y: number, z: number, seg = 16, parent?: THREE.Object3D): THREE.Mesh {
  const m = new THREE.Mesh(ctx.bag.geo(new THREE.CylinderGeometry(rt, rb, h, seg)), mat)
  m.position.set(x, y, z)
  m.castShadow = true
  m.receiveShadow = true
  ;(parent ?? ctx.local).add(m)
  return m
}

function glowSprite(ctx: Ctx, color: number, scale: number, x: number, y: number, z: number, opacity = 0.7): THREE.Sprite {
  const s = new THREE.Sprite(
    ctx.bag.mat(
      new THREE.SpriteMaterial({
        map: radialGlowTexture(ctx.bag),
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    )
  )
  s.position.set(x, y, z)
  s.scale.setScalar(scale)
  ctx.local.add(s)
  return s
}

function baseZone(bag: ResourceBag, def: CampusZoneDef, faceHub = true): Ctx {
  const group = new THREE.Group()
  group.name = `zone-${def.id}`
  group.position.set(def.center.x, 0, def.center.z)
  const local = new THREE.Group()
  if (faceHub) local.rotation.y = Math.atan2(CAMPUS_HUB.x - def.center.x, CAMPUS_HUB.z - def.center.z)
  group.add(local)
  return { bag, def, group, local, tickers: [], labels: [] }
}

function addLabelAndLight(ctx: Ctx, labelY = 7.4, lightY = 3.8, lightIntensity = 22): void {
  const label = makeZoneLabel(ctx.bag, ctx.def.label, ctx.def.subtitle, ctx.def.accent)
  label.position.set(0, labelY, 0)
  ctx.group.add(label)
  ctx.labels.push(label)
  const light = new THREE.PointLight(ctx.def.accent, lightIntensity, 17, 2)
  light.position.set(0, lightY, 0)
  ctx.group.add(light)
}

function floorDisc(ctx: Ctx, radius: number, color: number, rim: number, y = 0.08): void {
  const disc = new THREE.Mesh(
    ctx.bag.geo(new THREE.CylinderGeometry(radius, radius + 0.12, 0.16, 56)),
    stdMat(ctx.bag, color, 0.75, 0.1)
  )
  disc.position.y = y - 0.04
  disc.receiveShadow = true
  ctx.local.add(disc)
  const ring = new THREE.Mesh(ctx.bag.geo(new THREE.TorusGeometry(radius - 0.12, 0.05, 8, 72)), emissiveMat(ctx.bag, rim, 1.8))
  ring.rotation.x = Math.PI / 2
  ring.position.y = y + 0.05
  ctx.local.add(ring)
}

function finish(ctx: Ctx, board?: ReturnType<typeof makeStationBoard>, extraPulse?: (s: ZoneState) => void): ZoneView {
  const state: ZoneState = { status: 'idle', statusSince: 0, pulse: 0, now: 0 }
  const packageTarget = new THREE.Vector3()
  ctx.group.updateMatrixWorld(true)
  return {
    id: ctx.def.id,
    group: ctx.group,
    labels: ctx.labels,
    packageTarget: ctx.def.id === 'coding-studio' ? new THREE.Vector3(ctx.def.center.x, 1, ctx.def.center.z) : packageTarget.set(ctx.def.center.x, 1.1, ctx.def.center.z),
    update(t) {
      const dt = Math.max(0, t - state.now)
      state.now = t
      state.pulse = Math.max(0, state.pulse - dt * 1.4)
      for (const f of ctx.tickers) f(t, state)
    },
    setStatus(status, headline, detail, preview = false) {
      state.status = status
      state.statusSince = state.now
      board?.set(status, headline, detail, preview)
    },
    receivePackage() {
      state.pulse = 1
      extraPulse?.(state)
    }
  }
}

// ---------------------------------------------------------------------------------------
// Coding Studio
// ---------------------------------------------------------------------------------------
function buildStudio(bag: ResourceBag, podRows: number): ZoneView {
  const def = STUDIO_ZONE
  const depth = studioDepth(podRows)
  const ctx = baseZone(bag, def, false)
  ctx.group.position.set(0, 0, 0)
  const accent = emissiveMat(bag, def.accent, 1.8)
  const dark = stdMat(bag, 0x2a3160, 0.5, 0.4)

  // entrance portal at the gate
  for (const dz of [-2.4, 2.4]) {
    box(ctx, 0.5, 4.4, 0.5, dark, STUDIO_GATE.x - 0.4, 2.2, STUDIO_GATE.z + dz)
    box(ctx, 0.12, 4.0, 0.12, accent, STUDIO_GATE.x - 0.4, 2.2, STUDIO_GATE.z + dz + (dz > 0 ? -0.3 : 0.3))
  }
  box(ctx, 0.6, 0.5, 5.8, dark, STUDIO_GATE.x - 0.4, 4.5, STUDIO_GATE.z)
  box(ctx, 0.14, 0.14, 5.8, accent, STUDIO_GATE.x - 0.4, 4.18, STUDIO_GATE.z)

  // perimeter planters + uplights along north and west edge
  const planterMat = stdMat(bag, 0x23284e, 0.7, 0.2)
  const leafMat = bag.mat(new THREE.MeshStandardMaterial({ color: 0x2e8b7a, roughness: 0.85, flatShading: true }))
  const rnd = mulberry32(12)
  for (let x = STUDIO_X0 + 2; x < STUDIO_X1 - 1; x += 3.4) {
    box(ctx, 1.4, 0.6, 0.7, planterMat, x, 0.3, -1.4)
    const bush = new THREE.Mesh(bag.geo(new THREE.IcosahedronGeometry(0.55 + rnd() * 0.2, 1)), leafMat)
    bush.position.set(x, 0.85, -1.4)
    ctx.local.add(bush)
  }
  for (let z = 1; z < depth - 2; z += 3.4) {
    box(ctx, 0.7, 0.6, 1.4, planterMat, STUDIO_X0 + 0.7, 0.3, z)
    const bush = new THREE.Mesh(bag.geo(new THREE.IcosahedronGeometry(0.55 + rnd() * 0.2, 1)), leafMat)
    bush.position.set(STUDIO_X0 + 0.7, 0.85, z)
    ctx.local.add(bush)
  }

  const label = makeZoneLabel(bag, def.label, def.subtitle, def.accent)
  label.position.set(13, 7.6, -1.6)
  ctx.group.add(label)
  ctx.labels.push(label)

  // soft fill so the studio reads even without the pod lights
  const wash = new THREE.PointLight(0x6fa0ff, 16, 28, 2)
  wash.position.set(14, 6.5, depth / 2 - 2)
  ctx.group.add(wash)

  return finish(ctx)
}

// ---------------------------------------------------------------------------------------
// Review Pavilion
// ---------------------------------------------------------------------------------------
function diffTexture(bag: ResourceBag, seed: number): THREE.CanvasTexture {
  const rnd = mulberry32(seed)
  const c = drawCanvas(256, 320, (ctx, w, h) => {
    roundRect(ctx, 4, 4, w - 8, h - 8, 18)
    ctx.fillStyle = 'rgba(30,24,10,0.55)'
    ctx.fill()
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(251,191,36,0.9)'
    ctx.stroke()
    for (let y = 28; y < h - 24; y += 16) {
      const kind = rnd()
      ctx.fillStyle = kind < 0.2 ? 'rgba(248,113,113,0.85)' : kind < 0.45 ? 'rgba(52,211,153,0.85)' : 'rgba(226,232,255,0.55)'
      ctx.fillRect(24, y, 40 + rnd() * (w - 90), 6)
    }
  })
  const t = bag.tex(new THREE.CanvasTexture(c))
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function buildReview(bag: ResourceBag): ZoneView {
  const def = CAMPUS_ZONES['review-pavilion']
  const ctx = baseZone(bag, def)
  floorDisc(ctx, 5.4, 0x3a3358, def.accent)
  const stone = stdMat(bag, 0xe8dcc4, 0.55, 0.05)
  const glowAmber = emissiveMat(bag, def.accent, 2.2)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8
    cyl(ctx, 0.17, 0.2, 3.6, stone, Math.cos(a) * 4.6, 1.9, Math.sin(a) * 4.6, 14)
    const lantern = new THREE.Mesh(bag.geo(new THREE.SphereGeometry(0.16, 12, 10)), glowAmber)
    lantern.position.set(Math.cos(a) * 4.0, 3.0, Math.sin(a) * 4.0)
    ctx.local.add(lantern)
  }
  // roof: shallow cone on a rim
  // Open-oculus roof: an eight-sided annulus so the table and holograms stay visible from above.
  const roofProfile = [
    new THREE.Vector2(3.6, 4.4),
    new THREE.Vector2(3.8, 4.52),
    new THREE.Vector2(5.7, 3.72),
    new THREE.Vector2(5.7, 3.58),
    new THREE.Vector2(3.6, 4.28)
  ]
  const roof = new THREE.Mesh(
    bag.geo(new THREE.LatheGeometry(roofProfile, 8)),
    bag.mat(new THREE.MeshStandardMaterial({ color: 0x6a58a8, roughness: 0.5, metalness: 0.25, side: THREE.DoubleSide }))
  )
  roof.castShadow = true
  ctx.local.add(roof)
  const oculus = new THREE.Mesh(bag.geo(new THREE.TorusGeometry(3.7, 0.06, 8, 8)), glowAmber)
  oculus.rotation.x = Math.PI / 2
  oculus.rotation.z = Math.PI / 8
  oculus.position.y = 4.4
  ctx.local.add(oculus)
  const roofRing = new THREE.Mesh(bag.geo(new THREE.TorusGeometry(5.5, 0.07, 8, 8)), glowAmber)
  roofRing.rotation.x = Math.PI / 2
  roofRing.rotation.z = Math.PI / 8
  roofRing.position.y = 3.58
  ctx.local.add(roofRing)

  // central table + papers
  cyl(ctx, 1.35, 1.35, 0.1, stdMat(bag, 0x5b4636, 0.5), 0, 0.82, 0, 32)
  cyl(ctx, 0.18, 0.3, 0.74, stdMat(bag, 0x2a2238, 0.4, 0.5), 0, 0.42, 0, 12)
  for (let i = 0; i < 5; i++) {
    const p = box(ctx, 0.5, 0.03, 0.38, stdMat(bag, 0xf4ecd8, 0.8), Math.cos(i * 1.3) * 0.6, 0.9 + i * 0.01, Math.sin(i * 1.3) * 0.5)
    p.rotation.y = i * 0.7
  }
  // chairs
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    const seat = cyl(ctx, 0.3, 0.3, 0.1, stdMat(bag, 0x8b5a3c, 0.7), Math.cos(a) * 2.0, 0.5, Math.sin(a) * 2.0, 14)
    cyl(ctx, 0.05, 0.05, 0.5, stdMat(bag, 0x1d1830, 0.4, 0.6), seat.position.x, 0.25, seat.position.z, 6)
  }
  // magnifier hologram
  const lens = new THREE.Group()
  const lensRing = new THREE.Mesh(bag.geo(new THREE.TorusGeometry(0.55, 0.06, 12, 40)), glowAmber)
  const lensHandle = new THREE.Mesh(bag.geo(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 8)), glowAmber)
  lensHandle.position.set(0.55, -0.55, 0)
  lensHandle.rotation.z = Math.PI / 4
  const lensGlass = new THREE.Mesh(
    bag.geo(new THREE.CircleGeometry(0.52, 32)),
    bag.mat(new THREE.MeshBasicMaterial({ color: 0xfde68a, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }))
  )
  lens.add(lensRing, lensHandle, lensGlass)
  lens.position.set(0, 2.2, 0)
  ctx.local.add(lens)
  // diff panels orbiting
  const panels: THREE.Mesh[] = []
  for (let i = 0; i < 3; i++) {
    const p = new THREE.Mesh(
      bag.geo(new THREE.PlaneGeometry(0.9, 1.15)),
      bag.mat(new THREE.MeshBasicMaterial({ map: diffTexture(bag, 40 + i), transparent: true, side: THREE.DoubleSide, depthWrite: false }))
    )
    ctx.local.add(p)
    panels.push(p)
  }
  const board = makeStationBoard(bag, def.accent, 'Code review')
  board.sprite.position.set(0, 5.9, 2.0)
  ctx.local.add(board.sprite)
  addLabelAndLight(ctx, 8.3, 3.0, 26)
  ctx.tickers.push((t, s) => {
    lens.position.y = 2.2 + Math.sin(t * 1.4) * 0.12
    lens.rotation.y = t * 0.8
    const scan = s.status === 'working' ? 1 : 0
    lens.position.x = Math.sin(t * 1.9) * 0.8 * scan
    panels.forEach((p, i) => {
      const a = t * 0.5 + (i / 3) * Math.PI * 2
      p.position.set(Math.cos(a) * 1.9, 1.9 + Math.sin(t + i) * 0.1, Math.sin(a) * 1.9)
      p.rotation.y = -a + Math.PI / 2
    })
    glowAmber.emissiveIntensity = 2.0 + s.pulse * 3 + Math.sin(t * 2) * 0.2
  })
  return finish(ctx, board)
}

// ---------------------------------------------------------------------------------------
// Testing Lab
// ---------------------------------------------------------------------------------------
function buildLab(bag: ResourceBag): ZoneView {
  const def = CAMPUS_ZONES['testing-lab']
  const ctx = baseZone(bag, def)
  floorDisc(ctx, 5.6, 0x1d2a3a, def.accent)
  const wall = stdMat(bag, 0x34437a, 0.5, 0.3)
  const glass = emissiveMat(bag, def.accent, 1.5, 0x0a2a30)
  box(ctx, 9, 4.2, 4.4, wall, 0, 2.1, -2.6)
  box(ctx, 9.6, 0.3, 5.0, stdMat(bag, 0x46548f, 0.4, 0.35), 0, 4.35, -2.6)
  // front windows + door
  for (let i = -2; i <= 2; i++) {
    if (i === 0) continue
    box(ctx, 1.25, 2.0, 0.08, glass, i * 1.7, 2.3, -0.38)
  }
  box(ctx, 1.4, 2.4, 0.1, emissiveMat(bag, 0x7dfcea, 1.1, 0x0f3a40), 0, 1.3, -0.36)
  box(ctx, 9.2, 0.12, 0.12, emissiveMat(bag, def.accent, 2.0), 0, 4.2, -0.34)
  // rooftop vents + radar
  cyl(ctx, 0.45, 0.45, 0.6, wall, -2.8, 4.8, -3.2, 12)
  cyl(ctx, 0.45, 0.45, 0.6, wall, -1.6, 4.8, -3.2, 12)
  const radar = new THREE.Group()
  radar.position.set(2.8, 4.5, -3.0)
  radar.add(new THREE.Mesh(bag.geo(new THREE.CylinderGeometry(0.06, 0.08, 0.9, 8)), stdMat(bag, 0x9aa7d8, 0.4, 0.6)))
  const dish = new THREE.Mesh(
    bag.geo(new THREE.SphereGeometry(0.7, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2.4)),
    stdMat(bag, 0xcfd8ff, 0.35, 0.5)
  )
  dish.position.y = 0.6
  dish.rotation.x = -Math.PI / 3
  dish.castShadow = true
  radar.add(dish)
  ctx.local.add(radar)

  // test rack: three pylons
  const pylonMats = [0, 1, 2].map(() => bag.mat(new THREE.MeshStandardMaterial({ color: 0x0b1020, emissive: 0x2dd4bf, emissiveIntensity: 0.9 })))
  const pylonTops: THREE.Mesh[] = []
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 1.5
    cyl(ctx, 0.2, 0.26, 1.2, stdMat(bag, 0x252f55, 0.5, 0.5), x, 0.6, 1.5, 12)
    const top = new THREE.Mesh(bag.geo(new THREE.SphereGeometry(0.24, 16, 12)), pylonMats[i])
    top.position.set(x, 1.45, 1.5)
    ctx.local.add(top)
    pylonTops.push(top)
  }
  // lab bench with beakers
  box(ctx, 2.6, 0.12, 0.9, stdMat(bag, 0x364066, 0.4, 0.4), 3.6, 0.9, 1.2)
  for (const x of [2.8, 3.4, 4.0]) {
    cyl(ctx, 0.12, 0.12, 0.34, bag.mat(new THREE.MeshPhysicalMaterial({ color: 0xbff8ff, transparent: true, opacity: 0.4, roughness: 0.1 })), x, 1.15, 1.2, 12)
    cyl(ctx, 0.1, 0.1, 0.16, emissiveMat(bag, 0x34f5c5, 1.6), x, 1.04, 1.2, 12)
  }
  cyl(ctx, 0.06, 0.06, 0.9, stdMat(bag, 0x252f55, 0.5, 0.5), 2.5, 0.45, 1.0, 6)
  cyl(ctx, 0.06, 0.06, 0.9, stdMat(bag, 0x252f55, 0.5, 0.5), 4.7, 0.45, 1.0, 6)

  const board = makeStationBoard(bag, def.accent, 'Test run')
  board.sprite.position.set(0, 6.2, 1.2)
  ctx.local.add(board.sprite)
  addLabelAndLight(ctx, 8.8, 3.4, 24)

  const col = { ok: new THREE.Color(0x34d399), bad: new THREE.Color(0xf87171), work: new THREE.Color(0xfbbf24), idle: new THREE.Color(def.accent) }
  ctx.tickers.push((t, s) => {
    radar.rotation.y = t * (s.status === 'working' ? 3 : 0.7)
    const c = s.status === 'succeeded' ? col.ok : s.status === 'failed' ? col.bad : s.status === 'working' ? col.work : col.idle
    pylonMats.forEach((m, i) => {
      m.emissive.copy(c)
      const wave = s.status === 'working' ? 0.5 + 0.5 * Math.sin(t * 6 - i * 1.2) : 1
      m.emissiveIntensity = (0.9 + s.pulse * 2.5) * (s.status === 'idle' ? 0.5 + 0.4 * Math.sin(t * 2 + i) : wave)
    })
  })
  return finish(ctx, board)
}

// ---------------------------------------------------------------------------------------
// Git Station
// ---------------------------------------------------------------------------------------
function buildGit(bag: ResourceBag): ZoneView {
  const def = CAMPUS_ZONES['git-station']
  const ctx = baseZone(bag, def)
  floorDisc(ctx, 5.2, 0x2a2438, def.accent)
  const dark = stdMat(bag, 0x33396c, 0.45, 0.4)
  const orange = emissiveMat(bag, def.accent, 2.1)
  // arch
  for (const x of [-2.8, 2.8]) {
    box(ctx, 0.5, 4.0, 0.6, dark, x, 2.0, -2.2)
    box(ctx, 0.1, 3.6, 0.1, orange, x, 2.0, -1.88)
  }
  box(ctx, 6.2, 0.6, 0.7, dark, 0, 4.2, -2.2)
  box(ctx, 5.8, 0.12, 0.12, orange, 0, 3.86, -1.84)
  // kiosk
  box(ctx, 1.5, 1.1, 1.0, dark, 0, 0.6, -0.4)
  const screen = box(ctx, 1.2, 0.7, 0.08, emissiveMat(bag, 0x4c1d95, 1.2, 0x120a30), 0, 1.45, -0.52)
  screen.rotation.x = -0.35
  // chute funnel
  const funnel = new THREE.Mesh(bag.geo(new THREE.ConeGeometry(0.7, 0.9, 20, 1, true)), bag.mat(new THREE.MeshStandardMaterial({ color: 0x2a2f5a, emissive: def.accent, emissiveIntensity: 0.7, side: THREE.DoubleSide, roughness: 0.4 })))
  funnel.rotation.x = Math.PI
  funnel.position.set(1.9, 1.5, -0.4)
  ctx.local.add(funnel)
  cyl(ctx, 0.12, 0.12, 1.0, dark, 1.9, 0.5, -0.4, 8)
  // branch graph (two lanes)
  const nodeMat = emissiveMat(bag, 0xffd9a0, 1.6)
  const nodes: THREE.Mesh[] = []
  const laneMat = emissiveMat(bag, def.accent, 1.3)
  const graph = new THREE.Group()
  graph.position.set(0, 0, -2.9)
  ctx.local.add(graph)
  cyl(ctx, 0.04, 0.04, 3.2, laneMat, -1.1, 1.9, 0, 6, graph)
  cyl(ctx, 0.04, 0.04, 2.0, laneMat, 1.1, 1.9, 0, 6, graph)
  for (let i = 0; i < 6; i++) {
    const n = new THREE.Mesh(bag.geo(new THREE.SphereGeometry(0.14, 12, 10)), nodeMat)
    n.position.set(-1.1, 0.7 + i * 0.52, 0)
    graph.add(n)
    nodes.push(n)
  }
  for (let i = 0; i < 3; i++) {
    const n = new THREE.Mesh(bag.geo(new THREE.SphereGeometry(0.12, 12, 10)), nodeMat)
    n.position.set(1.1, 1.3 + i * 0.6, 0)
    graph.add(n)
  }
  // crates
  const crateMat = stdMat(bag, 0x3a2f55, 0.6, 0.2)
  box(ctx, 0.7, 0.7, 0.7, crateMat, -2.4, 0.35, 0.4)
  box(ctx, 0.6, 0.6, 0.6, crateMat, -2.5, 1.0, 0.45).rotation.y = 0.5
  box(ctx, 0.7, 0.7, 0.7, crateMat, -1.8, 0.35, 1.1)
  // beacon
  const beacon = new THREE.Mesh(bag.geo(new THREE.SphereGeometry(0.28, 14, 12)), emissiveMat(bag, 0xffc27a, 2.6))
  beacon.position.set(0, 4.9, -2.2)
  ctx.local.add(beacon)
  const beaconGlow = glowSprite(ctx, def.accent, 3.2, 0, 4.9, -2.2, 0.6)

  const board = makeStationBoard(bag, def.accent, 'Git push')
  board.sprite.position.set(0, 6.4, -0.6)
  ctx.local.add(board.sprite)
  addLabelAndLight(ctx, 9.0, 3.2, 24)

  const lit = 5
  ctx.tickers.push((t, s) => {
    beaconGlow.material.opacity = 0.45 + 0.25 * Math.sin(t * (s.status === 'working' ? 8 : 2)) + s.pulse * 0.4
    nodes.forEach((n, i) => {
      const on = i <= lit
      const m = n.scale
      const target = on ? 1 + (i === lit ? 0.25 * Math.sin(t * 5) + s.pulse * 0.8 : 0) : 0.45
      m.setScalar(target)
    })
  })
  return finish(ctx, board)
}

// ---------------------------------------------------------------------------------------
// Deployment Center
// ---------------------------------------------------------------------------------------
function buildDeploy(bag: ResourceBag): ZoneView {
  const def = CAMPUS_ZONES['deployment-center']
  const ctx = baseZone(bag, def)
  floorDisc(ctx, 5.6, 0x241f45, def.accent)
  const violet = emissiveMat(bag, def.accent, 1.9)
  for (const r of [1.6, 3.0, 4.4]) {
    const ring = new THREE.Mesh(bag.geo(new THREE.TorusGeometry(r, 0.05, 8, 64)), violet)
    ring.rotation.x = Math.PI / 2
    ring.position.set(0, 0.14, -0.6)
    ctx.local.add(ring)
  }
  const rocket = new THREE.Group()
  rocket.position.set(0, 0.2, -0.6)
  ctx.local.add(rocket)
  const hull = stdMat(bag, 0xf4f6ff, 0.3, 0.25)
  cyl(ctx, 0.55, 0.65, 3.0, hull, 0, 1.7, 0, 24, rocket)
  const nose = new THREE.Mesh(bag.geo(new THREE.ConeGeometry(0.55, 1.2, 24)), stdMat(bag, 0xa78bfa, 0.35, 0.3))
  nose.position.set(0, 3.8, 0)
  nose.castShadow = true
  rocket.add(nose)
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2
    const fin = box(ctx, 0.12, 1.0, 0.7, stdMat(bag, 0xa78bfa, 0.4, 0.3), Math.cos(a) * 0.72, 0.6, Math.sin(a) * 0.72, rocket)
    fin.rotation.y = -a
  }
  for (const y of [1.9, 2.7]) {
    const w = new THREE.Mesh(bag.geo(new THREE.SphereGeometry(0.17, 12, 10)), emissiveMat(bag, 0x7dd3fc, 1.6))
    w.position.set(0, y, 0.6)
    rocket.add(w)
  }
  const flame = new THREE.Mesh(bag.geo(new THREE.ConeGeometry(0.4, 1.3, 14)), bag.mat(new THREE.MeshBasicMaterial({ color: 0xffb36b, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })))
  flame.rotation.x = Math.PI
  flame.position.set(0, -0.2, 0)
  rocket.add(flame)

  // scaffold tower
  const steel = stdMat(bag, 0x59608f, 0.5, 0.6)
  for (const [x, z] of [[-1.6, -0.4], [-1.6, -1.6], [-2.5, -0.4], [-2.5, -1.6]]) cyl(ctx, 0.05, 0.05, 4.6, steel, x, 2.3, z, 6)
  for (let y = 0.8; y < 4.6; y += 1.0) {
    box(ctx, 0.9, 0.05, 0.05, steel, -2.05, y, -0.4)
    box(ctx, 0.9, 0.05, 0.05, steel, -2.05, y, -1.6)
    box(ctx, 0.05, 0.05, 1.2, steel, -1.6, y, -1.0)
    box(ctx, 0.05, 0.05, 1.2, steel, -2.5, y, -1.0)
  }
  // control cabin
  box(ctx, 2.6, 1.8, 2.0, stdMat(bag, 0x3a4680, 0.45, 0.35), 3.4, 0.9, -2.8)
  box(ctx, 2.0, 0.7, 0.08, emissiveMat(bag, 0x93c5fd, 1.4, 0x0c1b3a), 3.4, 1.2, -1.78)
  cyl(ctx, 0.04, 0.04, 1.4, steel, 4.4, 2.5, -3.2, 6)

  const board = makeStationBoard(bag, def.accent, 'Deployment')
  board.sprite.position.set(0, 6.9, 0.4)
  ctx.local.add(board.sprite)
  addLabelAndLight(ctx, 9.4, 3.4, 24)

  const okC = new THREE.Color(0x34d399)
  const badC = new THREE.Color(0xf87171)
  const baseC = new THREE.Color(def.accent)
  ctx.tickers.push((t, s) => {
    const since = s.now - s.statusSince
    let lift = 0
    let flameOp = 0
    if (s.status === 'working') {
      rocket.position.x = Math.sin(t * 60) * 0.015
      flameOp = 0.25 + 0.15 * Math.sin(t * 20)
    } else {
      rocket.position.x = 0
    }
    if (s.status === 'succeeded') {
      const u = Math.min(since / 7, 1)
      lift = Math.sin(u * Math.PI) * 5.0
      flameOp = u < 1 ? 0.8 : 0
    }
    rocket.position.y = 0.2 + lift
    ;(flame.material as THREE.MeshBasicMaterial).opacity = flameOp
    flame.scale.y = 0.8 + 0.4 * Math.sin(t * 25)
    violet.emissive.copy(s.status === 'succeeded' ? okC : s.status === 'failed' ? badC : baseC)
    violet.emissiveIntensity = 1.6 + s.pulse * 2 + (s.status === 'failed' ? 1.0 * (0.5 + 0.5 * Math.sin(t * 9)) : 0)
  })
  return finish(ctx, board)
}

// ---------------------------------------------------------------------------------------
// Meeting Area
// ---------------------------------------------------------------------------------------
function rugTexture(bag: ResourceBag, accent: number): THREE.CanvasTexture {
  const c = drawCanvas(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#2a1f4a'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = hex(accent)
    ctx.lineWidth = 4
    for (let r = 120; r > 20; r -= 24) {
      ctx.globalAlpha = 0.25 + (r / 160) * 0.4
      ctx.beginPath()
      ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2)
      ctx.stroke()
    }
  })
  const t = bag.tex(new THREE.CanvasTexture(c))
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function buildMeeting(bag: ResourceBag): ZoneView {
  const def = CAMPUS_ZONES['meeting-area']
  const ctx = baseZone(bag, def)
  floorDisc(ctx, 5.4, 0x2b2144, def.accent)
  const rug = new THREE.Mesh(bag.geo(new THREE.CircleGeometry(3.4, 48)), bag.mat(new THREE.MeshStandardMaterial({ map: rugTexture(bag, def.accent), roughness: 1 })))
  rug.rotation.x = -Math.PI / 2
  rug.position.y = 0.17
  ctx.local.add(rug)
  const wood = stdMat(bag, 0x4a3328, 0.65, 0.1)
  const pink = emissiveMat(bag, def.accent, 2.0)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    cyl(ctx, 0.13, 0.16, 3.4, wood, Math.cos(a) * 4.4, 1.7, Math.sin(a) * 4.4, 10)
  }
  const beam = new THREE.Mesh(bag.geo(new THREE.TorusGeometry(4.4, 0.12, 10, 48)), wood)
  beam.rotation.x = Math.PI / 2
  beam.position.y = 3.4
  beam.castShadow = true
  ctx.local.add(beam)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    const rafter = box(ctx, 4.5, 0.1, 0.14, wood, Math.cos(a) * 2.2, 3.45, Math.sin(a) * 2.2)
    rafter.rotation.y = -a
  }
  // string lights
  const bulbGeo = bag.geo(new THREE.SphereGeometry(0.08, 8, 6))
  const bulbMat = bag.mat(new THREE.MeshStandardMaterial({ color: 0x201020, emissive: 0xffd9a0, emissiveIntensity: 3 }))
  const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, 48)
  const m4 = new THREE.Matrix4()
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2
    const sag = 0.25 * Math.abs(Math.sin(a * 3))
    m4.makeTranslation(Math.cos(a) * 4.4, 3.2 - sag, Math.sin(a) * 4.4)
    bulbs.setMatrixAt(i, m4)
  }
  ctx.local.add(bulbs)
  // table + benches
  cyl(ctx, 1.2, 1.2, 0.1, stdMat(bag, 0xd9c7a6, 0.5), 0, 0.8, 0, 32)
  cyl(ctx, 0.2, 0.34, 0.7, wood, 0, 0.45, 0, 12)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6
    const g = new THREE.Group()
    g.position.set(Math.cos(a) * 2.6, 0, Math.sin(a) * 2.6)
    g.rotation.y = -a + Math.PI / 2
    ctx.local.add(g)
    box(ctx, 1.7, 0.16, 0.6, wood, 0, 0.45, 0, g)
    box(ctx, 1.5, 0.14, 0.5, pink, 0, 0.58, 0, g)
    box(ctx, 1.7, 0.7, 0.12, wood, 0, 0.85, 0.28, g)
  }
  // speech bubbles
  const bubbles: THREE.Sprite[] = []
  for (let i = 0; i < 3; i++) {
    const tex = bag.tex(
      new THREE.CanvasTexture(
        drawCanvas(128, 96, (c, w, h) => {
          roundRect(c, 6, 6, w - 12, h - 26, 22)
          c.fillStyle = 'rgba(255,240,250,0.92)'
          c.fill()
          c.beginPath()
          c.moveTo(34, h - 20)
          c.lineTo(26, h - 4)
          c.lineTo(52, h - 20)
          c.fill()
          c.fillStyle = hex(def.accent)
          for (let d = 0; d < 3; d++) {
            c.beginPath()
            c.arc(36 + d * 28, 38, 8, 0, Math.PI * 2)
            c.fill()
          }
        })
      )
    )
    tex.colorSpace = THREE.SRGBColorSpace
    const s = new THREE.Sprite(bag.mat(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })))
    s.scale.set(1.1, 0.82, 1)
    ctx.local.add(s)
    bubbles.push(s)
  }
  const board = makeStationBoard(bag, def.accent, 'Meeting')
  board.sprite.position.set(0, 5.8, 1.6)
  ctx.local.add(board.sprite)
  addLabelAndLight(ctx, 8.0, 3.0, 22)
  ctx.tickers.push((t, s) => {
    bubbles.forEach((b, i) => {
      b.position.set(-0.9 + i * 0.9, 2.1 + Math.sin(t * 1.6 + i * 2) * 0.12, 0)
      b.material.opacity = s.status === 'working' ? 1 : 0.55
    })
  })
  return finish(ctx, board)
}

// ---------------------------------------------------------------------------------------
// Waiting Garden
// ---------------------------------------------------------------------------------------
function buildGarden(bag: ResourceBag): ZoneView {
  const def = CAMPUS_ZONES['waiting-garden']
  const ctx = baseZone(bag, def)
  const grass = new THREE.Mesh(bag.geo(new THREE.CircleGeometry(5.8, 48)), bag.mat(new THREE.MeshStandardMaterial({ color: 0x1f6f66, roughness: 1 })))
  grass.rotation.x = -Math.PI / 2
  grass.position.y = 0.02
  grass.receiveShadow = true
  ctx.local.add(grass)
  const rim = new THREE.Mesh(bag.geo(new THREE.TorusGeometry(5.7, 0.06, 8, 64)), emissiveMat(bag, def.accent, 1.5))
  rim.rotation.x = Math.PI / 2
  rim.position.y = 0.06
  ctx.local.add(rim)
  // pond
  const pondMat = bag.mat(new THREE.MeshStandardMaterial({ color: 0x1b4a86, emissive: 0x1e5aa8, emissiveIntensity: 0.55, roughness: 0.08, metalness: 0.6 }))
  const pond = new THREE.Mesh(bag.geo(new THREE.CircleGeometry(2.1, 40)), pondMat)
  pond.rotation.x = -Math.PI / 2
  pond.position.set(1.3, 0.05, -0.8)
  ctx.local.add(pond)
  const pondRing = new THREE.Mesh(bag.geo(new THREE.TorusGeometry(2.15, 0.14, 8, 40)), stdMat(bag, 0x59608f, 0.8))
  pondRing.rotation.x = Math.PI / 2
  pondRing.position.set(1.3, 0.08, -0.8)
  ctx.local.add(pondRing)
  const padMat = stdMat(bag, 0x3fae7a, 0.9)
  for (let i = 0; i < 5; i++) {
    const pad = cyl(ctx, 0.28, 0.28, 0.02, padMat, 1.3 + Math.cos(i * 1.7) * 1.2, 0.07, -0.8 + Math.sin(i * 1.7) * 1.1, 10)
    pad.castShadow = false
  }
  // blossom trees
  const trunk = stdMat(bag, 0x3a2433, 0.9)
  const bloomMat = bag.mat(new THREE.MeshStandardMaterial({ color: 0xf0a6d6, emissive: 0x8a3a7a, emissiveIntensity: 0.35, roughness: 0.85, flatShading: true }))
  for (const [x, z, s] of [[-3.0, -2.4, 1.2], [3.6, -3.0, 1.0], [-3.4, 1.6, 0.85]]) {
    cyl(ctx, 0.2 * s, 0.3 * s, 2.4 * s, trunk, x, 1.2 * s, z, 8)
    for (const [dx, dy, dz, r] of [[0, 3.0, 0, 1.5], [0.8, 2.6, 0.4, 1.0], [-0.8, 2.7, -0.3, 1.1]]) {
      const b = new THREE.Mesh(bag.geo(new THREE.IcosahedronGeometry(r * s, 1)), bloomMat)
      b.position.set(x + dx * s, dy * s, z + dz * s)
      b.castShadow = true
      ctx.local.add(b)
    }
  }
  // benches
  const wood = stdMat(bag, 0x5a4033, 0.7)
  for (const [x, z, ry] of [[-0.8, 2.4, 0.2], [3.6, 1.6, -0.6]]) {
    const g = new THREE.Group()
    g.position.set(x, 0, z)
    g.rotation.y = ry
    ctx.local.add(g)
    box(ctx, 1.8, 0.12, 0.55, wood, 0, 0.5, 0, g)
    box(ctx, 1.8, 0.5, 0.1, wood, 0, 0.85, -0.25, g)
    box(ctx, 0.1, 0.5, 0.5, stdMat(bag, 0x25284a, 0.5, 0.6), -0.8, 0.25, 0, g)
    box(ctx, 0.1, 0.5, 0.5, stdMat(bag, 0x25284a, 0.5, 0.6), 0.8, 0.25, 0, g)
  }
  // flowers
  const flowerRnd = mulberry32(9)
  const flowers = new THREE.InstancedMesh(bag.geo(new THREE.SphereGeometry(0.1, 6, 5)), bag.mat(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x333333, roughness: 0.7 })), 70)
  const fm = new THREE.Matrix4()
  const fcols = [0xff9fd6, 0xfff1a8, 0x9fe8ff, 0xc4a1ff].map((c) => new THREE.Color(c))
  for (let i = 0; i < 70; i++) {
    const a = flowerRnd() * Math.PI * 2
    const r = 2.8 + flowerRnd() * 2.4
    fm.makeTranslation(Math.cos(a) * r, 0.12, Math.sin(a) * r)
    flowers.setMatrixAt(i, fm)
    flowers.setColorAt(i, fcols[i % fcols.length])
  }
  ctx.local.add(flowers)
  // lantern posts
  const lampMat = emissiveMat(bag, 0xfff0b0, 2.6)
  const lamps: THREE.Mesh[] = []
  for (const [x, z] of [[-2, 3.8], [4.4, 3.0], [-4.6, -0.6]]) {
    cyl(ctx, 0.05, 0.07, 1.4, stdMat(bag, 0x1a1e3a, 0.5, 0.5), x, 0.7, z, 6)
    const l = new THREE.Mesh(bag.geo(new THREE.SphereGeometry(0.22, 12, 10)), lampMat)
    l.position.set(x, 1.5, z)
    ctx.local.add(l)
    lamps.push(l)
    glowSprite(ctx, 0xffe29a, 2.4, x, 1.5, z, 0.55)
  }
  const board = makeStationBoard(bag, def.accent, 'Waiting garden')
  board.sprite.position.set(0, 5.4, 1.4)
  ctx.local.add(board.sprite)
  addLabelAndLight(ctx, 7.4, 3.4, 18)
  ctx.tickers.push((t) => {
    pondMat.emissiveIntensity = 0.5 + 0.12 * Math.sin(t * 1.3)
    lampMat.emissiveIntensity = 2.4 + 0.3 * Math.sin(t * 3.1)
  })
  return finish(ctx, board)
}

export function buildZones(bag: ResourceBag, podRows: number): ZoneView[] {
  return [
    buildStudio(bag, podRows),
    buildReview(bag),
    buildLab(bag),
    buildGit(bag),
    buildDeploy(bag),
    buildMeeting(bag),
    buildGarden(bag)
  ]
}
