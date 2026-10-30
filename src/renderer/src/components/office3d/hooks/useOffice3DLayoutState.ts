import { useCallback, useEffect, useRef, useState } from 'react'

export type BottomActiveTab = 'terminal' | 'output' | 'problems' | 'logs'
export type RightActiveTab = 'chat' | 'history' | 'details'

export type Office3DLayoutState = {
  bottomPanelHeight: number
  setBottomPanelHeight: React.Dispatch<React.SetStateAction<number>>
  isBottomPanelCollapsed: boolean
  setIsBottomPanelCollapsed: React.Dispatch<React.SetStateAction<boolean>>
  rightPanelWidth: number
  setRightPanelWidth: React.Dispatch<React.SetStateAction<number>>
  isRightPanelCollapsed: boolean
  setIsRightPanelCollapsed: React.Dispatch<React.SetStateAction<boolean>>
  bottomActiveTab: BottomActiveTab
  setBottomActiveTab: React.Dispatch<React.SetStateAction<BottomActiveTab>>
  rightActiveTab: RightActiveTab
  setRightActiveTab: React.Dispatch<React.SetStateAction<RightActiveTab>>
  interactiveInputUnlocked: boolean
  setInteractiveInputUnlocked: React.Dispatch<React.SetStateAction<boolean>>
  handleBottomResizeStart: (e: React.MouseEvent) => void
  handleRightResizeStart: (e: React.MouseEvent) => void
}

export function useOffice3DLayoutState(): Office3DLayoutState {
  const [bottomPanelHeight, setBottomPanelHeight] = useState(240)
  const [isBottomPanelCollapsed, setIsBottomPanelCollapsed] = useState(false)
  const [rightPanelWidth, setRightPanelWidth] = useState(380)
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(false)
  const [bottomActiveTab, setBottomActiveTab] = useState<BottomActiveTab>('terminal')
  const [rightActiveTab, setRightActiveTab] = useState<RightActiveTab>('chat')
  const [interactiveInputUnlocked, setInteractiveInputUnlocked] = useState(false)

  const activeCleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    return () => {
      activeCleanupRef.current?.()
    }
  }, [])

  const handleBottomResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const startY = e.clientY
      const startHeight = bottomPanelHeight

      const onMouseMove = (moveEvent: MouseEvent): void => {
        const delta = startY - moveEvent.clientY
        const maxHeight = Math.max(160, Math.floor(window.innerHeight * 0.6))
        const newHeight = Math.max(100, Math.min(maxHeight, startHeight + delta))
        setBottomPanelHeight(newHeight)
        setIsBottomPanelCollapsed(false)
      }

      const onMouseUp = (): void => {
        window.removeEventListener('mousemove', onMouseMove)
        window.removeEventListener('mouseup', onMouseUp)
        activeCleanupRef.current = null
      }

      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseup', onMouseUp)
      activeCleanupRef.current = onMouseUp
    },
    [bottomPanelHeight]
  )

  const handleRightResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const startX = e.clientX
      const startWidth = rightPanelWidth

      const onMouseMove = (moveEvent: MouseEvent): void => {
        const delta = startX - moveEvent.clientX
        const maxWidth = Math.max(300, Math.floor(window.innerWidth * 0.5))
        const newWidth = Math.max(260, Math.min(maxWidth, startWidth + delta))
        setRightPanelWidth(newWidth)
        setIsRightPanelCollapsed(false)
      }

      const onMouseUp = (): void => {
        window.removeEventListener('mousemove', onMouseMove)
        window.removeEventListener('mouseup', onMouseUp)
        activeCleanupRef.current = null
      }

      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseup', onMouseUp)
      activeCleanupRef.current = onMouseUp
    },
    [rightPanelWidth]
  )

  return {
    bottomPanelHeight,
    setBottomPanelHeight,
    isBottomPanelCollapsed,
    setIsBottomPanelCollapsed,
    rightPanelWidth,
    setRightPanelWidth,
    isRightPanelCollapsed,
    setIsRightPanelCollapsed,
    bottomActiveTab,
    setBottomActiveTab,
    rightActiveTab,
    setRightActiveTab,
    interactiveInputUnlocked,
    setInteractiveInputUnlocked,
    handleBottomResizeStart,
    handleRightResizeStart
  }
}
