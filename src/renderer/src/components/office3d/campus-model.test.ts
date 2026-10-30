import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createActor, type ActorSource } from './scene/campus/build-actor'
import type { Campus } from './scene/campus/build-campus'
import type { ZoneView } from './scene/campus/build-zones'
import { CampusDirector, MAX_ACTIVE_TRAVELERS } from './scene/campus/campus-director'
import {
  createCampusEventBus,
  createCampusPresenceStore,
  sanitizeCampusEvent,
  zoneForActivity,
  type CampusActivityEvent
} from './scene/campus/campus-events'
import {
  ALL_ZONE_DEFS,
  CAMPUS_HUB,
  CAMPUS_ZONES,
  RING_RADIUS,
  buildPath,
  deskSeatPoint,
  deskStandPoint,
  podAisleZ,
  offsetPathEnd,
  reversePath,
  routeDeskToZone,
  routeZoneToZone,
  samplePath,
  slotOffset,
  type CampusZoneDef
} from './scene/campus/campus-layout'
import { startDevPreview } from './scene/campus/campus-preview'
import { MAX_WAIT_FOR_RESULT_SECONDS, Traveler } from './scene/campus/traveler'
import type { Actor } from './scene/campus/build-actor'

// Pure visualisation logic only: no WebGL, no Orca stores.
if (typeof document === 'undefined') {
  ;(globalThis as unknown as { document: unknown }).document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => null })
  }
}

function ev(partial: Partial<CampusActivityEvent> & Pick<CampusActivityEvent, 'activityId' | 'employeeId'>): CampusActivityEvent {
  return { kind: 'git-push', status: 'started', source: 'orca', occurredAt: 0, ...partial }
}

function stubActor(): Actor & { log: string[] } {
  const log: string[] = []
  return {
    log,
    root: new THREE.Group(),
    kind: 'human',
    setClip: (r) => void log.push(`clip:${r}`),
    setCarrying: (on) => void log.push(`carry:${on}`),
    setPackageScale: () => undefined,
    setStatusColor: () => undefined,
    update: () => undefined,
    dispose: () => void log.push('dispose')
  }
}

function stubZone(id: ZoneView['id']): ZoneView & { statuses: string[]; packages: number } {
  const statuses: string[] = []
  let packages = 0
  return {
    id,
    group: new THREE.Group(),
    labels: [],
    packageTarget: new THREE.Vector3(),
    update: () => undefined,
    setStatus: (s, headline, detail, preview) => void statuses.push(`${s}|${headline}|${detail ?? ''}|${preview ? 'preview' : 'real'}`),
    receivePackage: () => {
      packages++
    },
    get statuses() {
      return statuses
    },
    get packages() {
      return packages
    }
  }
}

describe('campus layout', () => {
  it('places the six ring zones at the ring radius from the hub, all distinct', () => {
    const ring = Object.values(CAMPUS_ZONES)
    expect(ring).toHaveLength(6)
    for (const z of ring) {
      expect(Math.hypot(z.center.x - CAMPUS_HUB.x, z.center.z - CAMPUS_HUB.z)).toBeCloseTo(RING_RADIUS, 5)
    }
    expect(new Set(ALL_ZONE_DEFS.map((z) => z.id)).size).toBe(7)
  })

  it('routes a desk occupant through the aisle and gate to the zone working spot', () => {
    const pod = { x: 5.5, z: 5.5 }
    const stand = deskStandPoint(pod, -1, 0)
    const path = routeDeskToZone(stand, podAisleZ(pod, 1), CAMPUS_ZONES['git-station'])
    const last = path.points[path.points.length - 1]
    expect(path.points[0]).toEqual(stand)
    expect(last).toEqual(CAMPUS_ZONES['git-station'].spot)
    expect(path.length).toBeGreaterThan(40)
    const seat = deskSeatPoint(pod, -1, 0)
    expect(Math.hypot(seat.x - stand.x, seat.z - stand.z)).toBeCloseTo(0.95, 5)
  })

  it('samples and reverses paths consistently', () => {
    const p = buildPath([{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }])
    expect(p.length).toBe(20)
    expect(samplePath(p, 5).x).toBe(5)
    expect(samplePath(p, 15)).toEqual({ x: 10, z: 5, yaw: 0 })
    expect(reversePath(p).points[0]).toEqual({ x: 10, z: 10 })
    expect(routeZoneToZone(CAMPUS_ZONES['testing-lab'], CAMPUS_ZONES['testing-lab']).length).toBe(0)
  })
})

describe('station slots', () => {
  it('offsets later agents sideways so they never stack at one station', () => {
    const zone = CAMPUS_ZONES['git-station']
    const pts = [0, 1, 2, 3].map((slot) => {
      const o = slotOffset(zone, slot)
      return { x: zone.spot.x + o.x, z: zone.spot.z + o.z }
    })
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        expect(Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z)).toBeGreaterThan(1.0)
      }
    }
    const base = buildPath([{ x: 0, z: 0 }, { x: 4, z: 0 }])
    expect(offsetPathEnd(base, { x: 0, z: 1 }).points[1]).toEqual({ x: 4, z: 1 })
    expect(offsetPathEnd(base, { x: 0, z: 0 })).toBe(base)
  })

  it('director gives two agents at one station different spots', () => {
    const zones = new Map<string, ZoneView>()
    zones.set('git-station', stubZone('git-station'))
    const parent = new THREE.Group()
    const scene = new THREE.Group()
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.7, 0.3), new THREE.MeshBasicMaterial()))
    const source: ActorSource = { scene, animations: ['idle', 'walk', 'sit'].map((n) => new THREE.AnimationClip(n, 1, [])) }
    const director = new CampusDirector({
      campus: { zones } as unknown as Campus,
      parent,
      getSource: () => source,
      setAway: () => undefined,
      resolveEmployee: () => {
        const pod = { x: 5.5, z: 5.5 }
        const stand = deskStandPoint(pod, -1, 0)
        return { seat: deskSeatPoint(pod, -1, 0), seatYaw: 0, modelKind: 'human', route: (t) => routeDeskToZone(stand, podAisleZ(pod, 1), t) }
      }
    })
    director.handle(ev({ activityId: 'a', employeeId: 'e1' }))
    director.handle(ev({ activityId: 'b', employeeId: 'e2' }))
    for (let i = 0; i < 30 * 40; i++) director.update(1 / 30, i / 30)
    const [a, b] = parent.children
    expect(Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z)).toBeGreaterThan(1.0)
    director.dispose()
  })
})

describe('campus events', () => {
  it('delivers events to subscribers and stops after unsubscribe', () => {
    const bus = createCampusEventBus()
    const got: string[] = []
    const off = bus.subscribe((e) => got.push(e.activityId))
    bus.emit(ev({ activityId: 'a', employeeId: 'e' }))
    off()
    bus.emit(ev({ activityId: 'b', employeeId: 'e' }))
    expect(got).toEqual(['a'])
  })

  it('rejects events without ids and sanitises detail text', () => {
    expect(sanitizeCampusEvent(ev({ activityId: '', employeeId: 'e' }))).toBeNull()
    const clean = sanitizeCampusEvent(ev({ activityId: 'a', employeeId: 'e', detail: 'x\u0007y'.padEnd(80, 'z') }))
    expect(clean?.detail?.length).toBe(48)
    expect(clean?.detail?.includes('\u0007')).toBe(false)
  })

  it('maps activities to the right zone', () => {
    expect(zoneForActivity('git-push')).toBe('git-station')
    expect(zoneForActivity('test-run')).toBe('testing-lab')
    expect(zoneForActivity('code-review')).toBe('review-pavilion')
    expect(zoneForActivity('deploy')).toBe('deployment-center')
    expect(zoneForActivity('meeting')).toBe('meeting-area')
    expect(zoneForActivity('rest')).toBe('waiting-garden')
  })

  it('presence store notifies only on real changes', () => {
    const store = createCampusPresenceStore()
    let calls = 0
    store.subscribe(() => calls++)
    store.setAway('a', true)
    store.setAway('a', true)
    store.setAway('a', false)
    expect(calls).toBe(2)
    expect(store.isAway('a')).toBe(false)
  })
})

describe('Traveler', () => {
  function makeTraveler(kind: CampusActivityEvent['kind'] = 'git-push') {
    const actor = stubActor()
    const zone = stubZone('git-station')
    const away: boolean[] = []
    const def: CampusZoneDef = CAMPUS_ZONES['git-station']
    const pod = { x: 5.5, z: 5.5 }
    const stand = deskStandPoint(pod, -1, 0)
    const t = new Traveler({
      activityId: 'a1',
      employeeId: 'emp',
      kind,
      source: 'orca',
      actor,
      zone,
      zoneDef: def,
      outPath: routeDeskToZone(stand, podAisleZ(pod, 1), def),
      seat: deskSeatPoint(pod, -1, 0),
      seatYaw: Math.PI / 2,
      detail: 'main',
      onAway: (a) => away.push(a)
    })
    return { t, actor, zone, away }
  }

  function run(t: Traveler, seconds: number): void {
    for (let i = 0; i < seconds * 30; i++) t.update(1 / 30, i / 30)
  }

  it('walks to the station, shows the real result, and returns to the seat', () => {
    const { t, zone, away, actor } = makeTraveler()
    expect(away).toEqual([true])
    run(t, 4)
    expect(t.phase).toBe('walk-out')
    run(t, 30)
    expect(['work', 'arrive']).toContain(t.phase)
    t.resolve('succeeded', 'abc123')
    run(t, 6)
    expect(zone.statuses.some((s) => s.startsWith('succeeded|Pushed|abc123|real'))).toBe(true)
    expect(zone.packages).toBe(1)
    run(t, 60)
    expect(t.finished).toBe(true)
    expect(away).toEqual([true, false])
    expect(actor.log.includes('carry:true')).toBe(true)
    expect(zone.statuses[zone.statuses.length - 1].startsWith('idle|Idle')).toBe(true)
  })

  it('shows failure honestly', () => {
    const { t, zone } = makeTraveler()
    t.resolve('failed', 'rejected')
    run(t, 45)
    expect(zone.statuses.some((s) => s.startsWith('failed|Push failed|rejected'))).toBe(true)
  })

  it('never invents a result: without one it reports "No result" after the wait limit', () => {
    const { t, zone } = makeTraveler()
    run(t, 40 + MAX_WAIT_FOR_RESULT_SECONDS)
    expect(zone.statuses.some((s) => s.startsWith('succeeded'))).toBe(false)
    expect(zone.statuses.some((s) => s.startsWith('idle|No result'))).toBe(true)
  })

  it('dispose restores the seated avatar', () => {
    const { t, away } = makeTraveler()
    run(t, 2)
    t.dispose()
    expect(away).toEqual([true, false])
  })
})

describe('CampusDirector', () => {
  function fakeSource(): ActorSource {
    const scene = new THREE.Group()
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.7, 0.3), new THREE.MeshBasicMaterial())
    body.position.y = 0.85
    scene.add(body)
    const names = ['idle', 'walk', 'sit', 'interact-right', 'interact-left', 'emote-yes', 'emote-no', 'pick-up']
    return { scene, animations: names.map((n) => new THREE.AnimationClip(n, 1, [])) }
  }

  function makeDirector(known: string[]) {
    const zones = new Map<string, ZoneView>()
    for (const id of ['git-station', 'testing-lab', 'review-pavilion', 'deployment-center', 'meeting-area', 'waiting-garden'] as const) {
      zones.set(id, stubZone(id))
    }
    const parent = new THREE.Group()
    const away: Array<[string, boolean]> = []
    const source = fakeSource()
    const director = new CampusDirector({
      campus: { zones } as unknown as Campus,
      parent,
      getSource: () => source,
      setAway: (id, a) => away.push([id, a]),
      resolveEmployee: (e) => {
        if (!known.includes(e.employeeId)) return null
        const pod = { x: 5.5, z: 5.5 }
        const stand = deskStandPoint(pod, -1, 0)
        return {
          seat: deskSeatPoint(pod, -1, 0),
          seatYaw: 0,
          seatLift: 0.28,
          modelKind: 'human',
          route: (t) => routeDeskToZone(stand, podAisleZ(pod, 1), t)
        }
      }
    })
    return { director, parent, away, zones }
  }

  it('ignores events for employees that are not in the world', () => {
    const { director, parent } = makeDirector(['emp-1'])
    director.handle(ev({ activityId: 'x', employeeId: 'ghost' }))
    expect(director.activeCount).toBe(0)
    expect(parent.children).toHaveLength(0)
  })

  it('starts a trip, hides the seated avatar, and cleans up when finished', () => {
    const { director, parent, away } = makeDirector(['emp-1'])
    director.handle(ev({ activityId: 'a', employeeId: 'emp-1' }))
    expect(director.activeCount).toBe(1)
    expect(parent.children).toHaveLength(1)
    director.handle(ev({ activityId: 'a', employeeId: 'emp-1', status: 'succeeded' }))
    for (let i = 0; i < 30 * 120; i++) director.update(1 / 30, i / 30)
    expect(director.activeCount).toBe(0)
    expect(parent.children).toHaveLength(0)
    expect(away.map((a) => a[1])).toEqual([true, false])
  })

  it('serialises overlapping activities for the same employee', () => {
    const { director } = makeDirector(['emp-1'])
    director.handle(ev({ activityId: 'a', employeeId: 'emp-1' }))
    director.handle(ev({ activityId: 'b', employeeId: 'emp-1', kind: 'test-run' }))
    expect(director.activeCount).toBe(1)
    director.handle(ev({ activityId: 'a', employeeId: 'emp-1', status: 'succeeded' }))
    for (let i = 0; i < 30 * 120; i++) director.update(1 / 30, i / 30)
    expect(director.activeCount).toBe(1) // 'b' started after 'a' finished
  })

  it('caps simultaneous travelers', () => {
    const ids = Array.from({ length: MAX_ACTIVE_TRAVELERS + 6 }, (_, i) => `emp-${i}`)
    const { director } = makeDirector(ids)
    ids.forEach((id, i) => director.handle(ev({ activityId: `a${i}`, employeeId: id })))
    expect(director.activeCount).toBe(MAX_ACTIVE_TRAVELERS)
  })

  it('dispose restores all seated avatars', () => {
    const { director, away } = makeDirector(['emp-1', 'emp-2'])
    director.handle(ev({ activityId: 'a', employeeId: 'emp-1' }))
    director.handle(ev({ activityId: 'b', employeeId: 'emp-2' }))
    director.dispose()
    expect(away.filter((a) => a[1]).length).toBe(2)
    expect(away.filter((a) => !a[1]).length).toBe(2)
    expect(director.activeCount).toBe(0)
  })

  it('creates actors with working clips from a plain scene', () => {
    const actor = createActor({ source: fakeSource(), kind: 'human' })
    actor.setClip('walk')
    actor.update(0.1, 0.1)
    actor.dispose()
    expect(actor.root.children).toHaveLength(0)
  })
})

describe('dev preview generator', () => {
  it('emits only clearly synthetic events and stops cleanly', () => {
    const bus = createCampusEventBus()
    const events: CampusActivityEvent[] = []
    bus.subscribe((e) => events.push(e))
    const timers: Array<{ fn: () => void; due: number; alive: boolean }> = []
    let clock = 0
    const stop = startDevPreview(bus, {
      setTimer: (fn, ms) => {
        const t = { fn, due: clock + ms, alive: true }
        timers.push(t)
        return t
      },
      clearTimer: (h) => {
        ;(h as { alive: boolean }).alive = false
      }
    })
    for (let guard = 0; guard < 80; guard++) {
      const next = timers.filter((t) => t.alive).sort((a, b) => a.due - b.due)[0]
      if (!next || next.due > 120000) break
      clock = next.due
      next.alive = false
      next.fn()
    }
    expect(events.length).toBeGreaterThan(4)
    expect(events.every((e) => e.source === 'dev-preview')).toBe(true)
    expect(events.every((e) => e.employeeId.startsWith('preview-agent-'))).toBe(true)
    expect(events.every((e) => e.activityId.startsWith('preview-'))).toBe(true)
    const started = events.filter((e) => e.status === 'started').length
    stop()
    const before = events.length
    for (const t of timers) if (t.alive) t.fn()
    expect(events.length).toBe(before)
    expect(started).toBeGreaterThan(1)
  })
})
