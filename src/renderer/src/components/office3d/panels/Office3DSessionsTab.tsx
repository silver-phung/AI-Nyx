import { useState } from 'react'
import { Search, ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { DashboardCard } from '../../../../../shared/dashboard-snapshot'
import type { OfficeEmployee, OfficeWorld } from '../model/office-world-types'

export type Office3DSessionsTabProps = {
  cards: readonly DashboardCard[]
  selectedEmployee: OfficeEmployee | null
  onSelectEmployee: (employee: OfficeEmployee) => void
  onFocusAgent: (employee: OfficeEmployee) => void
  world: OfficeWorld
}

export function Office3DSessionsTab({
  cards,
  selectedEmployee,
  onSelectEmployee,
  onFocusAgent,
  world
}: Office3DSessionsTabProps): React.JSX.Element {
  const [historySearchFilter, setHistorySearchFilter] = useState('')

  const filteredCards = cards.filter((c) => {
    if (!historySearchFilter) {
      return true
    }
    const query = historySearchFilter.toLowerCase()
    return (
      (c.conversationName || c.task || '').toLowerCase().includes(query) ||
      c.worktreeName.toLowerCase().includes(query)
    )
  })

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="size-3.5 absolute left-2.5 top-2.5 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={historySearchFilter}
          onChange={(e) => setHistorySearchFilter(e.target.value)}
          placeholder="Filter active sessions..."
          className="w-full h-8 pl-8 pr-2.5 rounded-md bg-muted/40 border border-border/60 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <div className="space-y-1.5">
        {filteredCards.map((card) => {
          const emp = world.employees.find((e) => e.paneKey === card.paneKey)
          const isSelected = selectedEmployee?.paneKey === card.paneKey
          return (
            <div
              key={card.paneKey}
              data-testid="office3d-session-card"
              data-agent-title={card.conversationName || card.task || 'Agent Session'}
              className={`p-2.5 rounded-lg border transition-all space-y-1.5 ${
                isSelected
                  ? 'border-primary bg-primary/5 shadow-sm'
                  : 'border-border/60 bg-muted/20 hover:border-border'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium text-xs text-foreground truncate">
                  {card.conversationName || card.task || 'Agent Session'}
                </span>
                <Badge variant="outline" className="text-[9px] py-0 shrink-0">
                  {card.bucket}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{card.worktreeName}</span>
                <span className="capitalize">{card.agentType}</span>
              </div>
              <div className="pt-1 flex items-center justify-between gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => {
                    if (emp) {
                      onSelectEmployee(emp)
                    }
                  }}
                >
                  Select in 3D
                </Button>
                {emp && emp.isRoutable && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px] text-primary hover:text-primary"
                    onClick={() => onFocusAgent(emp)}
                  >
                    <ExternalLink className="size-3 mr-1" />
                    <span>Open</span>
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
