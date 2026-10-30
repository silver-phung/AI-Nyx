import { Bot } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { DashboardCard } from '../../../../../shared/dashboard-snapshot'
import type { OfficeEmployee, OfficeWorld } from '../model/office-world-types'

export type Office3DFleetOverviewProps = {
  cards: readonly DashboardCard[]
  world: OfficeWorld
  onSelectEmployee: (employee: OfficeEmployee) => void
}

export function Office3DFleetOverview({
  cards,
  world,
  onSelectEmployee
}: Office3DFleetOverviewProps): React.JSX.Element {
  return (
    <div className="space-y-4">
      <div className="p-3 rounded-lg border border-dashed border-border/80 text-center space-y-2">
        <Bot className="size-8 mx-auto text-primary/70" />
        <div className="text-xs font-semibold text-foreground">Live Fleet Overview</div>
        <p className="text-[11px] text-muted-foreground">
          Click any 3D agent character in the Moonlight Campus to inspect its live chat session.
        </p>
      </div>

      {cards.length > 0 && (
        <div className="space-y-2">
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Active Agents ({cards.length})
          </div>
          <div className="space-y-1.5">
            {cards.map((card) => {
              const emp = world.employees.find((e) => e.paneKey === card.paneKey)
              return (
                <button
                  key={card.paneKey}
                  type="button"
                  className="w-full text-left p-2.5 rounded-lg border border-border/60 bg-muted/20 hover:bg-muted/50 transition-colors space-y-1"
                  onClick={() => {
                    if (emp) {
                      onSelectEmployee(emp)
                    }
                  }}
                >
                  <div className="flex items-center justify-between gap-1 text-xs">
                    <span className="font-medium text-foreground truncate max-w-[180px]">
                      {card.conversationName || card.task || 'Agent Session'}
                    </span>
                    <Badge
                      variant={
                        card.bucket === 'attention'
                          ? 'destructive'
                          : card.bucket === 'working'
                            ? 'default'
                            : 'secondary'
                      }
                      className="text-[9px] py-0"
                    >
                      {card.bucket}
                    </Badge>
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {card.worktreeName} · <span className="capitalize">{card.agentType}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
