import { Component, memo, type ErrorInfo, type ReactNode, useEffect, useRef, useState } from 'react'
import { Canvas, useFrame, type RootState } from '@react-three/fiber'
import * as THREE from 'three'
import { AlertTriangle, RefreshCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type {
  OfficeDesk,
  OfficeEmployee,
  OfficeWorld,
  OfficeZone
} from '../model/office-world-types'
import { Office3DScene } from './Office3DScene'
import { CAMPUS_ZONES, STUDIO_ZONE, type CampusZoneId } from './campus/campus-layout'
import type { CampusViewPreset } from './campus/campus-view'
import { campusEventBus } from './campus/campus-events'
import { startDevPreview } from './campus/campus-preview'

type ErrorBoundaryProps = {
  readonly children: ReactNode
  readonly onFallback: () => void
}

type ErrorBoundaryState = {
  readonly hasError: boolean
  readonly error: Error | null
}

class WebGLErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public override state: ErrorBoundaryState = {
    hasError: false,
    error: null
  }

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    void error
    void errorInfo
  }

  public override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-4 bg-muted/20 rounded-xl border border-destructive/30">
          <AlertTriangle className="size-10 text-destructive" />
          <div className="space-y-1">
            <h3 className="font-semibold text-lg">3D Acceleration Unavailable</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              WebGL rendering encountered an issue. You can retry initialization or view your live
              agents in the DOM overview.
            </p>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              <RefreshCcw className="size-4 mr-1.5" />
              Retry 3D Render
            </Button>
            <Button variant="secondary" size="sm" onClick={this.props.onFallback}>
              Switch to DOM View
            </Button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// Lightweight inner FPS monitor
function FpsTracker({ onFpsUpdate }: { onFpsUpdate: (fps: number) => void }) {
  const frameCount = useRef(0)
  const lastTime = useRef<number | null>(null)

  useFrame(() => {
    frameCount.current++
    const now = performance.now()
    lastTime.current ??= now
    if (now - lastTime.current >= 500) {
      const delta = (now - lastTime.current) / 1000
      const currentFps = Math.round(frameCount.current / delta)
      onFpsUpdate(currentFps)
      frameCount.current = 0
      lastTime.current = now
    }
  })

  return null
}

type Office3DCanvasProps = {
  readonly world: OfficeWorld
  readonly selectedEmployee: OfficeEmployee | null
  readonly selectedDesk?: { desk: OfficeDesk; zone: OfficeZone } | null
  readonly selectedZone?: OfficeZone | null
  readonly onSelectEmployee: (employee: OfficeEmployee | null) => void
  readonly onSelectDesk?: (desk: OfficeDesk, zone: OfficeZone) => void
  readonly onFocusEmployee?: (employee: OfficeEmployee) => void
  readonly onSelectZone?: (zone: OfficeZone) => void
  readonly onClearSelection?: () => void
  readonly qualityMode: 'high' | 'low'
  readonly onFpsUpdate?: (fps: number) => void
  readonly onFallbackToDom: () => void
}

export const Office3DCanvas = memo(function Office3DCanvas({
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
}: Office3DCanvasProps) {
  const [isContextLost, setIsContextLost] = useState(false)
  const [viewPreset, setViewPreset] = useState<CampusViewPreset>('cinematic')
  const [focusZoneId, setFocusZoneId] = useState<CampusZoneId | null>(null)
  const [viewNonce, setViewNonce] = useState(0)
  const [devPreview, setDevPreview] = useState(false)
  const [isDocumentVisible, setIsDocumentVisible] = useState(
    typeof document !== 'undefined' ? document.visibilityState === 'visible' : true
  )

  const r3fRef = useRef<RootState | null>(null)
  const canvasCleanupRef = useRef<(() => void) | null>(null)

  // Release debug global and WebGL listeners when this canvas unmounts.
  useEffect(() => {
    return () => {
      canvasCleanupRef.current?.()
    }
  }, [])

  // Pause rendering only while the page is truly hidden (minimised / occluded / tab hidden).
  // Losing focus alone keeps rendering. On every wake-up signal we re-read the real state
  // and explicitly restart the loop, so a missed visibilitychange can never leave it frozen.
  useEffect(() => {
    const sync = (): void => {
      const visible = document.visibilityState === 'visible'
      setIsDocumentVisible(visible)
      const root = r3fRef.current
      if (visible && root) {
        // onCreated hands us a creation-time snapshot; read the live store so the check sees the current frameloop.
        const live = root.get()
        if (live.frameloop !== 'always') {
          live.setFrameloop('always')
        }
        live.invalidate()
      }
    }
    document.addEventListener('visibilitychange', sync)
    window.addEventListener('focus', sync)
    window.addEventListener('pageshow', sync)
    return () => {
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('focus', sync)
      window.removeEventListener('pageshow', sync)
    }
  }, [])

  // Dev preview: clearly synthetic activity, isolated from real Orca sessions.
  useEffect(() => {
    if (!devPreview) {
      return undefined
    }
    return startDevPreview(campusEventBus)
  }, [devPreview])

  const dpr = qualityMode === 'high' ? [1, 1.5] : 1
  const shadows = qualityMode === 'high' ? { type: THREE.PCFShadowMap } : false

  return (
    <WebGLErrorBoundary onFallback={onFallbackToDom}>
      <div
        className="relative w-full h-full min-h-[400px] overflow-hidden rounded-xl bg-slate-950 border border-border/50"
        data-testid="office3d-canvas-container"
      >
        {isContextLost && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/85 backdrop-blur-sm text-center p-4">
            <AlertTriangle className="size-8 text-amber-400 mb-2" />
            <p className="text-sm font-medium text-slate-200">WebGL Context Restoring...</p>
          </div>
        )}
        {/* Campus controls: view presets, zone fly-to, dev preview toggle. */}
        <div className="absolute top-3 left-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-1.5 text-[11px]">
          {(
            [
              ['cinematic', 'Cinematic'],
              ['isometric', 'Isometric']
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              data-testid={`campus-view-${id}`}
              className={`rounded-full border px-2.5 py-1 backdrop-blur-md transition-colors ${
                viewPreset === id && focusZoneId === null
                  ? 'border-indigo-300/70 bg-indigo-500/30 text-white'
                  : 'border-slate-600/60 bg-slate-950/70 text-slate-200 hover:bg-slate-800/80'
              }`}
              onClick={() => {
                setViewPreset(id)
                setFocusZoneId(null)
                setViewNonce((n) => n + 1)
              }}
            >
              {label}
            </button>
          ))}
          <span className="mx-1 h-4 w-px bg-slate-600/60" />
          {[STUDIO_ZONE, ...Object.values(CAMPUS_ZONES)].map((zone) => (
            <button
              key={zone.id}
              type="button"
              data-testid={`campus-zone-${zone.id}`}
              className={`rounded-full border px-2.5 py-1 backdrop-blur-md transition-colors ${
                focusZoneId === zone.id
                  ? 'border-white/60 bg-white/15 text-white'
                  : 'border-slate-600/60 bg-slate-950/70 text-slate-200 hover:bg-slate-800/80'
              }`}
              onClick={() => {
                setFocusZoneId(zone.id)
                setViewNonce((n) => n + 1)
              }}
            >
              {zone.label}
            </button>
          ))}
        </div>
        <div className="absolute bottom-3 left-3 z-10 flex items-center gap-2 text-[11px]">
          <button
            type="button"
            data-testid="campus-dev-preview"
            className={`rounded-full border px-2.5 py-1 backdrop-blur-md transition-colors ${
              devPreview
                ? 'border-amber-300/70 bg-amber-500/25 text-amber-100'
                : 'border-slate-600/60 bg-slate-950/70 text-slate-200 hover:bg-slate-800/80'
            }`}
            title="Plays synthetic agents walking between zones. Not real activity; never touches Orca sessions."
            onClick={() => setDevPreview((v) => !v)}
          >
            {devPreview ? 'DEV PREVIEW on (synthetic)' : 'DEV PREVIEW: simulate activity'}
          </button>
        </div>
        <Canvas
          frameloop={isDocumentVisible ? 'always' : 'never'}
          dpr={dpr as [number, number] | number}
          shadows={shadows}
          camera={{ fov: 52, near: 0.3, far: 900, position: [60, 22, 62] }}
          gl={{
            antialias: qualityMode === 'high',
            powerPreference: 'high-performance'
          }}
          onCreated={(state) => {
            // A previous canvas instance (if any) is released before the new one registers.
            canvasCleanupRef.current?.()
            r3fRef.current = state
            state.gl.toneMapping = THREE.ACESFilmicToneMapping
            state.gl.toneMappingExposure = 1.2
            // Debug handle: development and test builds only, never production.
            const exposeDebug = import.meta.env.DEV || import.meta.env.MODE === 'test'
            const debugWindow = window as unknown as { __THREE_STATE__?: RootState }
            if (exposeDebug) {
              debugWindow.__THREE_STATE__ = state
            }
            const dom = state.gl.domElement
            const onContextLost = (e: Event): void => {
              e.preventDefault()
              setIsContextLost(true)
            }
            const onContextRestored = (): void => {
              setIsContextLost(false)
            }
            dom.addEventListener('webglcontextlost', onContextLost)
            dom.addEventListener('webglcontextrestored', onContextRestored)
            canvasCleanupRef.current = () => {
              dom.removeEventListener('webglcontextlost', onContextLost)
              dom.removeEventListener('webglcontextrestored', onContextRestored)
              // Only remove the global if it still belongs to this instance.
              if (debugWindow.__THREE_STATE__ === state) {
                delete debugWindow.__THREE_STATE__
              }
              if (r3fRef.current === state) {
                r3fRef.current = null
              }
              canvasCleanupRef.current = null
            }
          }}
          onPointerMissed={() => {
            onSelectEmployee(null)
            onClearSelection?.()
          }}
        >
          <Office3DScene
            world={world}
            selectedEmployee={selectedEmployee}
            selectedDesk={selectedDesk}
            selectedZone={selectedZone}
            onSelectEmployee={onSelectEmployee}
            onSelectDesk={onSelectDesk}
            onFocusEmployee={onFocusEmployee}
            onSelectZone={onSelectZone}
            qualityMode={qualityMode}
            viewPreset={viewPreset}
            focusZoneId={focusZoneId}
            viewNonce={viewNonce}
          />
          {onFpsUpdate && <FpsTracker onFpsUpdate={onFpsUpdate} />}
        </Canvas>
      </div>
    </WebGLErrorBoundary>
  )
})
