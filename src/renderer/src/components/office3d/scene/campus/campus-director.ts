import type * as THREE from 'three'
import { createActor, type Actor, type ActorModelKind, type ActorSource } from './build-actor'
import type { Campus } from './build-campus'
import { zoneForActivity, type CampusActivityEvent } from './campus-events'
import {
  getZoneDef,
  offsetPathEnd,
  slotOffset,
  type CampusPath,
  type CampusZoneId,
  type CampusPoint,
  type CampusZoneDef
} from './campus-layout'
import { Traveler } from './traveler'

/** Where an employee (or preview agent) starts, and how it walks to a zone. */
export type DirectorEmployeeInfo = {
  readonly seat: CampusPoint
  readonly seatYaw: number
  readonly seatLift?: number
  readonly modelKind: ActorModelKind
  readonly tint?: number
  readonly route: (target: CampusZoneDef) => CampusPath
}

export type DirectorDeps = {
  readonly campus: Campus
  /** Parent that receives the actors' root objects. */
  readonly parent: THREE.Object3D
  /** Loaded models; return null while a model is still loading (events are skipped, not faked). */
  readonly getSource: (kind: ActorModelKind, employeeId: string) => ActorSource | null
  /**
   * Resolve the visual starting point for an event's employee. Return null when the employee is
   * unknown (e.g. no longer in the world); the event is then ignored.
   */
  readonly resolveEmployee: (event: CampusActivityEvent) => DirectorEmployeeInfo | null
  readonly setAway: (employeeId: string, away: boolean) => void
  readonly shadows?: boolean
}

export const MAX_ACTIVE_TRAVELERS = 16
const MAX_QUEUED_PER_EMPLOYEE = 4
export const MAX_PENDING_RESULTS = 64
export const MAX_OVERFLOW = 64

/**
 * Turns campus activity events into walking trips. Pure visualisation: it only moves meshes and
 * updates station boards. It has no reference to Orca stores, PTYs or Git.
 */
export class CampusDirector {
  private readonly deps: DirectorDeps
  private readonly active = new Map<string, Traveler>() // activityId -> traveler
  private readonly pendingResults = new Map<string, CampusActivityEvent>()
  private readonly queues = new Map<string, CampusActivityEvent[]>() // employeeId -> waiting starts
  private readonly busyEmployees = new Set<string>()
  private readonly overflow: CampusActivityEvent[] = [] // starts waiting for a free traveler
  private readonly slots = new Map<CampusZoneId, Set<number>>()
  private readonly slotOf = new Map<string, { zoneId: CampusZoneId; slot: number }>()
  private disposed = false

  constructor(deps: DirectorDeps) {
    this.deps = deps
  }

  get activeCount(): number {
    return this.active.size
  }

  handle(event: CampusActivityEvent): void {
    if (this.disposed) {
      return
    }
    if (event.status === 'started') {
      if (this.active.has(event.activityId) || this.isQueued(event.activityId)) {
        return
      }
      this.start(event)
      return
    }
    const traveler = this.active.get(event.activityId)
    if (traveler) {
      traveler.resolve(event.status, event.detail)
    } else if (event.status === 'ended' && this.dropWaiting(event.activityId)) {
      // A trip that ended before it could start is stale; never replay it later.
    } else {
      this.rememberEarlyResult(event)
    }
  }

  /** Removes a not-yet-started trip from the per-employee queues or the overflow list. */
  private dropWaiting(activityId: string): boolean {
    for (const [employeeId, q] of this.queues) {
      const i = q.findIndex((e) => e.activityId === activityId)
      if (i !== -1) {
        q.splice(i, 1)
        if (q.length === 0) {
          this.queues.delete(employeeId)
        }
        return true
      }
    }
    const j = this.overflow.findIndex((e) => e.activityId === activityId)
    if (j !== -1) {
      this.overflow.splice(j, 1)
      return true
    }
    return false
  }

  /** Immediately removes actors and pending trips of Orca employees that left the world. */
  retainEmployees(present: ReadonlySet<string>): void {
    if (this.disposed) {
      return
    }
    const gone = (e: { readonly employeeId: string; readonly source: string }): boolean =>
      e.source === 'orca' && !present.has(e.employeeId)
    for (const [id, traveler] of this.active) {
      if (gone(traveler.init)) {
        this.queues.delete(traveler.init.employeeId)
        this.active.delete(id)
        this.releaseSlot(id)
        this.deps.parent.remove(traveler.init.actor.root)
        traveler.dispose()
        this.busyEmployees.delete(traveler.init.employeeId)
      }
    }
    for (const employeeId of this.queues.keys()) {
      if (!present.has(employeeId) && this.queues.get(employeeId)?.[0]?.source === 'orca') {
        this.queues.delete(employeeId)
      }
    }
    for (let i = this.overflow.length - 1; i >= 0; i--) {
      if (gone(this.overflow[i])) {
        this.overflow.splice(i, 1)
      }
    }
    this.drainOverflow()
  }

  private drainOverflow(): void {
    while (this.active.size < MAX_ACTIVE_TRAVELERS) {
      const i = this.overflow.findIndex((e) => !this.busyEmployees.has(e.employeeId))
      if (i === -1) {
        return
      }
      const [next] = this.overflow.splice(i, 1)
      this.start(next)
    }
  }

  /** Keep results that arrive before their start, but never grow without bound if a start was dropped. */
  private rememberEarlyResult(event: CampusActivityEvent): void {
    this.pendingResults.set(event.activityId, event)
    while (this.pendingResults.size > MAX_PENDING_RESULTS) {
      const oldest = this.pendingResults.keys().next().value
      if (oldest === undefined) {
        break
      }
      this.pendingResults.delete(oldest)
    }
  }

  private isQueued(activityId: string): boolean {
    for (const q of this.queues.values()) {
      if (q.some((e) => e.activityId === activityId)) {
        return true
      }
    }
    return this.overflow.some((e) => e.activityId === activityId)
  }

  private start(event: CampusActivityEvent): void {
    if (this.busyEmployees.has(event.employeeId)) {
      const q = this.queues.get(event.employeeId) ?? []
      if (q.length < MAX_QUEUED_PER_EMPLOYEE) {
        q.push(event)
      }
      this.queues.set(event.employeeId, q)
      return
    }
    if (this.active.size >= MAX_ACTIVE_TRAVELERS) {
      if (this.overflow.length < MAX_OVERFLOW) {
        this.overflow.push(event)
      }
      return
    }
    const info = this.deps.resolveEmployee(event)
    const source = info ? this.deps.getSource(info.modelKind, event.employeeId) : null
    if (!info || !source) {
      return
    }
    const zoneId = zoneForActivity(event.kind)
    const zone = this.deps.campus.zones.get(zoneId)
    if (!zone) {
      return
    }
    const zoneDef = getZoneDef(zoneId)
    const actor: Actor = createActor({
      source,
      kind: info.modelKind,
      tint: info.tint,
      shadows: this.deps.shadows ?? true
    })
    // Identifies the actor for scene inspection (E2E); never read back by the director.
    actor.root.userData.campus = {
      employeeId: event.employeeId,
      activityId: event.activityId,
      zoneId
    }
    this.deps.parent.add(actor.root)
    this.busyEmployees.add(event.employeeId)
    const used = this.slots.get(zoneId) ?? new Set<number>()
    let slot = 0
    while (used.has(slot)) {
      slot++
    }
    used.add(slot)
    this.slots.set(zoneId, used)
    this.slotOf.set(event.activityId, { zoneId, slot })
    const traveler = new Traveler({
      activityId: event.activityId,
      employeeId: event.employeeId,
      kind: event.kind,
      source: event.source,
      actor,
      zone,
      zoneDef,
      outPath: offsetPathEnd(info.route(zoneDef), slotOffset(zoneDef, slot)),
      seat: info.seat,
      seatYaw: info.seatYaw,
      seatLift: info.seatLift,
      detail: event.detail,
      onAway: (away) => this.deps.setAway(event.employeeId, away && event.source === 'orca')
    })
    this.active.set(event.activityId, traveler)
    const early = this.pendingResults.get(event.activityId)
    if (early) {
      traveler.resolve(early.status, early.detail)
      this.pendingResults.delete(event.activityId)
    }
  }

  update(dt: number, timeSeconds: number): void {
    if (this.disposed) {
      return
    }
    for (const [id, traveler] of this.active) {
      traveler.update(dt, timeSeconds)
      if (traveler.finished) {
        this.finish(id, traveler)
      }
    }
  }

  private finish(id: string, traveler: Traveler): void {
    this.active.delete(id)
    this.releaseSlot(id)
    this.deps.parent.remove(traveler.init.actor.root)
    traveler.init.actor.dispose()
    const employeeId = traveler.init.employeeId
    this.busyEmployees.delete(employeeId)
    const queue = this.queues.get(employeeId)
    const next = queue?.shift()
    if (queue?.length === 0) {
      this.queues.delete(employeeId)
    }
    if (next) {
      this.start(next)
    }
    this.drainOverflow()
  }

  private releaseSlot(activityId: string): void {
    const s = this.slotOf.get(activityId)
    if (!s) {
      return
    }
    this.slots.get(s.zoneId)?.delete(s.slot)
    this.slotOf.delete(activityId)
  }

  dispose(): void {
    this.disposed = true
    for (const traveler of this.active.values()) {
      this.deps.parent.remove(traveler.init.actor.root)
      traveler.dispose()
    }
    this.active.clear()
    this.slots.clear()
    this.slotOf.clear()
    this.queues.clear()
    this.overflow.length = 0
    this.busyEmployees.clear()
    this.pendingResults.clear()
  }
}
