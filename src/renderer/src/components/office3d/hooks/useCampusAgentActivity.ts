import { useEffect, useMemo, useRef } from 'react'
import { useAppStore } from '@/store'
import {
  createCampusAgentActivityAdapter,
  type CampusAgentActivityAdapter,
  type CampusAgentObservation
} from '../model/campus-agent-activity'
import { campusEventBus } from '../scene/campus/campus-events'
import type { OfficeWorld } from '../model/office-world-types'
import type { AgentStatusEntry } from '../../../../../shared/agent-status-types'

const NO_STATUS: Record<string, AgentStatusEntry> = Object.freeze({})

/** Forwards live Orca agent status for employees on the campus as `source: 'orca'` events. */
export function useCampusAgentActivity(world: OfficeWorld): void {
  const agentStatusByPaneKey = useAppStore((s) => s.agentStatusByPaneKey ?? NO_STATUS)
  const observations = useMemo(() => {
    const out: CampusAgentObservation[] = []
    for (const employee of world.employees) {
      const status = agentStatusByPaneKey[employee.paneKey]
      if (status) {
        out.push({ employeeId: employee.employeeId, status })
      }
    }
    return out
  }, [world.employees, agentStatusByPaneKey])

  const adapterRef = useRef<CampusAgentActivityAdapter | null>(null)
  const observationsRef = useRef(observations)
  observationsRef.current = observations

  useEffect(() => {
    const adapter = createCampusAgentActivityAdapter(campusEventBus)
    adapterRef.current = adapter
    adapter.sync(observationsRef.current)
    return () => {
      adapterRef.current = null
      adapter.dispose()
    }
  }, [])

  useEffect(() => {
    adapterRef.current?.sync(observations)
  }, [observations])
}
