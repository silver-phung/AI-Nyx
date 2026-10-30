import {
  type CampusActivityEvent,
  type CampusActivityKind,
  type CampusEventBus
} from './campus-events'
import { mulberry32 } from './campus-kit'

// DEV PREVIEW ONLY. Generates clearly synthetic activity so the campus can be demoed without any
// real agent. Events carry source 'dev-preview' and ids prefixed `preview-`, never refer to a real
// Orca employee, and are rendered with a visible "DEV PREVIEW" mark.

export interface DevPreviewOptions {
  readonly intervalMs?: number
  readonly maxConcurrent?: number
  readonly agents?: number
  readonly seed?: number
  readonly now?: () => number
  readonly setTimer?: (fn: () => void, ms: number) => unknown
  readonly clearTimer?: (handle: unknown) => void
}

const SCRIPT: ReadonlyArray<{ kind: CampusActivityKind; detail: string; workMs: number }> = [
  { kind: 'git-push', detail: 'feature/campus -> origin', workMs: 5200 },
  { kind: 'test-run', detail: '48 tests', workMs: 6500 },
  { kind: 'code-review', detail: '3 comments', workMs: 6000 },
  { kind: 'deploy', detail: 'preview build', workMs: 7000 },
  { kind: 'meeting', detail: 'sync', workMs: 5000 }
]

export function startDevPreview(bus: CampusEventBus, options: DevPreviewOptions = {}): () => void {
  const intervalMs = options.intervalMs ?? 7000
  const maxConcurrent = options.maxConcurrent ?? 3
  const agents = Math.max(1, options.agents ?? 4)
  const rnd = mulberry32(options.seed ?? 4242)
  const now = options.now ?? (() => Date.now())
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = options.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>))
  const timers = new Set<unknown>()
  const busy = new Set<string>()
  let counter = 0
  let stopped = false

  const later = (fn: () => void, ms: number): void => {
    const handle = setTimer(() => {
      timers.delete(handle)
      if (!stopped) fn()
    }, ms)
    timers.add(handle)
  }

  const launch = (): void => {
    if (busy.size < maxConcurrent) {
      const free: string[] = []
      for (let i = 1; i <= agents; i++) if (!busy.has(`preview-agent-${i}`)) free.push(`preview-agent-${i}`)
      const employeeId = free[Math.floor(rnd() * free.length)]
      if (employeeId) {
        const step = SCRIPT[counter % SCRIPT.length]
        counter++
        const activityId = `preview-${counter}`
        busy.add(employeeId)
        bus.emit({ activityId, employeeId, kind: step.kind, status: 'started', source: 'dev-preview', detail: step.detail, occurredAt: now() })
        later(() => {
          const ok = rnd() > 0.22
          const done: CampusActivityEvent = {
            activityId,
            employeeId,
            kind: step.kind,
            status: ok ? 'succeeded' : 'failed',
            source: 'dev-preview',
            detail: ok ? step.detail : 'simulated failure',
            occurredAt: now()
          }
          bus.emit(done)
          later(() => busy.delete(employeeId), 16000)
        }, step.workMs + 9000)
      }
    }
    later(launch, intervalMs)
  }
  later(launch, 600)

  return () => {
    stopped = true
    for (const h of timers) clearTimer(h)
    timers.clear()
  }
}
