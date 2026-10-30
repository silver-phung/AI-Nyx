import { Info, ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type {
  OfficeDesk,
  OfficeEmployee,
  OfficeWorld,
  OfficeZone
} from '../model/office-world-types'

export type Office3DDetailsTabProps = {
  selectedEmployee: OfficeEmployee | null
  selectedDesk: { desk: OfficeDesk; zone: OfficeZone } | null
  world: OfficeWorld
  onFocusAgent: (employee: OfficeEmployee) => void
  onOpenWorkspace: (worktreeId: string) => void
}

export function Office3DDetailsTab({
  selectedEmployee,
  selectedDesk,
  world,
  onFocusAgent,
  onOpenWorkspace
}: Office3DDetailsTabProps): React.JSX.Element {
  if (selectedEmployee) {
    return (
      <div className="space-y-3 text-xs">
        <div className="font-semibold text-sm text-foreground">Agent Inspection Details</div>

        <div className="space-y-2 divide-y divide-border/40">
          <div className="flex items-center justify-between py-1.5">
            <span className="text-muted-foreground">Employee ID:</span>
            <span className="font-mono text-foreground text-[11px] truncate max-w-[180px]">
              {selectedEmployee.employeeId}
            </span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-muted-foreground">Desk Slot:</span>
            <span className="font-mono text-foreground">Slot {selectedEmployee.slotIndex + 1}</span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-muted-foreground">Workspace:</span>
            <span className="font-medium text-foreground truncate max-w-[180px]">
              {world.lookup.zoneById.get(selectedEmployee.zoneId)?.displayName ?? 'Workspace'}
            </span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-muted-foreground">Host Kind:</span>
            <span className="font-medium text-foreground capitalize">
              {world.lookup.zoneById.get(selectedEmployee.zoneId)?.hostKind ?? 'local'}
            </span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-muted-foreground">Agent Engine:</span>
            <span className="font-medium text-foreground capitalize">
              {selectedEmployee.agentType || 'Orca'}
            </span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-muted-foreground">PTY Attached:</span>
            <span className="font-mono text-[11px] text-foreground">
              {selectedEmployee.ptyId ? 'Live' : 'None'}
            </span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-muted-foreground">Routable Workbench:</span>
            <span className="font-medium text-foreground">
              {selectedEmployee.isRoutable ? 'Yes' : 'No'}
            </span>
          </div>
        </div>

        <div className="pt-2">
          <Button
            className="w-full"
            size="sm"
            disabled={!selectedEmployee.isRoutable}
            onClick={() => onFocusAgent(selectedEmployee)}
          >
            <ExternalLink className="size-3.5 mr-1.5" />
            <span>Open Full Session in Classic View</span>
          </Button>
        </div>
      </div>
    )
  }

  if (selectedDesk) {
    return (
      <div className="space-y-3 text-xs">
        <div className="font-semibold text-sm text-foreground">Desk Inspection Details</div>
        <div className="space-y-2 divide-y divide-border/40">
          <div className="flex items-center justify-between py-1.5">
            <span className="text-muted-foreground">Desk ID:</span>
            <span className="font-mono text-foreground text-[11px] truncate max-w-[180px]">
              {selectedDesk.desk.deskId}
            </span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-muted-foreground">Status:</span>
            <Badge variant="outline" className="text-emerald-400 border-emerald-400/40">
              Vacant Slot {selectedDesk.desk.slotIndex + 1}
            </Badge>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-muted-foreground">Zone:</span>
            <span className="font-medium text-foreground truncate max-w-[180px]">
              {selectedDesk.zone.displayName}
            </span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-muted-foreground">Host:</span>
            <span className="font-medium text-foreground capitalize">
              {selectedDesk.zone.hostLabel}
            </span>
          </div>
        </div>
        <div className="pt-2">
          <Button
            className="w-full"
            size="sm"
            onClick={() => onOpenWorkspace(selectedDesk.zone.worktreeId)}
          >
            <ExternalLink className="size-3.5 mr-1.5" />
            <span>Open Workspace in Classic</span>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 text-center text-muted-foreground space-y-2 text-xs">
      <Info className="size-6 mx-auto text-muted-foreground/60" />
      <p>Select any agent character or desk in the 3D scene to inspect full details.</p>
    </div>
  )
}
