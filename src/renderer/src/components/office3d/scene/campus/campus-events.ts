// Event-driven animation interface for Moonlight Campus.
//
// SAFETY CONTRACT
// - Events are pure visualisation data. Receiving one never starts, stops or authorises
//   any Git, test, deploy, PTY or agent operation. There is no callback from the campus
//   back into Orca that can execute anything.
// - `source: 'orca'` events must be forwarded by the host app only from real, already
//   authorised Orca events. `source: 'dev-preview'` events are synthetic and are always
//   rendered with a visible "DEV PREVIEW" mark; they never refer to a real employee.

export type CampusActivityKind =
  | 'git-push'
  | 'test-run'
  | 'code-review'
  | 'deploy'
  | 'meeting'
  | 'rest'

/** `ended` closes an activity whose outcome Orca does not report; it never claims success or failure. */
export type CampusActivityStatus = 'started' | 'succeeded' | 'failed' | 'ended'

export type CampusEventSource = 'orca' | 'dev-preview'

export type CampusActivityEvent = {
  /** Unique per activity; `started` and the final status share the same id. */
  readonly activityId: string
  /** OfficeEmployee.employeeId for source 'orca'; free label for 'dev-preview'. */
  readonly employeeId: string
  readonly kind: CampusActivityKind
  readonly status: CampusActivityStatus
  readonly source: CampusEventSource
  /** Short text shown on the station (e.g. branch name, "12/12 tests"). Plain text only. */
  readonly detail?: string
  readonly occurredAt: number
}

export type CampusEventListener = (event: CampusActivityEvent) => void

export type CampusEventBus = {
  emit(event: CampusActivityEvent): void
  /** `replayOpen` first delivers activities still in progress, so late subscribers catch up. */
  subscribe(listener: CampusEventListener, options?: { readonly replayOpen?: boolean }): () => void
}

const MAX_OPEN_ACTIVITIES = 256

const MAX_DETAIL = 48

function stripControlChars(text: string): string {
  let out = ''
  for (const ch of text) {
    out += ch.charCodeAt(0) < 32 ? ' ' : ch
  }
  return out
}

export function sanitizeCampusEvent(event: CampusActivityEvent): CampusActivityEvent | null {
  if (!event.activityId || !event.employeeId) {
    return null
  }
  const detail = event.detail ? stripControlChars(event.detail).slice(0, MAX_DETAIL) : undefined
  return { ...event, detail }
}

export function createCampusEventBus(): CampusEventBus {
  const listeners = new Set<CampusEventListener>()
  const open = new Map<string, CampusActivityEvent>()
  return {
    emit(event) {
      const clean = sanitizeCampusEvent(event)
      if (!clean) {
        return
      }
      if (clean.status === 'started') {
        open.set(clean.activityId, clean)
        if (open.size > MAX_OPEN_ACTIVITIES) {
          open.delete(open.keys().next().value as string)
        }
      } else {
        open.delete(clean.activityId)
      }
      for (const l of Array.from(listeners)) {
        l(clean)
      }
    },
    subscribe(listener, options) {
      if (options?.replayOpen) {
        for (const event of open.values()) {
          listener(event)
        }
      }
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }
  }
}

/** Zone an activity happens in. `rest` goes to the garden. */
export function zoneForActivity(
  kind: CampusActivityKind
):
  | 'git-station'
  | 'testing-lab'
  | 'review-pavilion'
  | 'deployment-center'
  | 'meeting-area'
  | 'waiting-garden' {
  switch (kind) {
    case 'git-push':
      return 'git-station'
    case 'test-run':
      return 'testing-lab'
    case 'code-review':
      return 'review-pavilion'
    case 'deploy':
      return 'deployment-center'
    case 'meeting':
      return 'meeting-area'
    default:
      return 'waiting-garden'
  }
}

/** Tiny external store: employees currently away from their desk (their seated avatar hides). */
export type CampusPresenceStore = {
  setAway(employeeId: string, away: boolean): void
  isAway(employeeId: string): boolean
  subscribe(listener: () => void): () => void
  getVersion(): number
}

export function createCampusPresenceStore(): CampusPresenceStore {
  const away = new Set<string>()
  const listeners = new Set<() => void>()
  let version = 0
  return {
    setAway(id, value) {
      if (value === away.has(id)) {
        return
      }
      if (value) {
        away.add(id)
      } else {
        away.delete(id)
      }
      version++
      for (const l of Array.from(listeners)) {
        l()
      }
    },
    isAway: (id) => away.has(id),
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getVersion: () => version
  }
}

/** Process-wide singletons used by the React layer; hosts (Anti) call `campusEventBus.emit`. */
export const campusEventBus: CampusEventBus = createCampusEventBus()
export const campusPresence: CampusPresenceStore = createCampusPresenceStore()
