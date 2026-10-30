import type { OfficeEmployee } from '../model/office-world-types'

export type Office3DOutputTabProps = {
  selectedEmployee: OfficeEmployee | null
}

export function Office3DOutputTab({ selectedEmployee }: Office3DOutputTabProps): React.JSX.Element {
  return (
    <div className="flex flex-col h-full overflow-hidden p-3 font-mono text-xs">
      <div className="flex items-center justify-between pb-2 border-b border-border/40 text-muted-foreground text-[11px] shrink-0">
        <span>
          Task Summary ·{' '}
          {selectedEmployee?.agentType ? `${selectedEmployee.agentType} Engine` : 'Workspace'}
        </span>
        <span className="text-muted-foreground text-[10px]">
          Summary View (No raw stdout stream attached)
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-sleek py-2 space-y-2 text-muted-foreground">
        {selectedEmployee ? (
          <>
            <div className="space-y-1">
              <span className="text-[10px] font-semibold uppercase text-foreground/80">
                [Task Prompt]
              </span>
              <div className="p-2 rounded bg-muted/30 text-foreground font-sans text-xs">
                {selectedEmployee.task || 'No prompt recorded'}
              </div>
            </div>
            {selectedEmployee.lastUserMessage && (
              <div className="space-y-1">
                <span className="text-[10px] font-semibold uppercase text-blue-400">
                  [Last User Input]
                </span>
                <div className="p-2 rounded bg-blue-500/10 border border-blue-500/20 text-blue-300 font-sans text-xs">
                  {selectedEmployee.lastUserMessage}
                </div>
              </div>
            )}
            {selectedEmployee.lastAgentMessage && (
              <div className="space-y-1">
                <span className="text-[10px] font-semibold uppercase text-emerald-400">
                  [Last Agent Response]
                </span>
                <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 font-sans text-xs">
                  {selectedEmployee.lastAgentMessage}
                </div>
              </div>
            )}
            <div className="text-muted-foreground/60 italic pt-2 text-[11px]">
              -- Raw process stdout/stderr stream requires full interactive workbench. Click
              &quot;Focus in Classic&quot; to inspect live stream. --
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Select an agent to inspect its task summary.
          </div>
        )}
      </div>
    </div>
  )
}
