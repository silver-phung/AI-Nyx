import type { DashboardCard } from '../../../../../shared/dashboard-snapshot'
import { UNRESOLVED_OWNER_HOST_ID } from '../../../../../shared/execution-host'
import type { DeskId, EmployeeId, OfficeDesk, ZoneId } from './office-world-types'
import { createEmployeeId, deterministicCompareStrings } from './office-identity'

export function getDeskGridCoordinates(slotIndex: number): { gridX: number; gridY: number } {
  const bank = Math.floor(slotIndex / 4)
  const posInBank = slotIndex % 4
  const gridX = posInBank < 2 ? -1 : 1
  const gridY = bank * 2 + (posInBank % 2)
  return { gridX, gridY }
}

export interface ZoneSeatingAllocation {
  readonly capacity: number
  readonly desks: readonly OfficeDesk[]
  readonly employeeSeats: ReadonlyMap<EmployeeId, number>
}

export function allocateZoneDesks(
  zoneId: ZoneId,
  cards: readonly DashboardCard[],
  previousSeatMap: ReadonlyMap<EmployeeId, number> | undefined,
  previousCapacity: number = 4
): ZoneSeatingAllocation {
  const survivingEmployees: Array<{ card: DashboardCard; slotIndex: number }> = []
  const unassignedCards: DashboardCard[] = []
  const occupiedSlots = new Set<number>()

  // 1. Identify surviving employees and keep their exact slots
  for (const card of cards) {
    const hostId = card.executionHostId ?? UNRESOLVED_OWNER_HOST_ID
    const empId = createEmployeeId(hostId, card.paneKey)
    const previousSlot = previousSeatMap?.get(empId)
    if (previousSlot !== undefined) {
      survivingEmployees.push({ card, slotIndex: previousSlot })
      occupiedSlots.add(previousSlot)
    } else {
      unassignedCards.push(card)
    }
  }

  // 2. Base capacity: at least previousCapacity, at least enough for all surviving slots, at least 4, multiples of 4
  const maxSurvivingSlot = survivingEmployees.reduce((max, e) => Math.max(max, e.slotIndex), -1)
  let capacity = Math.max(previousCapacity, Math.ceil((maxSurvivingSlot + 1) / 4) * 4, 4)

  // 3. Available desk pool (H1): all unoccupied slots in [0, capacity)
  const availableSlots: number[] = []
  for (let s = 0; s < capacity; s++) {
    if (!occupiedSlots.has(s)) {
      availableSlots.push(s)
    }
  }

  // 4. Sort new arrivals deterministically
  unassignedCards.sort((a, b) => {
    if (a.startedAt !== b.startedAt) return a.startedAt - b.startedAt
    const aHost = a.executionHostId ?? UNRESOLVED_OWNER_HOST_ID
    const bHost = b.executionHostId ?? UNRESOLVED_OWNER_HOST_ID
    const aId = createEmployeeId(aHost, a.paneKey)
    const bId = createEmployeeId(bHost, b.paneKey)
    return deterministicCompareStrings(aId, bId)
  })

  // 5. Assign arrivals to lowest available slots; expand capacity by banks of 4 when exhausted
  const finalEmployeeSeats = new Map<EmployeeId, number>()
  for (const { card, slotIndex } of survivingEmployees) {
    const hostId = card.executionHostId ?? UNRESOLVED_OWNER_HOST_ID
    finalEmployeeSeats.set(createEmployeeId(hostId, card.paneKey), slotIndex)
  }

  for (const card of unassignedCards) {
    const hostId = card.executionHostId ?? UNRESOLVED_OWNER_HOST_ID
    const empId = createEmployeeId(hostId, card.paneKey)
    if (availableSlots.length === 0) {
      const oldCap = capacity
      capacity += 4
      for (let s = oldCap; s < capacity; s++) {
        availableSlots.push(s)
      }
    }
    const assignedSlot = availableSlots.shift()!
    finalEmployeeSeats.set(empId, assignedSlot)
  }

  // 6. Build the complete list of OfficeDesk objects for the zone
  const employeeBySlot = new Map<number, EmployeeId>()
  for (const [empId, slot] of finalEmployeeSeats) {
    employeeBySlot.set(slot, empId)
  }

  const desks: OfficeDesk[] = []
  for (let s = 0; s < capacity; s++) {
    const { gridX, gridY } = getDeskGridCoordinates(s)
    const empId = employeeBySlot.get(s) ?? null
    desks.push({
      deskId: `${zoneId}::desk-${s}` as DeskId,
      zoneId,
      slotIndex: s,
      gridX,
      gridY,
      employeeId: empId,
      isOccupied: empId !== null
    })
  }

  return {
    capacity,
    desks,
    employeeSeats: finalEmployeeSeats
  }
}
