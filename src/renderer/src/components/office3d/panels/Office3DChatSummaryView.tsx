import { MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { OfficeEmployee } from '../model/office-world-types'

export type Office3DChatSummaryViewProps = {
  selectedEmployee: OfficeEmployee
  onFocusAgent: (employee: OfficeEmployee) => void
}

export function Office3DChatSummaryView({
  selectedEmployee,
  onFocusAgent
}: Office3DChatSummaryViewProps): React.JSX.Element {
  return (
    <div className="space-y-3 flex-1 overflow-y-auto scrollbar-sleek">
      <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
        Conversation Summary (Recent Excerpts)
      </div>

      {selectedEmployee.lastUserMessage ? (
        <div className="p-2.5 rounded-lg bg-primary/10 border border-primary/20 text-xs text-foreground space-y-1">
          <div className="text-[10px] font-semibold text-primary">User</div>
          <p className="text-xs leading-relaxed">{selectedEmployee.lastUserMessage}</p>
        </div>
      ) : (
        <div className="p-2.5 rounded-lg bg-muted/40 text-xs text-muted-foreground">
          Task assigned: {selectedEmployee.task}
        </div>
      )}

      {selectedEmployee.lastAgentMessage && (
        <div className="p-2.5 rounded-lg bg-card border border-border/80 text-xs text-foreground space-y-1 shadow-sm">
          <div className="text-[10px] font-semibold text-emerald-400 capitalize">
            {selectedEmployee.agentType || 'Agent'}
          </div>
          <p className="text-xs leading-relaxed whitespace-pre-wrap">
            {selectedEmployee.lastAgentMessage}
          </p>
        </div>
      )}

      {/* Reply in Workbench Action */}
      <div className="space-y-2 pt-2 border-t border-border/50">
        <Button
          size="sm"
          className="w-full"
          onClick={() => onFocusAgent(selectedEmployee)}
          title="Open native chat workbench in Classic View to reply"
        >
          <MessageSquare className="size-3.5 mr-1.5" />
          <span>Open in Classic to Reply</span>
        </Button>
        <p className="text-[10px] text-muted-foreground text-center">
          Full interactive chat and tool dispatch are hosted in the Native Chat workbench
        </p>
      </div>
    </div>
  )
}
