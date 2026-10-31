import { lazy, Suspense } from 'react'
import { Sparkles, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { STATUS_COLORS } from '../scene/OfficeTheme'
import type {
  OfficeDesk,
  OfficeEmployee,
  OfficeWorld,
  OfficeZone
} from '../model/office-world-types'

const Office3DCanvas = lazy(() =>
  import('../scene/Office3DCanvas').then((m) => ({ default: m.Office3DCanvas }))
)

export type Office3DViewportProps = {
  world: OfficeWorld
  selectedEmployee: OfficeEmployee | null
  selectedDesk: { desk: OfficeDesk; zone: OfficeZone } | null
  selectedZone: OfficeZone | null
  onSelectEmployee: (employee: OfficeEmployee | null) => void
  onSelectDesk: (desk: OfficeDesk, zone: OfficeZone) => void
  onFocusEmployee: (employee: OfficeEmployee) => void
  onSelectZone: (zone: OfficeZone) => void
  onClearSelection: () => void
  qualityMode: 'high' | 'low'
  onFpsUpdate: (fps: number) => void
  onFallbackToDom: () => void
}

export function Office3DViewport({
  world,
  selectedEmployee,
  selectedDesk,
  selectedZone,
  onSelectEmployee,
  onSelectDesk,
  onFocusEmployee,
  onSelectZone,
  onClearSelection,
  qualityMode,
  onFpsUpdate,
  onFallbackToDom
}: Office3DViewportProps): React.JSX.Element {
  return (
    <div className="relative flex-1 min-h-[220px] overflow-hidden bg-slate-950">
      <Suspense
        fallback={
          <div className="flex flex-col items-center justify-center w-full h-full min-h-[300px] bg-slate-950 text-slate-400 space-y-3">
            <div className="size-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <span className="text-xs">Initializing Moonlight Campus 3D...</span>
          </div>
        }
      >
        <Office3DCanvas
          world={world}
          selectedEmployee={selectedEmployee}
          selectedDesk={selectedDesk}
          selectedZone={selectedZone}
          onSelectEmployee={onSelectEmployee}
          onSelectDesk={onSelectDesk}
          onFocusEmployee={onFocusEmployee}
          onSelectZone={onSelectZone}
          onClearSelection={onClearSelection}
          qualityMode={qualityMode}
          onFpsUpdate={onFpsUpdate}
          onFallbackToDom={onFallbackToDom}
        />
      </Suspense>

      {/* Floating Instructions Pill (bottom: the campus camera toolbar owns the top-left corner) */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex max-w-[calc(100%-1.5rem)] items-center gap-2 px-3 py-1.5 rounded-full whitespace-nowrap bg-slate-900/80 backdrop-blur-md border border-slate-700/60 text-[11px] text-slate-300 pointer-events-none select-none shadow-md">
        <Sparkles className="size-3 text-primary animate-pulse" />
        <span className="truncate">
          Click any 3D agent character to select Chat & Terminal. Double-click to open.
        </span>
      </div>

      {/* Selected agent active indicator chip (top right) */}
      {selectedEmployee && (
        <div className="absolute top-3 right-3 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card/90 backdrop-blur-md border border-border/80 shadow-lg text-xs">
          <div
            className="size-2 rounded-full"
            style={{
              backgroundColor: STATUS_COLORS[selectedEmployee.displayState]?.primary ?? '#60a5fa'
            }}
          />
          <span className="font-semibold text-foreground truncate max-w-[180px]">
            {selectedEmployee.task || 'Agent Session'}
          </span>
          <Badge variant="outline" className="text-[10px] uppercase font-mono py-0">
            Slot {selectedEmployee.slotIndex + 1}
          </Badge>
          <button
            type="button"
            className="p-1 rounded text-muted-foreground hover:text-foreground"
            onClick={onClearSelection}
            title="Clear selection"
          >
            <X className="size-3" />
          </button>
        </div>
      )}
    </div>
  )
}
