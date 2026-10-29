import { useEffect } from 'react'
import {
  Building2,
  ArrowLeft,
  Bot,
  FolderGit2,
  Activity,
  CheckCircle2,
  AlertCircle,
  Layers
} from 'lucide-react'
import { useAppStore } from '@/store'
import { useLiveDashboardSnapshot } from '@/components/dashboard/useLiveDashboardSnapshot'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { translate } from '@/i18n/i18n'

function isEditableElement(target: EventTarget | null): target is HTMLElement {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}

export function Office3DPage(): React.JSX.Element {
  const closeOffice3DPage = useAppStore((s) => s.closeOffice3DPage)
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const snapshot = useLiveDashboardSnapshot()

  // Support Escape key to return to classic view, consistent with other modal pages
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Escape' || event.defaultPrevented) {
        return
      }
      if (isEditableElement(event.target)) {
        return
      }
      event.preventDefault()
      closeOffice3DPage()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closeOffice3DPage])

  const totalCards = snapshot.cards.length
  const attentionCards = snapshot.cards.filter((c) => c.bucket === 'attention')
  const workingCards = snapshot.cards.filter((c) => c.bucket === 'working')
  const idleOrDoneCards = snapshot.cards.filter((c) => c.bucket === 'done' || c.bucket === 'idle')
  const totalWorkspaces = snapshot.workspaces?.length ?? 0

  return (
    <div
      className="flex flex-col flex-1 min-w-0 min-h-0 bg-background text-foreground overflow-y-auto scrollbar-sleek p-6 space-y-6 select-text"
      data-testid="office3d-page-root"
    >
      {/* Top Banner & Navigation */}
      <div className="flex items-center justify-between gap-4 border-b pb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center size-10 rounded-lg bg-primary/10 text-primary">
            <Building2 className="size-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">
                {translate('auto.components.office3d.title', 'Office 3D')}
              </h1>
              <Badge variant="secondary">
                {translate('auto.components.office3d.badgeFoundation', 'M1 Foundation')}
              </Badge>
              <Badge variant="outline">
                {translate('auto.components.office3d.badgeExperimental', 'Experimental')}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {translate(
                'auto.components.office3d.description',
                'DOM-only functional foundation. Terminal workbench and background sessions remain mounted.'
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={closeOffice3DPage}
            data-testid="office3d-return-button"
          >
            <ArrowLeft className="size-4 mr-1.5" />
            <span>
              {translate('auto.components.office3d.returnToClassic', 'Return to Classic View')}
            </span>
          </Button>
        </div>
      </div>

      {/* Metrics Overview */}
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
            {snapshot.cards.map((card) => (
              <div
                key={card.paneKey}
                className="rounded-lg border border-border/60 bg-card p-3 space-y-2 text-xs"
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
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default Office3DPage
