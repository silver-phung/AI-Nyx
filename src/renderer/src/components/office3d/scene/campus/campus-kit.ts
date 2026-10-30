import * as THREE from 'three'

/** Tracks GPU resources created by campus builders so one call releases them all. */
export class ResourceBag {
  private readonly geometries = new Set<THREE.BufferGeometry>()
  private readonly materials = new Set<THREE.Material>()
  private readonly textures = new Set<THREE.Texture>()

  geo<T extends THREE.BufferGeometry>(g: T): T {
    this.geometries.add(g)
    return g
  }

  mat<T extends THREE.Material>(m: T): T {
    this.materials.add(m)
    return m
  }

  tex<T extends THREE.Texture>(t: T): T {
    this.textures.add(t)
    return t
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose()
    for (const m of this.materials) m.dispose()
    for (const t of this.textures) t.dispose()
    this.geometries.clear()
    this.materials.clear()
    this.textures.clear()
  }
}

export function hex(c: number): string {
  return `#${c.toString(16).padStart(6, '0')}`
}

export function drawCanvas(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (ctx) draw(ctx, width, height)
  return canvas
}

export function radialGlowTexture(bag: ResourceBag, inner = 'rgba(255,255,255,1)'): THREE.CanvasTexture {
  const c = drawCanvas(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2)
    g.addColorStop(0, inner)
    g.addColorStop(0.25, 'rgba(255,255,255,0.45)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  })
  return bag.tex(new THREE.CanvasTexture(c))
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

const FONT = '"Segoe UI", "Helvetica Neue", Arial, sans-serif'

/** Billboard zone label drawn on a canvas: no DOM, no network font. */
export function makeZoneLabel(
  bag: ResourceBag,
  title: string,
  subtitle: string,
  accent: number
): THREE.Sprite {
  const canvas = drawCanvas(640, 200, (ctx, w, h) => {
    roundRect(ctx, 8, 24, w - 16, h - 48, 40)
    ctx.fillStyle = 'rgba(8,11,32,0.78)'
    ctx.fill()
    ctx.lineWidth = 4
    ctx.strokeStyle = hex(accent)
    ctx.stroke()
    ctx.fillStyle = hex(accent)
    ctx.beginPath()
    ctx.arc(64, h / 2, 16, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#f1f5ff'
    ctx.font = `700 52px ${FONT}`
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(title, 100, h / 2 + 2)
    ctx.fillStyle = 'rgba(190,200,255,0.8)'
    ctx.font = `400 32px ${FONT}`
    ctx.fillText(subtitle, 102, h / 2 + 44)
  })
  const tex = bag.tex(new THREE.CanvasTexture(canvas))
  tex.colorSpace = THREE.SRGBColorSpace
  const mat = bag.mat(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false })
  )
  const sprite = new THREE.Sprite(mat)
  sprite.scale.set(8.6, 2.7, 1)
  sprite.renderOrder = 10
  return sprite
}

export type StationStatus = 'idle' | 'working' | 'succeeded' | 'failed'

export interface StationBoard {
  readonly sprite: THREE.Sprite
  set(status: StationStatus, headline: string, detail: string | undefined, preview: boolean): void
}

/** Result board shown at a station. Draws the *actual* status text it is given, nothing else. */
export function makeStationBoard(bag: ResourceBag, accent: number, title: string): StationBoard {
  const canvas = drawCanvas(512, 256, () => undefined)
  const tex = bag.tex(new THREE.CanvasTexture(canvas))
  tex.colorSpace = THREE.SRGBColorSpace
  const mat = bag.mat(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false })
  )
  const sprite = new THREE.Sprite(mat)
  sprite.scale.set(3.0, 1.5, 1)
  sprite.renderOrder = 11

  function paint(status: StationStatus, headline: string, detail: string | undefined, preview: boolean): void {
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const w = canvas.width
    const h = canvas.height
    sprite.visible = status !== 'idle'
    ctx.clearRect(0, 0, w, h)
    const color =
      status === 'succeeded' ? '#34d399' : status === 'failed' ? '#f87171' : status === 'working' ? '#fbbf24' : hex(accent)
    roundRect(ctx, 6, 6, w - 12, h - 12, 28)
    ctx.fillStyle = 'rgba(6,9,28,0.86)'
    ctx.fill()
    ctx.lineWidth = 6
    ctx.strokeStyle = color
    ctx.stroke()
    ctx.fillStyle = 'rgba(190,200,255,0.75)'
    ctx.font = `600 28px ${FONT}`
    ctx.fillText(title.toUpperCase(), 32, 52)
    ctx.fillStyle = color
    const mark = status === 'succeeded' ? '✓ ' : status === 'failed' ? '✗ ' : ''
    let size = 64
    ctx.font = `800 ${size}px ${FONT}`
    while (ctx.measureText(mark + headline).width > w - 64 && size > 28) {
      size -= 4
      ctx.font = `800 ${size}px ${FONT}`
    }
    ctx.fillText(mark + headline, 32, 130)
    if (detail) {
      ctx.fillStyle = '#e2e8ff'
      ctx.font = `400 30px ${FONT}`
      ctx.fillText(detail.slice(0, 30), 32, 182)
    }
    if (preview) {
      ctx.fillStyle = '#facc15'
      ctx.font = `700 24px ${FONT}`
      ctx.fillText('DEV PREVIEW · SYNTHETIC', 32, 228)
    }
    tex.needsUpdate = true
  }

  paint('idle', 'Idle', 'Waiting for activity', false)
  return {
    sprite,
    set: paint
  }
}

export function emissiveMat(
  bag: ResourceBag,
  color: number,
  intensity = 1.6,
  base = 0x0b1030
): THREE.MeshStandardMaterial {
  return bag.mat(
    new THREE.MeshStandardMaterial({
      color: base,
      emissive: color,
      emissiveIntensity: intensity,
      roughness: 0.4,
      metalness: 0.1
    })
  )
}

export function stdMat(
  bag: ResourceBag,
  color: number,
  roughness = 0.7,
  metalness = 0.05
): THREE.MeshStandardMaterial {
  return bag.mat(new THREE.MeshStandardMaterial({ color, roughness, metalness }))
}

/** Deterministic PRNG so scatter (trees, stars) is stable between renders. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shortestAngle(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}
