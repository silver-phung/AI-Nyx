import {
  buildPath,
  reversePath,
  samplePath,
  type CampusPath,
  type CampusPoint,
  type CampusZoneDef
} from './campus-layout'
import type { CampusActivityKind, CampusActivityStatus, CampusEventSource } from './campus-events'
import { shortestAngle } from './campus-kit'
import type { Actor, ActorClipRole } from './build-actor'
import type { ZoneView } from './build-zones'

/** Pure animation state machine for one agent trip: desk -> station -> desk. */

export type TravelerPhase =
  | 'rise'
  | 'walk-out'
  | 'arrive'
  | 'work'
  | 'result'
  | 'walk-back'
  | 'sit'
  | 'done'

export type TravelerInit = {
  readonly activityId: string
  readonly employeeId: string
  readonly kind: CampusActivityKind
  readonly source: CampusEventSource
  readonly actor: Actor
  readonly zone: ZoneView
  readonly zoneDef: CampusZoneDef
  readonly outPath: CampusPath
  /** Seat point + yaw at the start (and where the trip ends). */
  readonly seat: CampusPoint
  readonly seatYaw: number
  /** Vertical offset of the seated pose (chair height); 0 for non-desk starts. */
  readonly seatLift?: number
  readonly detail?: string
  readonly onAway?: (away: boolean) => void
}

export const WALK_SPEED = 2.5
const RISE_SECONDS = 0.7
const ARRIVE_SECONDS = 0.5
const MIN_WORK_SECONDS = 2.4
const RESULT_SECONDS = 3.2
const SIT_SECONDS = 0.6
/** If a result never arrives we do not invent one; we give up waiting and walk home. Rest is open-ended. */
export const MAX_WAIT_FOR_RESULT_SECONDS = 90

const WORK_CLIP: Record<CampusActivityKind, ActorClipRole> = {
  'git-push': 'work',
  'test-run': 'work',
  'code-review': 'inspect',
  deploy: 'work',
  meeting: 'idle',
  rest: 'idle'
}

const CARRIES: Record<CampusActivityKind, boolean> = {
  'git-push': true,
  'test-run': true,
  'code-review': true,
  deploy: true,
  meeting: false,
  rest: false
}

export class Traveler {
  readonly init: TravelerInit
  phase: TravelerPhase = 'rise'
  private t = 0
  private distance = 0
  private yaw: number
  private x: number
  private z: number
  private y = 0
  private result: CampusActivityStatus | null = null
  private resultDetail: string | undefined
  private workShown = false
  private readonly back: CampusPath
  private readonly toSeat: CampusPath

  constructor(init: TravelerInit) {
    this.init = init
    this.x = init.seat.x
    this.z = init.seat.z
    this.yaw = init.seatYaw
    this.y = init.seatLift ?? 0
    this.back = reversePath(init.outPath)
    const start = init.outPath.points[0]
    this.toSeat = buildPath([start, init.seat])
    init.actor.setClip('sit', 0)
    init.actor.setCarrying(false)
    init.onAway?.(true)
    this.apply()
  }

  /** Called when the final status (succeeded/failed) for this activity arrives. */
  resolve(status: CampusActivityStatus, detail?: string): void {
    if (status === 'started') {
      return
    }
    this.result = status
    this.resultDetail = detail
  }

  get finished(): boolean {
    return this.phase === 'done'
  }

  private turnTo(target: number, dt: number, rate = 9): void {
    this.yaw += shortestAngle(this.yaw, target) * Math.min(1, dt * rate)
  }

  private apply(): void {
    const { actor } = this.init
    actor.root.position.set(this.x, this.y, this.z)
    actor.root.rotation.y = this.yaw
  }

  update(dt: number, timeSeconds: number): void {
    const { actor, zone, zoneDef } = this.init
    this.t += dt
    switch (this.phase) {
      case 'rise': {
        const u = Math.min(this.t / RISE_SECONDS, 1)
        const stand = this.toSeat.points[0]
        this.x = this.init.seat.x + (stand.x - this.init.seat.x) * u
        this.z = this.init.seat.z + (stand.z - this.init.seat.z) * u
        this.y = (this.init.seatLift ?? 0) * (1 - u)
        if (u > 0.35) {
          actor.setClip('idle')
        }
        if (u >= 1) {
          this.enter('walk-out')
          actor.setClip('walk')
          actor.setCarrying(CARRIES[this.init.kind])
          actor.setPackageScale(1)
          zone.setStatus(
            'working',
            'Incoming',
            this.init.detail,
            this.init.source === 'dev-preview'
          )
        }
        break
      }
      case 'walk-out':
        this.walk(this.init.outPath, dt, () => {
          this.enter('arrive')
          actor.setClip('idle')
        })
        break
      case 'arrive': {
        this.turnTo(zoneDef.spotYaw, dt)
        if (this.t >= ARRIVE_SECONDS) {
          this.enter('work')
          actor.setClip('handoff')
        }
        break
      }
      case 'work': {
        this.turnTo(zoneDef.spotYaw, dt)
        if (this.t > 0.8 && actor.root.userData.handedOff !== true) {
          actor.root.userData.handedOff = true
          zone.receivePackage()
        }
        if (this.t > 0.8) {
          actor.setPackageScale(Math.max(0, 1 - (this.t - 0.8) / 0.5))
          if (this.t > 1.3) {
            actor.setClip(WORK_CLIP[this.init.kind])
          }
        }
        if (!this.workShown) {
          this.workShown = true
          zone.setStatus(
            'working',
            labelFor(this.init.kind, 'working'),
            this.init.detail,
            this.init.source === 'dev-preview'
          )
        }
        if (this.result === 'ended' && this.t >= MIN_WORK_SECONDS) {
          this.enter('result')
          actor.setClip('idle')
          zone.setStatus(
            'idle',
            labelFor(this.init.kind, 'ended'),
            this.resultDetail ?? this.init.detail,
            this.init.source === 'dev-preview'
          )
        } else if (this.result && this.t >= MIN_WORK_SECONDS) {
          this.enter('result')
          const ok = this.result === 'succeeded'
          actor.setClip(ok ? 'success' : 'failure')
          actor.setStatusColor(ok ? 0x34d399 : 0xf87171)
          zone.setStatus(
            ok ? 'succeeded' : 'failed',
            labelFor(this.init.kind, ok ? 'succeeded' : 'failed'),
            this.resultDetail ?? this.init.detail,
            this.init.source === 'dev-preview'
          )
        } else if (this.init.kind !== 'rest' && this.t > MAX_WAIT_FOR_RESULT_SECONDS) {
          this.enter('result')
          actor.setClip('idle')
          zone.setStatus(
            'idle',
            'No result',
            'Nothing was reported',
            this.init.source === 'dev-preview'
          )
        }
        break
      }
      case 'result':
        this.turnTo(zoneDef.spotYaw, dt)
        if (this.t >= RESULT_SECONDS) {
          this.enter('walk-back')
          actor.setClip('walk')
          actor.setCarrying(false)
          actor.setStatusColor(0x60a5fa)
        }
        break
      case 'walk-back':
        this.walk(this.back, dt, () => {
          this.enter('sit')
          actor.setClip('idle')
          zone.setStatus('idle', 'Idle', undefined, false)
        })
        break
      case 'sit': {
        const u = Math.min(this.t / SIT_SECONDS, 1)
        const stand = this.toSeat.points[0]
        this.x = stand.x + (this.init.seat.x - stand.x) * u
        this.z = stand.z + (this.init.seat.z - stand.z) * u
        this.y = (this.init.seatLift ?? 0) * u
        this.turnTo(this.init.seatYaw, dt)
        if (u >= 1) {
          this.enter('done')
          this.init.onAway?.(false)
        }
        break
      }
      default:
        break
    }
    this.apply()
    actor.update(dt, timeSeconds)
  }

  private enter(phase: TravelerPhase): void {
    this.phase = phase
    this.t = 0
    this.distance = 0
  }

  private walk(path: CampusPath, dt: number, onEnd: () => void): void {
    this.distance += WALK_SPEED * dt
    const s = samplePath(path, this.distance)
    this.x = s.x
    this.z = s.z
    this.turnTo(s.yaw, dt, 12)
    if (this.distance >= path.length) {
      onEnd()
    }
  }

  /** Cancels the trip immediately and restores the seated avatar. */
  dispose(): void {
    if (this.phase !== 'done') {
      this.init.onAway?.(false)
    }
    this.phase = 'done'
    this.init.actor.dispose()
  }
}

function labelFor(
  kind: CampusActivityKind,
  state: 'working' | 'succeeded' | 'failed' | 'ended'
): string {
  const noun: Record<CampusActivityKind, string> = {
    'git-push': 'Git',
    'test-run': 'Tests',
    'code-review': 'Review',
    deploy: 'Deploy',
    meeting: 'Meeting',
    rest: 'Resting'
  }
  if (state === 'ended') {
    return kind === 'rest' ? 'Back to work' : `${noun[kind]} finished`
  }
  if (kind === 'rest' && state === 'working') {
    return 'Resting'
  }
  const verb = state === 'working' ? 'running' : state === 'succeeded' ? 'passed' : 'failed'
  if (kind === 'git-push') {
    return state === 'working' ? 'Git running' : state === 'succeeded' ? 'Pushed' : 'Push failed'
  }
  if (kind === 'deploy') {
    return state === 'working' ? 'Deploying' : state === 'succeeded' ? 'Deployed' : 'Deploy failed'
  }
  return `${noun[kind]} ${verb}`
}
