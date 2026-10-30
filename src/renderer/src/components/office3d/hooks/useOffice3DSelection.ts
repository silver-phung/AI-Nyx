import { useCallback, useEffect, useState } from 'react'
import type {
  OfficeDesk,
  OfficeEmployee,
  OfficeWorld,
  OfficeZone
} from '../model/office-world-types'
import type { DashboardSnapshot } from '../../../../../shared/dashboard-snapshot'

export type Office3DSelection = {
  selectedEmployee: OfficeEmployee | null
  selectedDesk: { desk: OfficeDesk; zone: OfficeZone } | null
  selectedZone: OfficeZone | null
  handleSelectEmployee: (employee: OfficeEmployee | null) => void
  handleSelectDesk: (desk: OfficeDesk, zone: OfficeZone) => void
  handleSelectZone: (zone: OfficeZone) => void
  handleClearSelection: () => void
}

export function useOffice3DSelection(
  world: OfficeWorld,
  snapshot: DashboardSnapshot,
  isDevOrTest: boolean
): Office3DSelection {
  const [selectedEmployee, setSelectedEmployee] = useState<OfficeEmployee | null>(null)
  const [selectedDesk, setSelectedDesk] = useState<{ desk: OfficeDesk; zone: OfficeZone } | null>(
    null
  )
  const [selectedZone, setSelectedZone] = useState<OfficeZone | null>(null)

  const handleSelectDesk = useCallback((desk: OfficeDesk, zone: OfficeZone) => {
    setSelectedDesk({ desk, zone })
    setSelectedEmployee(null)
    setSelectedZone(null)
  }, [])

  const handleSelectZone = useCallback((zone: OfficeZone) => {
    setSelectedZone(zone)
    setSelectedEmployee(null)
    setSelectedDesk(null)
  }, [])

  const handleSelectEmployee = useCallback((employee: OfficeEmployee | null) => {
    setSelectedEmployee(employee)
    if (employee) {
      setSelectedDesk(null)
      setSelectedZone(null)
    }
  }, [])

  const handleClearSelection = useCallback(() => {
    setSelectedEmployee(null)
    setSelectedDesk(null)
    setSelectedZone(null)
  }, [])

  // Sync selected employee if snapshot updates; clear if session removed
  useEffect(() => {
    if (selectedEmployee) {
      const updated = world.lookup.employeeById.get(selectedEmployee.employeeId)
      if (updated) {
        setSelectedEmployee(updated)
      } else {
        const stillInSnapshot = snapshot.cards.some((c) => c.paneKey === selectedEmployee.paneKey)
        if (!stillInSnapshot) {
          setSelectedEmployee(null)
        }
      }
    }
  }, [world, selectedEmployee, snapshot.cards])

  // Dev & test bridge on window for synthetic interaction
  useEffect(() => {
    if (typeof window !== 'undefined' && isDevOrTest) {
      // oxlint-disable-next-line typescript/consistent-type-assertions
      ;(window as unknown as { __OFFICE3D_BRIDGE__?: unknown }).__OFFICE3D_BRIDGE__ = {
        selectEmployee: handleSelectEmployee,
        selectDesk: handleSelectDesk,
        selectZone: handleSelectZone,
        clearSelection: handleClearSelection,
        getSelectedEmployee: () => selectedEmployee,
        getSelectedDesk: () => selectedDesk,
        getSelectedZone: () => selectedZone
      }
      return () => {
        delete (window as unknown as { __OFFICE3D_BRIDGE__?: unknown }).__OFFICE3D_BRIDGE__
      }
    }
    return undefined
  }, [
    handleSelectEmployee,
    handleSelectDesk,
    handleSelectZone,
    handleClearSelection,
    selectedEmployee,
    selectedDesk,
    selectedZone,
    isDevOrTest
  ])

  return {
    selectedEmployee,
    selectedDesk,
    selectedZone,
    handleSelectEmployee,
    handleSelectDesk,
    handleSelectZone,
    handleClearSelection
  }
}
