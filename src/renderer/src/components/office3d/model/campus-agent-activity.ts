import type { AgentStatusEntry } from '../../../../../shared/agent-status-types'
import { isCommandToolName } from '../../../../../shared/native-chat/tools/native-chat-tool-activity'
import type {
  CampusActivityEvent,
  CampusActivityKind,
  CampusEventBus
} from '../scene/campus/campus-events'

// Maps live Orca agent status rows onto campus trips. Only explicit evidence moves an agent:
// a shell tool whose command is a git/test/deploy/review CLI, live working subagents, or a
// non-working status. Everything else (including stale restored rows) keeps the agent at its desk.

export type CampusAgentStatus = Pick<
  AgentStatusEntry,
  'state' | 'toolName' | 'toolInput' | 'subagents' | 'restoredUnconfirmed'
>

export type CampusAgentActivity = { readonly kind: CampusActivityKind; readonly detail: string }

export type CampusAgentObservation = {
  readonly employeeId: string
  readonly status: CampusAgentStatus
}

const PACKAGE_MANAGERS = new Set(['npm', 'pnpm', 'yarn', 'bun'])
const TEST_RUNNERS = new Set(['vitest', 'jest', 'pytest', 'mocha', 'ava'])
const BUILD_TOOL_TEST = new Set(['cargo', 'go', 'dotnet', 'mvn', 'gradle', './gradlew', 'swift'])
const EXEC_WRAPPERS = new Set(['npx', 'bunx', 'pnpx'])
const DEPLOY_SUBCOMMAND: Readonly<Record<string, ReadonlySet<string>>> = {
  vercel: new Set(['deploy', '--prod']),
  netlify: new Set(['deploy']),
  fly: new Set(['deploy']),
  flyctl: new Set(['deploy']),
  firebase: new Set(['deploy']),
  wrangler: new Set(['deploy', 'publish']),
  kubectl: new Set(['apply', 'rollout']),
  helm: new Set(['upgrade', 'install']),
  terraform: new Set(['apply'])
}

function splitSegments(command: string): string[] {
  return command
    .split(/&&|\|\||;|\||\n/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function tokensOf(segment: string): string[] {
  const tokens = segment.split(/\s+/).filter(Boolean)
  // Leading `FOO=bar` assignments and `sudo` do not change what runs.
  let i = 0
  while (
    i < tokens.length &&
    (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i]) || tokens[i] === 'sudo')
  ) {
    i++
  }
  return tokens.slice(i).map((t) => t.replace(/^["']|["']$/g, ''))
}

function gitSubcommand(args: string[]): string | null {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-C' || args[i] === '-c') {
      i++
    } else if (!args[i].startsWith('-')) {
      return args[i]
    }
  }
  return null
}

function isScriptName(name: string | undefined, prefix: 'test' | 'deploy'): boolean {
  return name === prefix || Boolean(name?.startsWith(`${prefix}:`))
}

function classifySegment(tokens: string[]): CampusAgentActivity | null {
  let [cmd, ...rest] = tokens
  if (!cmd) {
    return null
  }
  if (
    EXEC_WRAPPERS.has(cmd) ||
    (PACKAGE_MANAGERS.has(cmd) && (rest[0] === 'exec' || rest[0] === 'dlx'))
  ) {
    const args = EXEC_WRAPPERS.has(cmd) ? rest : rest.slice(1)
    ;[cmd, ...rest] = args
    if (!cmd) {
      return null
    }
  }
  const head = [cmd, ...rest.slice(0, 2)].join(' ')
  if (cmd === 'git') {
    const sub = gitSubcommand(rest)
    return sub ? { kind: 'git-push', detail: `git ${sub}` } : null
  }
  if (cmd === 'gh' && rest[0] === 'pr') {
    if (rest[1] === 'review' || rest[1] === 'diff') {
      return { kind: 'code-review', detail: head }
    }
    if (rest[1] === 'create' || rest[1] === 'merge') {
      return { kind: 'git-push', detail: head }
    }
    return null
  }
  if (TEST_RUNNERS.has(cmd) || (cmd === 'playwright' && rest[0] === 'test')) {
    return { kind: 'test-run', detail: head }
  }
  if (BUILD_TOOL_TEST.has(cmd) && rest[0] === 'test') {
    return { kind: 'test-run', detail: head }
  }
  if (PACKAGE_MANAGERS.has(cmd)) {
    const script = rest[0] === 'run' ? rest[1] : rest[0]
    if (isScriptName(script, 'test')) {
      return { kind: 'test-run', detail: head }
    }
    if (isScriptName(script, 'deploy')) {
      return { kind: 'deploy', detail: head }
    }
    return null
  }
  if (DEPLOY_SUBCOMMAND[cmd]?.has(rest[0] ?? '')) {
    return { kind: 'deploy', detail: head }
  }
  return null
}

export function classifyShellCommand(command: string): CampusAgentActivity | null {
  for (const segment of splitSegments(command)) {
    const activity = classifySegment(tokensOf(segment))
    if (activity) {
      return activity
    }
  }
  return null
}

/** Null means "at the desk" (coding or no trustworthy signal). */
export function classifyAgentActivity(status: CampusAgentStatus): CampusAgentActivity | null {
  if (status.restoredUnconfirmed) {
    return null
  }
  if (status.state === 'waiting' || status.state === 'blocked') {
    return { kind: 'rest', detail: status.state === 'blocked' ? 'needs input' : 'waiting' }
  }
  if (status.state === 'done') {
    return { kind: 'rest', detail: 'idle' }
  }
  const liveSubagents = status.subagents?.filter((s) => s.state === 'working').length ?? 0
  if (liveSubagents > 0) {
    return {
      kind: 'meeting',
      detail: liveSubagents === 1 ? '1 subagent' : `${liveSubagents} subagents`
    }
  }
  if (status.toolName && status.toolInput && isCommandToolName(status.toolName)) {
    return classifyShellCommand(status.toolInput)
  }
  return null
}

export type CampusAgentActivityAdapter = {
  sync(observations: readonly CampusAgentObservation[]): void
  dispose(): void
}

type OpenTrip = { readonly activityId: string; readonly kind: CampusActivityKind }

/**
 * Edge-triggers campus events from status snapshots: one `started` when an agent's activity kind
 * changes and one `ended` when it stops or the agent disappears, so repeated status pings never
 * duplicate trips and vanished sessions never leave an actor stranded.
 */
export function createCampusAgentActivityAdapter(
  bus: CampusEventBus,
  now: () => number = Date.now
): CampusAgentActivityAdapter {
  const open = new Map<string, OpenTrip>()
  let seq = 0
  let disposed = false

  const emit = (
    employeeId: string,
    trip: OpenTrip,
    status: CampusActivityEvent['status'],
    detail?: string
  ): void => {
    bus.emit({
      activityId: trip.activityId,
      employeeId,
      kind: trip.kind,
      status,
      source: 'orca',
      detail,
      occurredAt: now()
    })
  }

  const close = (employeeId: string): void => {
    const trip = open.get(employeeId)
    if (trip) {
      open.delete(employeeId)
      emit(employeeId, trip, 'ended')
    }
  }

  return {
    sync(observations) {
      if (disposed) {
        return
      }
      const seen = new Set<string>()
      for (const { employeeId, status } of observations) {
        seen.add(employeeId)
        const next = classifyAgentActivity(status)
        if (open.get(employeeId)?.kind === next?.kind) {
          continue
        }
        close(employeeId)
        if (next) {
          const trip: OpenTrip = { activityId: `orca:${employeeId}:${++seq}`, kind: next.kind }
          open.set(employeeId, trip)
          emit(employeeId, trip, 'started', next.detail)
        }
      }
      for (const employeeId of open.keys()) {
        if (!seen.has(employeeId)) {
          close(employeeId)
        }
      }
    },
    dispose() {
      if (disposed) {
        return
      }
      for (const employeeId of open.keys()) {
        close(employeeId)
      }
      disposed = true
    }
  }
}
