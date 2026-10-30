import {
  FolderGit2,
  Bot,
  Activity,
  AlertCircle,
  CheckCircle2,
  Layers,
  ExternalLink
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { translate } from '@/i18n/i18n'
import type { DashboardSnapshot } from '../../../../../shared/dashboard-snapshot'
import type { OfficeEmployee, OfficeWorld } from '../model/office-world-types'

export type Office3DDomOverviewProps = {
  snapshot: DashboardSnapshot
  activeWorktreeId: string | null
  world: OfficeWorld
  onFocusAgent: (employee: OfficeEmployee) => void
}

export function Office3DDomOverview({
  snapshot,
  activeWorktreeId,
  world,
  onFocusAgent
}: Office3DDomOverviewProps): React.JSX.Element {
  const totalWorkspaces = snapshot.workspaces?.length ?? 0
  const totalCards = snapshot.cards.length
  const workingCards = snapshot.cards.filter((c) => c.bucket === 'working')
  const attentionCards = snapshot.cards.filter((c) => c.bucket === 'attention')
  const idleOrDoneCards = snapshot.cards.filter((c) => c.bucket === 'done' || c.bucket === 'idle')

  return (
    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-sleek p-6 space-y-6">
      {/* Metrics Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between pb-2">
              <CardTitle>
                {translate('auto.components.office3d.workspaces', 'Workspaces')}
              </CardTitle>
              <FolderGit2 className="size-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalWorkspaces}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {translate('auto.components.office3d.activeId', 'Active ID:')}{' '}
              {activeWorktreeId
                ? activeWorktreeId.slice(0, 8)
                : translate('auto.components.office3d.none', 'None')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between pb-2">
              <CardTitle>
                {translate('auto.components.office3d.fleetAgents', 'Fleet Agent Panes')}
              </CardTitle>
              <Bot className="size-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCards}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {translate('auto.components.office3d.liveFleetProcesses', 'Live fleet processes')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between pb-2">
              <CardTitle>{translate('auto.components.office3d.working', 'Working')}</CardTitle>
              <Activity className="size-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{workingCards.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {translate(
                'auto.components.office3d.executingTurnsOrTasks',
                'Executing turns or tasks'
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between pb-2">
              <CardTitle>
                {translate('auto.components.office3d.attentionRequired', 'Attention Required')}
              </CardTitle>
              <AlertCircle className="size-4 text-destructive" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{attentionCards.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {translate(
                'auto.components.office3d.waitingOnApprovalInput',
                'Waiting on approval/input'
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between pb-2">
              <CardTitle>
                {translate('auto.components.office3d.idleOrDone', 'Idle / Done')}
              </CardTitle>
              <CheckCircle2 className="size-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-muted-foreground">{idleOrDoneCards.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {translate('auto.components.office3d.readyForAssignment', 'Ready for assignment')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Foundation Status & Architecture Notice */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Layers className="size-4 text-primary" />
            <CardTitle>
              {translate(
                'auto.components.office3d.retentionVerificationTitle',
                'M1 View Architecture & Retention Foundation'
              )}
            </CardTitle>
          </div>
          <CardDescription>
            {translate(
              'auto.components.office3d.retentionVerificationDesc',
              'This top-level view establishes routing, feature-flag fallback, navigation history, and terminal workbench retention.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-sm space-y-2 text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="size-1.5 rounded-full bg-primary/70 shrink-0" />
              <span>
                {translate(
                  'auto.components.office3d.detailRetention',
                  'Terminal Workbench mounted in DOM (hidden & inert) to keep running PTY and agent sessions alive.'
                )}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="size-1.5 rounded-full bg-primary/70 shrink-0" />
              <span>
                {translate(
                  'auto.components.office3d.detailNav',
                  'Sidebar navigation and project hierarchy fully preserved.'
                )}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="size-1.5 rounded-full bg-primary/70 shrink-0" />
              <span>
                {translate(
                  'auto.components.office3d.detailHistory',
                  'Modal-view history pattern intact; feature flag OFF safely falls back to Classic view.'
                )}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="size-1.5 rounded-full bg-primary/70 shrink-0" />
              <span>
                {translate(
                  'auto.components.office3d.detailM3',
                  'Interactive 3D scene (Three.js/Canvas) will be integrated in subsequent milestones (M3+).'
                )}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Real Live Fleet Agent Breakdown */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold tracking-tight text-foreground flex items-center gap-2">
          <Bot className="size-4" />
          {translate('auto.components.office3d.fleetTitle', 'Live Agent Fleet')} ({totalCards})
        </h2>

        {totalCards === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {translate(
              'auto.components.office3d.noAgents',
              'No active agents running. Launch an agent in Classic view to see its status here.'
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {snapshot.cards.map((card) => {
              const matchingEmp = world.employees.find((e) => e.paneKey === card.paneKey)
              return (
                <div
                  key={card.paneKey}
                  className="rounded-lg border border-border/60 bg-card p-3 space-y-2 text-xs hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold truncate text-foreground">
                      {card.conversationName ||
                        card.task ||
                        translate('auto.components.office3d.agentSession', 'Agent Session')}
                    </div>
                    <Badge
                      variant={
                        card.bucket === 'attention'
                          ? 'destructive'
                          : card.bucket === 'working'
                            ? 'default'
                            : 'secondary'
                      }
                    >
                      {card.bucket}
                    </Badge>
                  </div>
                  <div className="text-muted-foreground truncate">
                    {translate('auto.components.office3d.workspaceLabel', 'Workspace:')}{' '}
                    <span className="text-foreground">{card.worktreeName}</span>
                  </div>
                  <div className="text-muted-foreground truncate">
                    {translate('auto.components.office3d.typeLabel', 'Type:')}{' '}
                    <span className="text-foreground">{card.agentType}</span>
                  </div>
                  {matchingEmp && (
                    <div className="pt-2 border-t border-border/40 flex items-center justify-between">
                      <span className="text-muted-foreground text-[11px]">
                        Desk Slot {matchingEmp.slotIndex + 1}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[11px] text-primary hover:text-primary"
                        disabled={!matchingEmp.isRoutable}
                        onClick={() => onFocusAgent(matchingEmp)}
                      >
                        <ExternalLink className="size-3 mr-1" />
                        <span>Focus</span>
                      </Button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
