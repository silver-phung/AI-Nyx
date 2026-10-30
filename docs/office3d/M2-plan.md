# AI-NYX — Milestone M2 Final Architecture Plan: Deterministic Agent World Model

- **Document ID**: `DOC-OFFICE3D-M2-PLAN`
- **Revision**: 3.0 (FINAL SPECIFICATION LOCK)
- **Status**: LOCKED (Awaiting Owner Authorization to Implement)
- **Author**: Antigravity IDE (Main Developer & Git Manager)
- **Auditor**: Claude Desktop (Senior Architecture Auditor)
- **Date**: October 29, 2026
- **Target Repository**: `AI-Nyx` (`E:\Nyx\AI-Nyx-Office3D`)
- **Target Branch**: `feature/pantheon-office3d`
- **Base Commit**: `6ad6242523af35fc2e378aaa7bc7139b06dd54f8` (`feat: add Office 3D view foundation`)

---

## 1. Executive Summary & Audit Resolution Matrix

Milestone M2 is the **Deterministic Agent World Model**. It is a pure, headless TypeScript transformation layer that converts Orca's live `DashboardSnapshot` into an immutable spatial domain graph (`OfficeWorld`).

### Final Audit Resolution & Specification Lock Matrix

| Issue ID | Severity | Category | Final Locked Specification | Section Reference |
|:---|:---:|:---|:---|:---:|
| **H1** | **HIGH** | Seating Allocation | **Available desk pool**: Defined as *all* unoccupied slots in the zone (both previously empty and newly vacated). New arrivals take the lowest available slot index. All surviving employees retain exact desk IDs and coordinates. | Section 4 |
| **H2** | **HIGH** | Seating Memory | **Module-level seating holder**: Preserves desk assignments across Classic $\leftrightarrow$ Office view switching without modifying Orca's existing Zustand store. Explicit clock parameter (`currentTimeMs`), zero hidden timers, stable `floorIndex` retention, 30-min TTL on dissolved zones, and stale workspace pruning. | Section 5 |
| **H3** | **HIGH** | Host Resolution | **Zero synthetic host IDs**: Missing `executionHostId` resolved strictly via unambiguous workspace lookup; otherwise falls back to Orca's canonical `UNRESOLVED_OWNER_HOST_ID`. Every entry exposes `rawExecutionHostId`, resolved `executionHostId`, and `isRoutable` via `parseRoutableExecutionHostId`. `hostKind` is presentation-only and decoupled from identity. | Section 3.3 |
| **H4** | **HIGH** | Duplicate Cards | **Deterministic tie-breaking on guaranteed fields**: Order-independent winner selected by `stateChangedAt DESC`, `startedAt DESC`, then canonical string sort. Optional `statusUpdatedAt` is eliminated from tie-break. Dropped duplicates emitted via `diagnostics: readonly OfficeWorldDiagnostic[]`. Zero `console.log`. | Section 3.4 & 6.2 |
| **M1** | **MEDIUM** | Immutability | **100% Reference Isolation**: No references retained to mutable snapshot objects, including deep copying of nested `review` objects. Deep freeze assertion restricted to unit tests. Zero environment-dependent freezing bugs in production loops. | Section 6.1 |
| **M2** | **MEDIUM** | Navigation API | **Metadata-only navigation**: Model provides `{ repoId, worktreeId, executionHostId, isRoutable }`. UI presentation invokes Orca's standard workspace activation mechanisms, never direct store state mutations. | Section 2.5 |
| **M3** | **MEDIUM** | Zone ID Encoding | **5-Part Composite ZoneId**: Includes `workspaceKind` (`'worktree' | 'folder'`). Encodes all composite elements (`encodeURIComponent`) to safely support `::` in worktree IDs and `:` in host IDs. Complete collision isolation. | Section 3.1 |
| **M4** | **MEDIUM** | Complete Contracts | **Exhaustive interfaces**: Full field definitions for `OfficeWorld`, `OfficeZone`, `OfficeDesk`, `OfficeEmployee`, `OfficeWaitingWorkspace`. Direct `tabId`/`leafId` usage, nullable `ptyId`, and `dashboardCardDisplayState` parity. | Section 2 |
| **M5** | **MEDIUM** | Zone Stability | **Stable Zone Order & FloorIndex**: Surviving zones preserve their relative array index and spatial `floorIndex` across snapshot updates; new zones append to the end. Reappearing zones reclaim their exact previous `floorIndex`. | Section 4.4 & 5.2 |

---

## 2. Complete Entity Interfaces & Contracts

All interfaces reside in `src/renderer/src/components/office3d/model/office-world-types.ts`. All types are strictly `readonly` and composed of plain serializable primitives.

### 2.1 Employee Display State (Orca Parity)
Orca provides [dashboardCardDisplayState(card)](file:///E:/Nyx/AI-Nyx-Office3D/src/shared/dashboard-snapshot.ts#L33-L40), which normalizes monitoring modes and unacknowledged turn completions. The world model reflects these exact semantics:

```typescript
export type OfficeEmployeeDisplayState =
  | 'working'    // Active execution (tools, bash, python, generation)
  | 'monitoring' // Background monitoring mode (workingMode: 'monitoring')
  | 'attention'  // Blocked or awaiting user input (AskUserQuestion)
  | 'done'       // Turn completed but unviewed (unseen: true)
  | 'idle'       // Settled into idle / acknowledged done / standby
```

### 2.2 Complete `OfficeEmployee`
```typescript
export interface OfficeEmployee {
  /** Unique composite identity: `${encodeURIComponent(executionHostId)}::${encodeURIComponent(paneKey)}` */
  readonly employeeId: EmployeeId
  /** Layout pane key from Orca: `${tabId}:${leafId}` */
  readonly paneKey: string
  /** Null when session is retained, parked, or finished without an active process */
  readonly ptyId: string | null
  /** Direct tab ID from card (never parsed from paneKey) */
  readonly tabId: string
  /** Direct layout leaf ID from card (never parsed from paneKey) */
  readonly leafId: string | null
  /** Assigned zone containing this employee's desk */
  readonly zoneId: ZoneId
  /** Assigned desk identifier: `${zoneId}::desk-${slotIndex}` */
  readonly deskId: DeskId
  /** 0-based stable desk slot index within the zone pod */
  readonly slotIndex: number
  /** Normalized display state matching Orca card display state rules */
  readonly displayState: OfficeEmployeeDisplayState
  /** Raw card lifecycle bucket */
  readonly bucket: DashboardBucket
  /** Raw card dot state */
  readonly dotState: DashboardCardDotState
  /** Agent provider / CLI type ('claude', 'codex', 'terminal', etc.) */
  readonly agentType: AgentType
  /** Task description text (empty string for title-derived synthetic rows) */
  readonly task: string
  /** Short prompt/question summary when displayState === 'attention' */
  readonly askSummary?: string
  /** Last user prompt preview */
  readonly lastUserMessage?: string
  /** Last assistant prose preview */
  readonly lastAgentMessage?: string
  /** Start timestamp in ms (0 for title-derived rows) */
  readonly startedAt: number
  /** State transition timestamp in ms */
  readonly stateChangedAt: number
  /** Original host ID received from source, or null if absent */
  readonly rawExecutionHostId: ExecutionHostId | null
  /** Resolved execution host ID used for domain grouping */
  readonly executionHostId: ExecutionHostId
  /** True if host is dialable/routable; false if UNRESOLVED_OWNER_HOST_ID */
  readonly isRoutable: boolean
  /** Routing target for click-to-focus navigation back into Classic View */
  readonly revealTarget: OfficeRevealTarget
}

export interface OfficeRevealTarget {
  readonly repoId: string
  readonly worktreeId: string
  readonly tabId: string
  readonly leafId: string | null
  readonly executionHostId: ExecutionHostId
  /** If false, UI layer MUST disable click-through navigation */
  readonly isRoutable: boolean
}
```

### 2.3 Complete `OfficeDesk`
```typescript
export type DeskId = `${ZoneId}::desk-${number}`

export interface OfficeDesk {
  readonly deskId: DeskId
  readonly zoneId: ZoneId
  readonly slotIndex: number
  /** Invariant relative logical grid X coordinate (-1 for Left column, +1 for Right column) */
  readonly gridX: number
  /** Invariant relative logical grid Y coordinate (row offset along desk bank) */
  readonly gridY: number
  /** Currently seated employee ID, or null if slot is vacant */
  readonly employeeId: EmployeeId | null
  readonly isOccupied: boolean
}
```

### 2.4 Complete `OfficeZone`
```typescript
export interface OfficeZone {
  readonly zoneId: ZoneId
  readonly repoId: string
  readonly worktreeId: string
  readonly repoName: string
  readonly worktreeName: string
  readonly displayName: string
  readonly workspaceKind: DashboardCardWorkspaceKind // 'worktree' | 'folder'
  readonly rawExecutionHostId: ExecutionHostId | null
  readonly executionHostId: ExecutionHostId
  /** Presentation metadata only. May change between 'local' and 'wsl' dynamically. */
  readonly hostKind: DashboardCardHostKind
  readonly hostLabel: string
  readonly isRoutable: boolean
  /** Ordered desks in this pod (length equals capacity) */
  readonly desks: readonly OfficeDesk[]
  /** Total desk slots in pod (always multiples of 4, minimum 4) */
  readonly capacity: number
  /** Number of currently seated employees */
  readonly activeEmployeeCount: number
  /** Safe deep-copied review status (primitive projection) */
  readonly review?: {
    readonly number: number
    readonly state: 'open' | 'closed' | 'merged' | 'draft'
  }
  /** Stable 2D floor layout position of this zone */
  readonly floorIndex: number
}
```

### 2.5 Complete `OfficeWaitingWorkspace`
```typescript
export interface OfficeWaitingWorkspace {
  readonly zoneId: ZoneId
  readonly repoId: string
  readonly worktreeId: string
  readonly repoName: string
  readonly worktreeName: string
  readonly workspaceKind: DashboardCardWorkspaceKind
  readonly rawExecutionHostId: ExecutionHostId | null
  readonly executionHostId: ExecutionHostId
  readonly hostKind: DashboardCardHostKind
  readonly hostLabel: string
  readonly isRoutable: boolean
  readonly review?: {
    readonly number: number
    readonly state: 'open' | 'closed' | 'merged' | 'draft'
  }
  /** Metadata for workspace activation in Orca */
  readonly navigationTarget: {
    readonly repoId: string
    readonly worktreeId: string
    readonly executionHostId: ExecutionHostId
    readonly isRoutable: boolean
  }
}

export interface OfficeWaitingRoom {
  readonly count: number
  readonly workspaces: readonly OfficeWaitingWorkspace[]
}
```

### 2.6 Complete `OfficeWorld` and Diagnostics
```typescript
export interface OfficeWorldDiagnostic {
  readonly code: 'DUPLICATE_CARD_DROPPED' | 'UNRESOLVED_HOST_ISOLATED' | 'SPARSE_CARD_SANITIZED'
  readonly message: string
  readonly paneKey?: string
  readonly repoId?: string
  readonly worktreeId?: string
  readonly executionHostId?: string
  readonly droppedCardDetails?: {
    readonly task: string
    readonly stateChangedAt: number
    readonly startedAt: number
  }
}

export interface OfficeWorld {
  /** Timestamp inherited from snapshot.generatedAt (or options.currentTimeMs) */
  readonly generatedAt: number
  /** Active zones containing at least one card */
  readonly zones: readonly OfficeZone[]
  /** Workspaces currently containing zero cards */
  readonly waitingRoom: OfficeWaitingRoom
  /** Flat list of all seated employees */
  readonly employees: readonly OfficeEmployee[]
  /** O(1) indexed lookups */
  readonly lookup: {
    readonly employeeById: ReadonlyMap<EmployeeId, OfficeEmployee>
    readonly employeesByZoneId: ReadonlyMap<ZoneId, readonly OfficeEmployee[]>
    readonly zoneById: ReadonlyMap<ZoneId, OfficeZone>
  }
  /** Diagnostic log emitted during world construction */
  readonly diagnostics: readonly OfficeWorldDiagnostic[]
  /** Aggregate fleet statistics */
  readonly stats: {
    readonly totalWorkspaces: number
    readonly activeZones: number
    readonly waitingWorkspaces: number
    readonly totalEmployees: number
    readonly workingCount: number
    readonly monitoringCount: number
    readonly attentionCount: number
    readonly doneCount: number
    readonly idleCount: number
  }
}
```

---

## 3. Safe Identity Strategy & Host Resolution (H3, H4, M3)

### 3.1 5-Part Composite Zone ID Encoding (M3 & Lock Item 1)
To guarantee zero collisions across distinct execution hosts, repositories, worktrees, and folder workspaces:

$$\text{ZoneId} \coloneqq \text{zone} \mathbin{:} \text{encode}(\text{executionHostId}) \mathbin{:} \text{encode}(\text{workspaceKind}) \mathbin{:} \text{encode}(\text{repoId}) \mathbin{:} \text{encode}(\text{worktreeId})$$

```typescript
export type ZoneId = `zone:${string}:${DashboardCardWorkspaceKind}:${string}:${string}`

export function createZoneId(
  executionHostId: ExecutionHostId,
  workspaceKind: DashboardCardWorkspaceKind,
  repoId: string,
  worktreeId: string
): ZoneId {
  return `zone:${encodeURIComponent(executionHostId)}:${encodeURIComponent(workspaceKind)}:${encodeURIComponent(repoId)}:${encodeURIComponent(worktreeId)}` as ZoneId
}

export function parseZoneId(zoneId: ZoneId): {
  executionHostId: ExecutionHostId
  workspaceKind: DashboardCardWorkspaceKind
  repoId: string
  worktreeId: string
} | null {
  const parts = zoneId.split(':')
  if (parts.length !== 5 || parts[0] !== 'zone') {
    return null
  }
  return {
    executionHostId: decodeURIComponent(parts[1]) as ExecutionHostId,
    workspaceKind: decodeURIComponent(parts[2]) as DashboardCardWorkspaceKind,
    repoId: decodeURIComponent(parts[3]),
    worktreeId: decodeURIComponent(parts[4])
  }
}
```

### 3.2 Canonical Employee ID
$$\text{EmployeeId} \coloneqq \text{encodeURIComponent}(\text{executionHostId}) \mathbin{::} \text{encodeURIComponent}(\text{paneKey})$$

```typescript
export type EmployeeId = `${string}::${string}`

export function createEmployeeId(
  executionHostId: ExecutionHostId,
  paneKey: string
): EmployeeId {
  return `${encodeURIComponent(executionHostId)}::${encodeURIComponent(paneKey)}`
}
```

### 3.3 Safe Execution Host Resolution (H3)
We enforce strict resolution rules against fabricating host IDs:

```typescript
export function resolveCardExecutionHost(
  card: DashboardCard,
  workspaces: readonly DashboardWorkspace[] | undefined
): {
  rawExecutionHostId: ExecutionHostId | null
  executionHostId: ExecutionHostId
  isRoutable: boolean
} {
  // 1. If card already has an explicit executionHostId, validate it directly
  if (card.executionHostId) {
    const routable = parseRoutableExecutionHostId(card.executionHostId) !== null
    return {
      rawExecutionHostId: card.executionHostId,
      executionHostId: card.executionHostId,
      isRoutable: routable
    }
  }

  // 2. Search for an unambiguous matching workspace in snapshot.workspaces
  const matchingWorkspaces = (workspaces ?? []).filter(
    (w) => w.repoId === card.repoId && w.worktreeId === card.worktreeId
  )

  if (matchingWorkspaces.length === 1 && matchingWorkspaces[0].executionHostId) {
    const resolvedHostId = matchingWorkspaces[0].executionHostId
    const routable = parseRoutableExecutionHostId(resolvedHostId) !== null
    return {
      rawExecutionHostId: null,
      executionHostId: resolvedHostId,
      isRoutable: routable
    }
  }

  // 3. Ambiguous or missing match -> fallback to canonical UNRESOLVED_OWNER_HOST_ID
  return {
    rawExecutionHostId: null,
    executionHostId: UNRESOLVED_OWNER_HOST_ID,
    isRoutable: false
  }
}
```

### 3.4 Deterministic Duplicate Card Resolution on Guaranteed Fields (H4 & Lock Item 2)
Inspection of [src/shared/dashboard-snapshot.ts](file:///E:/Nyx/AI-Nyx-Office3D/src/shared/dashboard-snapshot.ts#L118) confirms `statusUpdatedAt?: number` is optional on `DashboardCard` (`/** Optional on mixed-version snapshots */`).
To guarantee 100% deterministic tie-breaking across mixed snapshots, **optional `statusUpdatedAt` is completely eliminated from tie-break logic**.

The canonical tie-break hierarchy strictly uses verified, guaranteed fields:

```typescript
export function compareDuplicateCards(a: DashboardCard, b: DashboardCard): number {
  // 1. Higher stateChangedAt wins (most recent state transition - GUARANTEED field)
  if (a.stateChangedAt !== b.stateChangedAt) {
    return b.stateChangedAt - a.stateChangedAt
  }
  // 2. Higher startedAt wins (more recently started session - GUARANTEED field)
  if (a.startedAt !== b.startedAt) {
    return b.startedAt - a.startedAt
  }
  // 3. Canonical string comparison on task (GUARANTEED string)
  if (a.task !== b.task) {
    return a.task.localeCompare(b.task)
  }
  // 4. Canonical string comparison on agentType (GUARANTEED string)
  if (a.agentType !== b.agentType) {
    return a.agentType.localeCompare(b.agentType)
  }
  // 5. Final fallback on tabId/leafId strings (GUARANTEED strings)
  const aStr = `${a.tabId}:${a.leafId ?? ''}`
  const bStr = `${b.tabId}:${b.leafId ?? ''}`
  return aStr.localeCompare(bStr)
}
```

Dropped duplicates are appended to `world.diagnostics` with code `'DUPLICATE_CARD_DROPPED'`. **No `console.log` or side effects.**

---

## 4. Corrected Seating Allocation Algorithm (H1, M5)

### 4.1 The Available Desk Pool Definition (H1)
In the revised algorithm, the available desk pool for a Zone $Z$ is defined as **every unoccupied slot in the zone**, comprising:
1. Slots that were unoccupied in the previous world ($s < \text{capacity}_{\text{prev}}$ where $\text{desk.employeeId} == \text{null}$).
2. Slots vacated by employees who departed between the previous world and current snapshot.
3. Newly created slots when expanding pod capacity.

### 4.2 Step-by-Step Allocation Procedure
For each active Zone:

```typescript
// 1. Collect previous seating memory for this zone (from previousWorld or SeatingHolder)
const previousDeskMap: ReadonlyMap<EmployeeId, number> = getPreviousSeating(zoneId)

// 2. Identify surviving employees and retain their exact slots
const survivingEmployees: Array<{ card: DashboardCard; slotIndex: number }> = []
const unassignedCards: DashboardCard[] = []
const occupiedSlots = new Set<number>()

for (const card of deduplicatedZoneCards) {
  const empId = createEmployeeId(card.executionHostId, card.paneKey)
  const previousSlot = previousDeskMap.get(empId)
  if (previousSlot !== undefined) {
    survivingEmployees.push({ card, slotIndex: previousSlot })
    occupiedSlots.add(previousSlot)
  } else {
    unassignedCards.push(card)
  }
}

// 3. Determine base capacity needed
const maxSurvivingSlot = survivingEmployees.reduce((max, e) => Math.max(max, e.slotIndex), -1)
const previousCapacity = getPreviousCapacity(zoneId) ?? 4
let capacity = Math.max(previousCapacity, Math.ceil((maxSurvivingSlot + 1) / 4) * 4, 4)

// 4. Construct the complete available slot pool (H1)
const availableSlots: number[] = []
for (let s = 0; s < capacity; s++) {
  if (!occupiedSlots.has(s)) {
    availableSlots.push(s)
  }
}

// 5. Sort new arrivals deterministically (order-independent)
unassignedCards.sort((a, b) => {
  if (a.startedAt !== b.startedAt) return a.startedAt - b.startedAt
  const aId = createEmployeeId(a.executionHostId, a.paneKey)
  const bId = createEmployeeId(b.executionHostId, b.paneKey)
  return aId.localeCompare(bId)
})

// 6. Assign arrivals to the lowest available slots; expand capacity as needed
const finalEmployeeSeats = new Map<EmployeeId, number>()
for (const { card, slotIndex } of survivingEmployees) {
  finalEmployeeSeats.set(createEmployeeId(card.executionHostId, card.paneKey), slotIndex)
}

for (const card of unassignedCards) {
  const empId = createEmployeeId(card.executionHostId, card.paneKey)
  if (availableSlots.length === 0) {
    // Expand capacity by one bank of 4 desks
    const oldCap = capacity
    capacity += 4
    for (let s = oldCap; s < capacity; s++) {
      availableSlots.push(s)
    }
  }
  // Pop the lowest available slot index
  const assignedSlot = availableSlots.shift()!
  finalEmployeeSeats.set(empId, assignedSlot)
}
```

### 4.3 Invariant Geometric Coordinates
For any slot index $s \in [0, \infty)$:
```typescript
export function getDeskGridCoordinates(slotIndex: number): { gridX: number; gridY: number } {
  const bank = Math.floor(slotIndex / 4)
  const posInBank = slotIndex % 4
  const gridX = posInBank < 2 ? -1 : 1
  const gridY = bank * 2 + (posInBank % 2)
  return { gridX, gridY }
}
```

### 4.4 Stable Zone Ordering (M5)
To prevent the entire office floor from reorganizing when a single workspace changes:
1. In `previousWorld`, zones are stored in a persistent sequence: $[\text{zone}_0, \text{zone}_1, \dots]$.
2. For the new snapshot:
   - Surviving zones retain their exact relative sequence.
   - Newly activated zones are appended to the end of the active zones list.
   - Closed zones are demoted to the waiting room without shifting the relative order of remaining active zones.
   - A deterministic `floorIndex` is assigned based on persistent floor tracking in `OfficeWorldSeatingHolder`.

---

## 5. Seating Memory Lifecycle & Persistence (H2 & Lock Item 4)

### 5.1 Architecture of `OfficeWorldSeatingHolder`
`Office3DPage` is unmounted when the user switches to Classic Terminal view. Storing seating state inside React component state (`useState` or `useRef`) would lose all desk assignments upon returning to Classic view.

Milestone M2 introduces an **isolated, module-level singleton** residing in `src/renderer/src/components/office3d/model/office-seating-holder.ts`:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        ELECTRON RENDERER MEMORY                        │
├───────────────────────────────────────┬────────────────────────────────┤
│ Orca Core State (UNTOUCHED)           │ M2 Seating Memory              │
│  • AppStore (Zustand)                 │  • OfficeWorldSeatingHolder    │
│  • agentStatusByPaneKey               │    (Module-level Singleton)   │
│  • worktreesByRepo                    │                                │
│  • terminalLayoutsByTabId             │  • Pure Serializable Maps      │
│  • tabsByWorktree                     │  • Zero Store Mutations        │
│                                       │  • Zero Hidden Timers          │
└───────────────────────────────────────┴────────────────────────────────┘
```

### 5.2 Seating Holder Interface with Explicit Clock & Stable FloorIndex (Lock Item 4)
```typescript
export interface ZoneSeatingRecord {
  readonly floorIndex: number
  readonly capacity: number
  readonly seatMap: ReadonlyMap<EmployeeId, number>
  readonly lastActiveAt: number
}

export interface SerializableSeatingState {
  readonly nextFloorIndex: number
  readonly zones: Record<string, {
    floorIndex: number
    capacity: number
    seats: Record<string, number>
    lastActiveAt: number
  }>
}

export class OfficeWorldSeatingHolder {
  private static instance: OfficeWorldSeatingHolder | null = null
  private readonly zoneRecords = new Map<ZoneId, ZoneSeatingRecord>()
  private nextFloorIndex = 0
  public static readonly TTL_MS = 30 * 60 * 1000 // 30 minutes retention for closed zones
  public static readonly MAX_ZONES = 100

  public static getInstance(): OfficeWorldSeatingHolder {
    if (!this.instance) {
      this.instance = new OfficeWorldSeatingHolder()
    }
    return this.instance
  }

  public getZoneRecord(zoneId: ZoneId): ZoneSeatingRecord | undefined {
    return this.zoneRecords.get(zoneId)
  }

  /** Allocates or reclaims a persistent floorIndex for a zone */
  public allocateFloorIndex(zoneId: ZoneId): number {
    const existing = this.zoneRecords.get(zoneId)
    if (existing) {
      return existing.floorIndex
    }
    const allocated = this.nextFloorIndex++
    return allocated
  }

  /** Updates zone record with EXPLICIT clock input. Zero Date.now() or hidden timers. */
  public setZoneRecord(
    zoneId: ZoneId,
    record: ZoneSeatingRecord,
    currentTimeMs: number
  ): void {
    this.zoneRecords.set(zoneId, record)
    this.enforceLimits(currentTimeMs)
  }

  /** Prunes zones that no longer exist in Orca's active workspace records */
  public pruneStaleWorkspaces(activeWorkspaceKeys: ReadonlySet<string>): void {
    for (const [zoneId] of this.zoneRecords) {
      const parsed = parseZoneId(zoneId)
      if (parsed) {
        const key = `${parsed.repoId}::${parsed.worktreeId}`
        if (!activeWorkspaceKeys.has(key)) {
          this.zoneRecords.delete(zoneId)
        }
      }
    }
  }

  /** Enforces TTL and LRU using EXPLICIT clock input. No setInterval or setTimeout. */
  public enforceLimits(currentTimeMs: number): void {
    // 1. Expire dissolved zones older than TTL (30 minutes)
    for (const [zoneId, record] of this.zoneRecords) {
      if (currentTimeMs - record.lastActiveAt > OfficeWorldSeatingHolder.TTL_MS) {
        this.zoneRecords.delete(zoneId)
      }
    }
    // 2. Enforce LRU cap if exceeded
    if (this.zoneRecords.size > OfficeWorldSeatingHolder.MAX_ZONES) {
      const oldest = Array.from(this.zoneRecords.entries())
        .sort(([, a], [, b]) => a.lastActiveAt - b.lastActiveAt)[0]
      if (oldest) {
        this.zoneRecords.delete(oldest[0])
      }
    }
  }

  /** Clears memory (used for tests or app reload) */
  public reset(): void {
    this.zoneRecords.clear()
    this.nextFloorIndex = 0
  }
}
```

### 5.3 Lifecycle & FloorIndex Invariants
- **Classic $\leftrightarrow$ Office 3D Navigation**: When user leaves Office 3D, `OfficeWorldSeatingHolder` preserves all zone records in renderer heap. Returning to Office 3D seeds `previousWorld` from this holder.
- **Application Restart**: Memory cleanly resets on app relaunch.
- **Dissolved Zones & Reappearance**: When a workspace closes all agents, its `floorIndex` and seating map are retained for 30 minutes (`TTL_MS`). If an agent re-launches in that workspace within 30 minutes, the zone reclaims its **exact previous `floorIndex`** and desks without moving other zones.
- **Workspace Deletion**: `pruneStaleWorkspaces` cleans up deleted/archived workspaces.

---

## 6. Side-Effect-Free Model Boundaries (M1, M2 & Lock Item 3)

### 6.1 Plain Readonly Objects & Complete Reference Isolation (Lock Item 3)
1. **Zero Snapshot Reference Retention**: The world builder never retains references to `DashboardSnapshot` or its nested objects.
   - Scalar strings and numbers are projected directly (`task`, `startedAt`, `stateChangedAt`, `tabId`, `leafId`).
   - Nested `review` objects are safely deep-copied to plain new objects:
     ```typescript
     export function cloneReview(
       review?: DashboardCardReview
     ): { readonly number: number; readonly state: 'open' | 'closed' | 'merged' | 'draft' } | undefined {
       if (!review) return undefined
       return {
         number: review.number,
         state: review.state
       }
     }
     ```
   - Mutating `snapshot.workspaces[0].review` or `snapshot.cards[0].review` after `buildOfficeWorld` execution has **zero effect** on `OfficeWorld`.
2. **Plain Collections**: Uses standard readonly arrays and plain JavaScript `ReadonlyMap` structures.
3. **No Production Freeze**: Relies on TypeScript compile-time immutability in production. Deep-freeze assertion is encapsulated in Vitest test helpers.

### 6.2 Zero Side Effects & Diagnostics (H4)
- **Zero Logging**: Under no circumstances does `buildOfficeWorld` call `console.log`, `console.warn`, or `console.error`.
- **Diagnostics Return**: Any anomalies (dropped duplicate cards, missing host IDs, sanitized sparse fields) are captured in `world.diagnostics`.
- **Pure Clock Injection**: `currentTimeMs` is passed via `BuildOfficeWorldOptions` (defaulting to `snapshot.generatedAt`). `Date.now()` is **strictly forbidden** inside `buildOfficeWorld`.

---

## 7. Source-Contract Ground Truth & Clarifications

1. **Direct `tabId` and `leafId` Usage**:
   - `card.paneKey` format `${tabId}:${leafId}` is an opaque string identifier.
   - The model directly accesses `card.tabId` and `card.leafId` from `DashboardCard`. It **never** uses `.split(':')` on `paneKey`.
2. **`hostKind` is Presentation Only**:
   - `card.hostKind` (`'local' | 'ssh' | 'wsl' | 'remote'`) describes how terminal bytes are formatted.
   - On Windows, running WSL may toggle `hostKind` between `'local'` and `'wsl'`.
   - `hostKind` is never used for identity, desk placement, or zone grouping.
3. **`ptyId: null` Handling**:
   - A `DashboardCard` can have `ptyId: null` when its process is parked or finished.
   - `OfficeEmployee.ptyId` correctly preserves `string | null`.
4. **Subagents Folded into Cards**:
   - In Orca, subagents (e.g. background teammates) are grouped in `card.subagents`.
   - Subagents do **not** receive separate desks unless Orca issues an independent top-level `DashboardCard`.

---

## 8. Implementation Order & Complexity Estimates

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ M2 IMPLEMENTATION STEPS (Ready upon Owner Authorization)                    │
├──────┬───────────────────────────────────────┬──────────────┬───────────────┤
│ Step │ Module / Deliverable                  │ Complexity   │ Est. LoC      │
├──────┼───────────────────────────────────────┼──────────────┼───────────────┤
│ 1    │ office-world-types.ts                 │ Low          │ ~160 lines    │
│ 2    │ office-identity.ts                    │ Low          │ ~130 lines    │
│ 3    │ office-seating-holder.ts              │ Medium       │ ~150 lines    │
│ 4    │ office-state-mapping.ts               │ Low          │ ~90 lines     │
│ 5    │ office-desk-allocator.ts              │ Medium-High  │ ~230 lines    │
│ 6    │ office-world-builder.ts               │ Medium       │ ~270 lines    │
│ 7    │ Unit Test Suites (10 test files)      │ High         │ ~900 lines    │
├──────┼───────────────────────────────────────┼──────────────┼───────────────┤
│ Total│ Pure Headless Model                   │ Structured   │ ~1,930 lines  │
└──────┴───────────────────────────────────────┴──────────────┴───────────────┘
```

---

## 9. Comprehensive Acceptance Test Specification (D & Lock Additions)

Ten focused Vitest suites will be created under `src/renderer/src/components/office3d/model/__tests__/`:

### Test 1: Middle Employee Departure and Freed-Slot Reuse (H1)
- **Scenario**: Seat Employees A, B, and C in Zone 1.
  - Initial seating: A $\rightarrow$ Slot 0, B $\rightarrow$ Slot 1, C $\rightarrow$ Slot 2.
- **Action 1**: Remove Employee B. Re-run `buildOfficeWorld(snap2, world1)`.
  - **Verify**: A stays at Slot 0. C stays at Slot 2. Desk 1 is vacant (`employeeId: null`).
- **Action 2**: Add Employee D. Re-run `buildOfficeWorld(snap3, world2)`.
  - **Verify**: D claims freed Slot 1. A stays at Slot 0. C stays at Slot 2.
- **Action 3**: Add Employee E. Re-run `buildOfficeWorld(snap4, world3)`.
  - **Verify**: E claims new Slot 3. A stays at 0, D at 1, C at 2.

### Test 2: Classic $\rightarrow$ Office $\rightarrow$ Classic Seating Memory (H2)
- **Scenario**: Simulate switching views:
  - Mount Office 3D, seat employees A, B, C. Save record to `OfficeWorldSeatingHolder`.
  - Simulate view unmount (switching to Classic).
  - Simulate remounting Office 3D.
- **Verify**: Seating record reconstitutes identical slot assignments without jumping.

### Test 3: Host & Workspace Identity Collision Prevention (H3 & Lock Item 1)
- **Scenario**:
  - Supply Card 1: `executionHostId: "local"`, `workspaceKind: "worktree"`, `repoId: "nyx"`, `worktreeId: "main"`.
  - Supply Card 2: `executionHostId: "ssh:bigcity"`, `workspaceKind: "worktree"`, `repoId: "nyx"`, `worktreeId: "main"`.
  - Supply Card 3: `executionHostId: "local"`, `workspaceKind: "folder"`, `repoId: "nyx"`, `worktreeId: "main"`.
- **Verify**:
  - Three distinct zones created:
    1. `zone:local:worktree:nyx:main`
    2. `zone:ssh%3Abigcity:worktree:nyx:main`
    3. `zone:local:folder:nyx:main`
  - Zero identity collision across hosts, repos, or folder workspaces.

### Test 4: Missing & Ambiguous Host ID with Disabled Routing (H3)
- **Scenario**:
  - Card 1: Missing `executionHostId`, matching unique workspace with `ssh:prod` $\rightarrow$ resolved to `ssh:prod`, `isRoutable: true`.
  - Card 2: Missing `executionHostId`, no matching workspace $\rightarrow$ resolved to `UNRESOLVED_OWNER_HOST_ID`, `isRoutable: false`.
- **Verify**: Card 2 has `isRoutable === false` and `revealTarget.isRoutable === false`.

### Test 5: Deterministic Duplicate Resolution on Guaranteed Fields (H4 & Lock Item 2)
- **Scenario**: Create three duplicate cards with same `(executionHostId, paneKey)`, but different `stateChangedAt` timestamps (1000, 2000, 1500). One card has `statusUpdatedAt: 9999` while others omit it.
- **Verify**:
  - Optional `statusUpdatedAt` is ignored.
  - The card with `stateChangedAt: 2000` always wins regardless of array shuffle.
  - Two dropped cards are recorded in `world.diagnostics` with code `'DUPLICATE_CARD_DROPPED'`.
  - No logs emitted.

### Test 6: Zone ID with `::` in Worktree ID (M3)
- **Scenario**: Workspace with `worktreeId: "feature::branch/sub::task"`.
- **Verify**:
  - `createZoneId` encodes properly to `zone:local:worktree:repo:feature%3A%3Abranch%2Fsub%3A%3Atask`.
  - `parseZoneId` correctly reconstitutes `worktreeId: "feature::branch/sub::task"`.

### Test 7: Local $\leftrightarrow$ WSL HostKind Toggle Invariance
- **Scenario**: Card changes `hostKind` from `'local'` to `'wsl'` across snapshots.
- **Verify**: `zoneId`, `employeeId`, and `slotIndex` remain 100% unchanged.

### Test 8: 100% Snapshot Reference Isolation & Deep Freeze (M1 & Lock Item 3)
- **Scenario**:
  - Input snapshot contains nested `review: { number: 42, state: 'open' }`.
  - Deep-freeze input `DashboardSnapshot` with `Object.freeze()`.
  - Execute `world = buildOfficeWorld(snapshot)`.
- **Verify**:
  - `world.zones[0].review` is a separate object (`world.zones[0].review !== snapshot.workspaces[0].review`).
  - Mutating input review has zero effect on `world.zones[0].review`.
  - Zero snapshot references retained in employee or zone structures.

### Test 9: Seating Holder Explicit Clock, TTL Eviction & Stable FloorIndex (Lock Item 4)
- **Scenario**:
  - Zone 1 and Zone 2 created at $t = 0$ with `floorIndex: 0` and `floorIndex: 1`.
  - Zone 1 dissolves at $t = 1000$.
  - At $t = 15 \times 60 \times 1000$ (15 mins), Zone 1 reappears.
    - **Verify**: Zone 1 reclaims `floorIndex: 0`! Zone 2 remains at `floorIndex: 1`.
  - At $t = 35 \times 60 \times 1000$ (35 mins dissolved), run `enforceLimits(currentTimeMs)`.
    - **Verify**: Dissolved zone is evicted after 30-min TTL.
  - Zero calls to `Date.now()`, `setInterval`, or `setTimeout`.

### Test 10: Pod Scaling Beyond 8 Employees
- **Scenario**: Populate zone with 18 employees.
- **Verify**:
  - Pod capacity scales to 20 desks (5 banks of 4).
  - Slots 0 through 17 are placed at exact algebraic $(gridX, gridY)$ coordinates.
  - Coordinates of slots 0–7 are identical to an 8-desk pod.

---

## 10. Milestone Restrictions & Invariants

1. **Pure TypeScript Domain Layer**:
   - Zero Three.js, React Three Fiber (R3F), Canvas, or WebGL in Milestone M2.
   - Zero asset loading (`.glb`, `.gltf`, textures).
2. **Zero Execution Side Effects**:
   - No PTY spawns (`node-pty`), shell processes, or CLI runners.
   - Zero LLM API calls, prompt tokens, or AI network requests.
   - Zero mutations to Orca's existing Zustand store slices.
3. **Release Gate Alignment**:
   - Milestone M7 remains the mandatory release-blocking milestone for real in-office terminal and chat companion.
   - Milestone M8 is reserved for final platform verification and release sign-off.
4. **Git Discipline**:
   - This document is saved locally to `docs/office3d/M2-plan.md` under existing `.gitignore:87:docs/**`.
   - Zero commits, pushes, merges, or worktree modifications will occur without explicit Owner authorization.

---

## 11. Explicit Statement on Architectural Assumptions

**Status**: **ALL ASSUMPTIONS ARE 100% RESOLVED AND LOCKED.**

1. **No Phantom Employees**: Exactly one 3D employee exists per live `DashboardCard`.
2. **No Layout Parsing**: `card.tabId` and `card.leafId` are read directly from the card.
3. **Host Routing Safety**: Unresolvable hosts receive `UNRESOLVED_OWNER_HOST_ID` with `isRoutable: false`, disabling click-through.
4. **Zero State Collisions**: 5-part `ZoneId` isolates hosts, workspace kinds, repos, and worktrees.
5. **Zero Store Churn**: `OfficeWorldSeatingHolder` operates purely at the module level in renderer heap.
6. **Zero Clock Non-Determinism**: All time computations are strictly parameterized via explicit `currentTimeMs`.
7. **Ready for Authorization**: No remaining open questions or unverified assumptions block Milestone M2 implementation.
