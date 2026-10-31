import { Building2, Gauge, ArrowLeft } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'

export type Office3DHeaderProps = {
  hasWebGL: boolean
  activeTab: '3d' | 'dom'
  setActiveTab: (tab: '3d' | 'dom') => void
  qualityMode: 'high' | 'low'
  setQualityMode: React.Dispatch<React.SetStateAction<'high' | 'low'>>
  fpsBadgeRef: React.RefObject<HTMLDivElement | null>
  onClose: () => void
}

export function Office3DHeader({
  hasWebGL,
  activeTab,
  setActiveTab,
  qualityMode,
  setQualityMode,
  fpsBadgeRef,
  onClose
}: Office3DHeaderProps): React.JSX.Element {
  return (
    <header className="flex items-center justify-between gap-3 px-4 py-2 border-b border-border/60 bg-card/70 shrink-0 h-12 whitespace-nowrap">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex items-center justify-center size-8 rounded-lg bg-primary/10 text-primary">
          <Building2 className="size-5" />
        </div>
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-bold tracking-tight text-foreground">
            {translate('auto.components.office3d.title', 'Office 3D')}
          </h1>
          <Badge variant="secondary" className="text-[10px] py-0 hidden xl:inline-flex">
            {hasWebGL && activeTab === '3d'
              ? 'Moonlight Campus Preview'
              : translate('auto.components.office3d.badgeFoundation', 'M1 Foundation')}
          </Badge>
          <Badge
            variant="outline"
            className="border-primary/50 text-primary text-[10px] py-0 hidden 2xl:inline-flex"
          >
            Pantheon-inspired 3D
          </Badge>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {hasWebGL && (
          <div className="flex items-center bg-muted/60 p-0.5 rounded-lg border border-border/50 text-xs mr-2">
            <button
              type="button"
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                activeTab === '3d'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setActiveTab('3d')}
            >
              3D Office
            </button>
            <button
              type="button"
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                activeTab === 'dom'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setActiveTab('dom')}
            >
              DOM Overview
            </button>
          </div>
        )}

        {activeTab === '3d' && hasWebGL && (
          <div className="flex items-center gap-2 mr-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs px-2"
              onClick={() => setQualityMode((q) => (q === 'high' ? 'low' : 'high'))}
              title={
                qualityMode === 'high'
                  ? 'Rendering Quality: High (Targeting uncapped framerate). Click to switch to Low power mode.'
                  : 'Rendering Quality: Low (Power-saver throttled). Click to switch to High quality.'
              }
            >
              <Gauge className="size-3 mr-1" />
              <span>{qualityMode === 'high' ? 'High' : 'Low'}</span>
            </Button>
            <div
              ref={fpsBadgeRef}
              data-testid="office3d-fps-badge"
              title="Measured rendering performance (live frames per second)"
              className="text-[11px] font-mono px-2 py-0.5 rounded bg-muted/50 border border-border/40 text-muted-foreground"
            >
              -- FPS
            </div>
          </div>
        )}

        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs px-2.5"
          onClick={onClose}
          data-testid="office3d-return-button"
        >
          <ArrowLeft className="size-3.5 mr-1" />
          <span>
            {translate('auto.components.office3d.returnToClassic', 'Return to Classic View')}
          </span>
        </Button>
      </div>
    </header>
  )
}
