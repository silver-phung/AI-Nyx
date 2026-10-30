import type { EmployeeId, ZoneId } from './office-world-types'
import { parseZoneId } from './office-identity'

export interface ZoneSeatingRecord {
  readonly floorIndex: number
  readonly capacity: number
  readonly seatMap: ReadonlyMap<EmployeeId, number>
  readonly lastActiveAt: number
}

export interface SerializableSeatingState {
  readonly nextFloorIndex: number
  readonly zones: Record<
    string,
    {
      floorIndex: number
      capacity: number
      seats: Record<string, number>
      lastActiveAt: number
    }
  >
}

export class OfficeWorldSeatingHolder {
  private static instance: OfficeWorldSeatingHolder | null = null
  private readonly zoneRecords = new Map<ZoneId, ZoneSeatingRecord>()
  private readonly zoneFloorIndices = new Map<ZoneId, number>()
  private readonly usedFloorIndices = new Set<number>()

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

  /** Allocates or reclaims a persistent, non-overlapping floorIndex for any zone (active or waiting) */
  public allocateFloorIndex(zoneId: ZoneId): number {
    const existing =
      this.zoneFloorIndices.get(zoneId) ?? this.zoneRecords.get(zoneId)?.floorIndex
    if (existing !== undefined) {
      this.zoneFloorIndices.set(zoneId, existing)
      this.usedFloorIndices.add(existing)
      return existing
    }
    let candidate = 0
    while (this.usedFloorIndices.has(candidate)) {
      candidate++
    }
    this.usedFloorIndices.add(candidate)
    this.zoneFloorIndices.set(zoneId, candidate)
    return candidate
  }

  /** Updates zone record with EXPLICIT clock input. Zero Date.now() or hidden timers. */
  public setZoneRecord(
    zoneId: ZoneId,
    record: ZoneSeatingRecord,
    currentTimeMs: number
  ): void {
    this.zoneRecords.set(zoneId, record)
    this.zoneFloorIndices.set(zoneId, record.floorIndex)
    this.usedFloorIndices.add(record.floorIndex)
    this.enforceLimits(currentTimeMs)
  }

  /** Prunes zones that no longer exist in Orca's active workspace records */
  public pruneStaleWorkspaces(activeWorkspaceKeys: ReadonlySet<string>): void {
    for (const [zoneId] of this.zoneRecords) {
      const parsed = parseZoneId(zoneId)
      if (parsed) {
        const key = `${parsed.repoId}::${parsed.worktreeId}`
        if (!activeWorkspaceKeys.has(key)) {
          const floorIndex = this.zoneFloorIndices.get(zoneId)
          if (floorIndex !== undefined) {
            this.usedFloorIndices.delete(floorIndex)
            this.zoneFloorIndices.delete(zoneId)
          }
          this.zoneRecords.delete(zoneId)
        }
      }
    }

    for (const [zoneId] of this.zoneFloorIndices) {
      const parsed = parseZoneId(zoneId)
      if (parsed) {
        const key = `${parsed.repoId}::${parsed.worktreeId}`
        if (!activeWorkspaceKeys.has(key)) {
          const floorIndex = this.zoneFloorIndices.get(zoneId)
          if (floorIndex !== undefined) {
            this.usedFloorIndices.delete(floorIndex)
          }
          this.zoneFloorIndices.delete(zoneId)
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
      const oldest = Array.from(this.zoneRecords.entries()).sort(
        ([, a], [, b]) => a.lastActiveAt - b.lastActiveAt
      )[0]
      if (oldest) {
        this.zoneRecords.delete(oldest[0])
      }
    }
  }

  /** Clears memory (used for tests or app reload) */
  public reset(): void {
    this.zoneRecords.clear()
    this.zoneFloorIndices.clear()
    this.usedFloorIndices.clear()
  }
}
