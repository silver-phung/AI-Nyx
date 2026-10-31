// Moonlight Campus layout: pure data + path math. No three.js, no React, no Orca imports.
// Units are metres, y is up, +x is east, +z is south (towards the default camera).

export type CampusPoint = {
  readonly x: number
  readonly z: number
}

export type CampusZoneId =
  | 'coding-studio'
  | 'review-pavilion'
  | 'testing-lab'
  | 'git-station'
  | 'deployment-center'
  | 'meeting-area'
  | 'waiting-garden'

export type CampusZoneDef = {
  readonly id: CampusZoneId
  readonly label: string
  readonly subtitle: string
  /** 0xRRGGBB accent used for signage, rim lights and path markers. */
  readonly accent: number
  readonly center: CampusPoint
  /** Where the zone footprint meets its walkway. */
  readonly gate: CampusPoint
  /** Where an agent stands while using the zone. */
  readonly spot: CampusPoint
  /** Point on the central plaza edge where this zone's spoke starts. */
  readonly hubEdge: CampusPoint
  /** Angle (radians) of the spoke seen from the hub. */
  readonly spokeAngle: number
  /** Yaw an agent should have at `spot` to face the zone's main prop. */
  readonly spotYaw: number
}

export const CAMPUS_HUB: CampusPoint = { x: 46, z: 10 }
export const HUB_RADIUS = 5.5
export const RING_RADIUS = 17
export const STUDIO_X0 = -2
export const STUDIO_X1 = 28
export const STUDIO_GATE: CampusPoint = { x: 28, z: 10 }
export const POD_GRID_STEP = 1.8

function polar(r: number, deg: number): CampusPoint {
  const a = (deg * Math.PI) / 180
  return { x: CAMPUS_HUB.x + r * Math.cos(a), z: CAMPUS_HUB.z + r * Math.sin(a) }
}

function ringZone(
  id: CampusZoneId,
  label: string,
  subtitle: string,
  accent: number,
  deg: number,
  spotDistance: number
): CampusZoneDef {
  const center = polar(RING_RADIUS, deg)
  const spot = polar(RING_RADIUS - spotDistance, deg)
  return {
    id,
    label,
    subtitle,
    accent,
    center,
    gate: polar(RING_RADIUS - 6.2, deg),
    spot,
    hubEdge: polar(HUB_RADIUS, deg),
    spokeAngle: (deg * Math.PI) / 180,
    spotYaw: Math.atan2(center.x - spot.x, center.z - spot.z)
  }
}

export const CAMPUS_ZONES: Readonly<Record<Exclude<CampusZoneId, 'coding-studio'>, CampusZoneDef>> =
  {
    'waiting-garden': ringZone(
      'waiting-garden',
      'Waiting Garden',
      'Idle agents',
      0x5eead4,
      -150,
      2.6
    ),
    'review-pavilion': ringZone(
      'review-pavilion',
      'Review Pavilion',
      'Code review',
      0xfbbf24,
      -90,
      1.9
    ),
    'testing-lab': ringZone('testing-lab', 'Testing Lab', 'Automated tests', 0x2dd4bf, -30, 2.7),
    'git-station': ringZone('git-station', 'Git Station', 'Commits & pushes', 0xfb923c, 30, 2.3),
    'deployment-center': ringZone(
      'deployment-center',
      'Deployment Center',
      'Releases',
      0xa78bfa,
      90,
      2.6
    ),
    'meeting-area': ringZone('meeting-area', 'Meeting Area', 'Collaboration', 0xf472b6, 150, 1.9)
  }

export const STUDIO_ZONE: CampusZoneDef = {
  id: 'coding-studio',
  label: 'Coding Studio',
  subtitle: 'Agent workstations',
  accent: 0x60a5fa,
  center: { x: 13, z: 10 },
  gate: STUDIO_GATE,
  spot: { x: 24, z: 10 },
  hubEdge: { x: CAMPUS_HUB.x - HUB_RADIUS, z: CAMPUS_HUB.z },
  spokeAngle: Math.PI,
  spotYaw: -Math.PI / 2
}

export const ALL_ZONE_DEFS: readonly CampusZoneDef[] = [STUDIO_ZONE, ...Object.values(CAMPUS_ZONES)]

export function getZoneDef(id: CampusZoneId): CampusZoneDef {
  return id === 'coding-studio' ? STUDIO_ZONE : CAMPUS_ZONES[id]
}

/** Studio platform depth grows with the number of pod rows (matches getZoneCenterCoordinates). */
export function studioDepth(podRows: number): number {
  return Math.max(21, Math.max(1, podRows) * 9.5 + 3)
}

/** Overall campus bounds used for ground, fog and camera framing. */
export function campusBounds(podRows: number): { x0: number; x1: number; z0: number; z1: number } {
  const z1 = Math.max(CAMPUS_HUB.z + RING_RADIUS + 9, studioDepth(podRows) + 4)
  return {
    x0: STUDIO_X0 - 6,
    x1: CAMPUS_HUB.x + RING_RADIUS + 9,
    z0: CAMPUS_HUB.z - RING_RADIUS - 9,
    z1
  }
}

/** Standing point for an agent leaving a desk, in the pod's central aisle. */
export function deskStandPoint(podCenter: CampusPoint, gridX: number, gridY: number): CampusPoint {
  const dirX = gridX < 0 ? 1 : -1 // chairs face the aisle
  return {
    x: podCenter.x + gridX * POD_GRID_STEP + dirX * 1.5,
    z: podCenter.z + gridY * POD_GRID_STEP
  }
}

/** Seated body position (chair) for hiding/showing parity checks. */
export function deskSeatPoint(podCenter: CampusPoint, gridX: number, gridY: number): CampusPoint {
  const dirX = gridX < 0 ? 1 : -1
  return {
    x: podCenter.x + gridX * POD_GRID_STEP + dirX * 0.55,
    z: podCenter.z + gridY * POD_GRID_STEP
  }
}

export function podAisleZ(podCenter: CampusPoint, banks: number): number {
  return podCenter.z + Math.max(1, banks) * 2 * POD_GRID_STEP + 0.8
}

export type CampusPath = {
  readonly points: readonly CampusPoint[]
  readonly cumulative: readonly number[]
  readonly length: number
}

export function buildPath(points: readonly CampusPoint[]): CampusPath {
  const cleaned: CampusPoint[] = []
  for (const p of points) {
    const last = cleaned.at(-1)
    if (!last || Math.hypot(p.x - last.x, p.z - last.z) > 1e-4) {
      cleaned.push(p)
    }
  }
  const cumulative: number[] = [0]
  for (let i = 1; i < cleaned.length; i++) {
    cumulative.push(
      cumulative[i - 1] +
        Math.hypot(cleaned[i].x - cleaned[i - 1].x, cleaned[i].z - cleaned[i - 1].z)
    )
  }
  return { points: cleaned, cumulative, length: cumulative.at(-1) ?? 0 }
}

export function reversePath(path: CampusPath): CampusPath {
  return buildPath(path.points.toReversed())
}

export type PathSample = {
  readonly x: number
  readonly z: number
  /** Yaw (radians) of travel direction, three.js convention: atan2(dx, dz). */
  readonly yaw: number
}

export function samplePath(path: CampusPath, distance: number): PathSample {
  const pts = path.points
  if (pts.length === 0) {
    return { x: 0, z: 0, yaw: 0 }
  }
  if (pts.length === 1) {
    return { x: pts[0].x, z: pts[0].z, yaw: 0 }
  }
  const d = Math.min(Math.max(distance, 0), path.length)
  let i = 1
  while (i < pts.length - 1 && path.cumulative[i] < d) {
    i++
  }
  const a = pts[i - 1]
  const b = pts[i]
  const segLen = path.cumulative[i] - path.cumulative[i - 1] || 1
  const t = (d - path.cumulative[i - 1]) / segLen
  return {
    x: a.x + (b.x - a.x) * t,
    z: a.z + (b.z - a.z) * t,
    yaw: Math.atan2(b.x - a.x, b.z - a.z)
  }
}

/**
 * Lateral offset so several agents can use one station without stacking:
 * slot 0 centre, then alternating right/left in 1.1 m steps along the spoke's perpendicular.
 */
export function slotOffset(zone: CampusZoneDef, slot: number): CampusPoint {
  if (zone.id === 'coding-studio' || slot <= 0) {
    return { x: 0, z: 0 }
  }
  const step = Math.ceil(slot / 2) * 1.1 * (slot % 2 === 1 ? 1 : -1)
  return { x: -Math.sin(zone.spokeAngle) * step, z: Math.cos(zone.spokeAngle) * step }
}

/** Same path with its final point moved by `offset` (used for station slots). */
export function offsetPathEnd(path: CampusPath, offset: CampusPoint): CampusPath {
  if (offset.x === 0 && offset.z === 0 && path.points.length > 0) {
    return path
  }
  const pts = [...path.points]
  const last = pts.at(-1)
  if (last) {
    pts[pts.length - 1] = { x: last.x + offset.x, z: last.z + offset.z }
  }
  return buildPath(pts)
}

/** Shifts the walk between the endpoints so agents sharing a route do not overlap; endpoints stay put. */
export function offsetPathLane(path: CampusPath, lane: CampusPoint): CampusPath {
  if ((lane.x === 0 && lane.z === 0) || path.points.length < 3) {
    return path
  }
  const last = path.points.length - 1
  return buildPath(
    path.points.map((p, i) => (i === 0 || i === last ? p : { x: p.x + lane.x, z: p.z + lane.z }))
  )
}

/** Stable per-agent lane offset in [-0.45, 0.45] on both axes. */
export function laneForEmployee(employeeId: string): CampusPoint {
  let h = 2166136261
  for (let i = 0; i < employeeId.length; i++) {
    h = Math.imul(h ^ employeeId.charCodeAt(i), 16777619)
  }
  const ax = ((h >>> 0) % 7) - 3
  const az = ((h >>> 8) % 7) - 3
  return { x: ax * 0.15, z: az * 0.15 }
}

/** Route from a pod standing point to a campus zone's working spot. */
export function routeDeskToZone(
  stand: CampusPoint,
  aisleZ: number,
  target: CampusZoneDef
): CampusPath {
  const pts: CampusPoint[] = [
    stand,
    { x: stand.x, z: aisleZ },
    { x: STUDIO_GATE.x - 1.2, z: aisleZ },
    { x: STUDIO_GATE.x, z: STUDIO_GATE.z },
    { x: STUDIO_ZONE.hubEdge.x, z: STUDIO_ZONE.hubEdge.z }
  ]
  if (target.id !== 'coding-studio') {
    pts.push(target.hubEdge, target.gate, target.spot)
  }
  return buildPath(pts)
}

export function routeZoneToZone(from: CampusZoneDef, to: CampusZoneDef): CampusPath {
  if (from.id === to.id) {
    return buildPath([from.spot])
  }
  const pts: CampusPoint[] = [from.spot, from.gate, from.hubEdge]
  pts.push(to.hubEdge, to.gate, to.spot)
  return buildPath(pts)
}
