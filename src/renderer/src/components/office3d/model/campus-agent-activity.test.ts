import { describe, expect, it } from 'vitest'
import { createCampusEventBus, type CampusActivityEvent } from '../scene/campus/campus-events'
import {
  classifyAgentActivity,
  classifyShellCommand,
  createCampusAgentActivityAdapter,
  type CampusAgentStatus
} from './campus-agent-activity'

const working = (toolName?: string, toolInput?: string): CampusAgentStatus => ({
  state: 'working',
  toolName,
  toolInput
})

describe('classifyShellCommand', () => {
  it.each([
    ['git push origin main', 'git-push', 'git push'],
    ['cd repo && git -C sub commit -m "x"', 'git-push', 'git commit'],
    ['gh pr create --fill', 'git-push', 'gh pr create'],
    ['gh pr review 12 --approve', 'code-review', 'gh pr review'],
    ['pnpm test src/foo.test.ts', 'test-run', 'pnpm test src/foo.test.ts'],
    ['CI=1 npx vitest run', 'test-run', 'vitest run'],
    ['npm run test:unit', 'test-run', 'npm run test:unit'],
    ['cargo test --all', 'test-run', 'cargo test --all'],
    ['vercel --prod', 'deploy', 'vercel --prod'],
    ['pnpm run deploy:staging', 'deploy', 'pnpm run deploy:staging']
  ])('%s -> %s', (command, kind, detail) => {
    expect(classifyShellCommand(command)).toEqual({ kind, detail })
  })

  it.each([
    'ls -la',
    'pnpm install',
    'echo git push',
    'cat test.log',
    'gh issue list',
    'git --version'
  ])('does not guess an activity for %s', (command) => {
    expect(classifyShellCommand(command)).toBeNull()
  })
})

describe('classifyAgentActivity', () => {
  it('only reads commands from shell tools, never from search or edit inputs', () => {
    expect(classifyAgentActivity(working('Bash', 'git push'))?.kind).toBe('git-push')
    expect(classifyAgentActivity(working('exec_command', 'pnpm test'))?.kind).toBe('test-run')
    expect(classifyAgentActivity(working('Grep', 'git push'))).toBeNull()
    expect(classifyAgentActivity(working('Edit', 'tests/deploy.test.ts'))).toBeNull()
  })

  it('keeps coding agents at their desk', () => {
    expect(classifyAgentActivity(working())).toBeNull()
  })

  it('sends waiting, blocked and done agents to the garden', () => {
    expect(classifyAgentActivity({ state: 'waiting' })?.kind).toBe('rest')
    expect(classifyAgentActivity({ state: 'blocked' })?.kind).toBe('rest')
    expect(classifyAgentActivity({ state: 'done' })?.kind).toBe('rest')
  })

  it('treats live working subagents as coordination', () => {
    const status: CampusAgentStatus = {
      state: 'working',
      subagents: [
        { id: 'a', state: 'working', startedAt: 1 },
        { id: 'b', state: 'idle', startedAt: 1 }
      ]
    }
    expect(classifyAgentActivity(status)).toEqual({ kind: 'meeting', detail: '1 subagent' })
  })

  it('ignores restored rows that no live event has confirmed', () => {
    expect(classifyAgentActivity({ state: 'done', restoredUnconfirmed: true })).toBeNull()
  })
})

describe('createCampusAgentActivityAdapter', () => {
  function setup(): {
    events: CampusActivityEvent[]
    adapter: ReturnType<typeof createCampusAgentActivityAdapter>
  } {
    const bus = createCampusEventBus()
    const events: CampusActivityEvent[] = []
    bus.subscribe((e) => events.push(e))
    return { events, adapter: createCampusAgentActivityAdapter(bus, () => 1) }
  }

  it('emits one trip per activity change and dedupes repeated status pings', () => {
    const { events, adapter } = setup()
    adapter.sync([{ employeeId: 'e1', status: working('Bash', 'git commit -m x') }])
    adapter.sync([{ employeeId: 'e1', status: working('Bash', 'git push') }])
    adapter.sync([{ employeeId: 'e1', status: working('Bash', 'pnpm test') }])
    adapter.sync([{ employeeId: 'e1', status: working('Edit', 'src/a.ts') }])
    expect(events.map((e) => `${e.kind}:${e.status}`)).toEqual([
      'git-push:started',
      'git-push:ended',
      'test-run:started',
      'test-run:ended'
    ])
    expect(events.every((e) => e.source === 'orca' && e.employeeId === 'e1')).toBe(true)
    expect(events[0].activityId).toBe(events[1].activityId)
    expect(events[2].activityId).not.toBe(events[0].activityId)
  })

  it('ends the trip of an agent whose session disappears', () => {
    const { events, adapter } = setup()
    adapter.sync([
      { employeeId: 'e1', status: { state: 'waiting' } },
      { employeeId: 'e2', status: working('Bash', 'vitest') }
    ])
    adapter.sync([{ employeeId: 'e1', status: { state: 'waiting' } }])
    expect(events.map((e) => `${e.employeeId}:${e.status}`)).toEqual([
      'e1:started',
      'e2:started',
      'e2:ended'
    ])
  })

  it('closes open trips on dispose and ignores later syncs', () => {
    const { events, adapter } = setup()
    adapter.sync([{ employeeId: 'e1', status: { state: 'done' } }])
    adapter.dispose()
    adapter.sync([{ employeeId: 'e1', status: working('Bash', 'git push') }])
    expect(events.map((e) => e.status)).toEqual(['started', 'ended'])
  })
})

describe('campus event bus replay', () => {
  it('replays only activities still in progress to late subscribers', () => {
    const bus = createCampusEventBus()
    const adapter = createCampusAgentActivityAdapter(bus, () => 1)
    adapter.sync([
      { employeeId: 'e1', status: { state: 'waiting' } },
      { employeeId: 'e2', status: working('Bash', 'git push') }
    ])
    adapter.sync([{ employeeId: 'e1', status: { state: 'waiting' } }])
    const late: CampusActivityEvent[] = []
    bus.subscribe((e) => late.push(e), { replayOpen: true })
    expect(late.map((e) => `${e.employeeId}:${e.kind}:${e.status}`)).toEqual(['e1:rest:started'])
  })
})
