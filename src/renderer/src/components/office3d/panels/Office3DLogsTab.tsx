import { Badge } from '@/components/ui/badge'
import type { CampusActivityEvent } from '../scene/campus/campus-events'

export type Office3DLogsTabProps = {
  campusEvents: readonly CampusActivityEvent[]
}

export function Office3DLogsTab({ campusEvents }: Office3DLogsTabProps): React.JSX.Element {
  return (
    <div className="flex flex-col h-full overflow-hidden p-3 font-mono text-xs">
      <div className="flex items-center justify-between pb-2 border-b border-border/40 text-muted-foreground text-[11px] shrink-0">
        <span>Campus Event Bus ({campusEvents.length} events logged)</span>
        <div className="flex items-center gap-1.5 text-[10px]">
          <span className="size-1.5 rounded-full bg-amber-400/80" />
          <span className="text-muted-foreground font-sans">Orca event source not connected</span>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-sleek py-2 space-y-1.5">
        {campusEvents.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground text-xs space-y-1.5">
            <p className="font-medium text-foreground">Orca event source not connected</p>
            <p className="text-[11px] text-muted-foreground/80 max-w-md mx-auto">
              System events (Git pushes, test runs, and code reviews) are not forwarded to Office
              3D. DEV PREVIEW events will be logged here when simulated campus actors trigger
              activity.
            </p>
          </div>
        ) : (
          campusEvents.map((evt) => (
            <div
              key={`${evt.activityId}-${evt.occurredAt}-${evt.status}`}
              className="flex items-center gap-2 text-[11px]"
            >
              <span className="text-muted-foreground">
                [{new Date(evt.occurredAt).toLocaleTimeString()}]
              </span>
              <Badge
                variant={evt.source === 'orca' ? 'default' : 'outline'}
                className="text-[9px] py-0 uppercase"
              >
                {evt.source === 'orca' ? 'REAL' : 'DEV PREVIEW'}
              </Badge>
              <span className="font-semibold text-foreground">{evt.kind}:</span>
              <span className="text-muted-foreground truncate max-w-[200px]">
                {evt.detail || evt.employeeId}
              </span>
              <Badge
                variant={
                  evt.status === 'succeeded'
                    ? 'secondary'
                    : evt.status === 'failed'
                      ? 'destructive'
                      : 'outline'
                }
                className="text-[9px] py-0 ml-auto capitalize"
              >
                {evt.status}
              </Badge>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
