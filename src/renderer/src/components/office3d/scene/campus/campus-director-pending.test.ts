import { describe, expect, it } from 'vitest'
import { CampusDirector, MAX_PENDING_RESULTS } from './campus-director'
import type { Campus } from './build-campus'
import type { CampusActivityEvent } from './campus-events'

function makeDirector(): CampusDirector {
  return new CampusDirector({
    campus: { zones: new Map() } as unknown as Campus,
    parent: { add: () => undefined, remove: () => undefined } as never,
    getSource: () => null,
    resolveEmployee: () => null,
    setAway: () => undefined
  })
}

function result(id: string): CampusActivityEvent {
  return {
    activityId: id,
    employeeId: 'emp',
    kind: 'git-push',
    status: 'succeeded',
    source: 'dev-preview',
    occurredAt: 1
  }
}

describe('CampusDirector pending results', () => {
  it('bounds results that arrive without a matching start and keeps the newest', () => {
    const director = makeDirector()
    const total = MAX_PENDING_RESULTS + 40
    for (let i = 0; i < total; i += 1) {
      director.handle(result(`a${i}`))
    }
    const pending = (director as unknown as { pendingResults: Map<string, unknown> }).pendingResults
    expect(pending.size).toBe(MAX_PENDING_RESULTS)
    expect(pending.has('a0')).toBe(false)
    expect(pending.has(`a${total - 1}`)).toBe(true)
  })
})
