// @vitest-environment happy-dom

import { act, cleanup, render, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '../store'
import { useAppChromeLayout } from './use-app-chrome-layout'
import { TerminalWorkbenchContainer } from '../components/TerminalWorkbenchContainer'
import type { TopLevelView } from '../../../shared/ui-chrome-types'

describe('Task B: Real chrome-layout and terminal workbench retention for Office 3D', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true)
    // Setup a standard workspace state with an active worktree and tabs
    useAppStore.setState({
      activeWorktreeId: 'wt-1',
      activeView: 'terminal',
      tabsByWorktree: {
        'wt-1': [
          {
            id: 'tab-1',
            worktreeId: 'wt-1',
            ptyId: 'wt-1@@session-1::pty-1',
            title: 'bash',
            customTitle: null,
            color: null,
            sortOrder: 0,
            createdAt: 1000
          }
        ]
      },
      unifiedTabsByWorktree: {
        'wt-1': [
          {
            id: 'tab-1',
            worktreeId: 'wt-1',
            entityId: 'tab-1',
            groupId: 'group-1',
            contentType: 'terminal',
            sortOrder: 0,
            label: 'bash',
            customLabel: null,
            color: null,
            createdAt: 1000
          }
        ]
      },
      settings: {
        ...useAppStore.getState().settings!,
        enableOffice3D: true
      }
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('proves layout.terminalWorkbenchVisible is false and shouldMountTerminalWorkbench is true when activeView is office3d', () => {
    const { result } = renderHook(() => useAppChromeLayout())

    // 1. Initial state: activeView === 'terminal'
    expect(result.current.activeView).toBe('terminal')
    expect(result.current.workspaceChromeActive).toBe(true)
    expect(result.current.terminalWorkbenchVisible).toBe(true)
    expect(result.current.shouldMountTerminalWorkbench).toBe(true)

    // 2. Switch to Office 3D
    act(() => {
      useAppStore.setState({ activeView: 'office3d' })
    })

    // Layout values for Office 3D
    expect(result.current.activeView).toBe('office3d')
    expect(result.current.workspaceChromeActive).toBe(false)
    expect(result.current.terminalWorkbenchVisible).toBe(false)
    // Mount is retained — terminal workbench does NOT unmount!
    expect(result.current.shouldMountTerminalWorkbench).toBe(true)

    // 3. Return to Classic ('terminal')
    act(() => {
      useAppStore.setState({ activeView: 'terminal' })
    })

    expect(result.current.activeView).toBe('terminal')
    expect(result.current.workspaceChromeActive).toBe(true)
    expect(result.current.terminalWorkbenchVisible).toBe(true)
    expect(result.current.shouldMountTerminalWorkbench).toBe(true)
  })

  it('renders TerminalWorkbenchContainer with hidden and inert attributes when activeView is office3d', () => {
    function ShellHarness(): React.JSX.Element | null {
      const layout = useAppChromeLayout()
      if (!layout.shouldMountTerminalWorkbench) {
        return null
      }
      return (
        <div data-testid="shell-container">
          <TerminalWorkbenchContainer isVisible={layout.terminalWorkbenchVisible}>
            <div data-testid="retained-terminal-content">Terminal Process Content</div>
          </TerminalWorkbenchContainer>
          {layout.activeView === 'office3d' ? (
            <div data-testid="office3d-active-page">Office 3D Page View</div>
          ) : null}
        </div>
      )
    }

    const { getByTestId, queryByTestId, container } = render(<ShellHarness />)

    // Initial Classic View:
    const workbenchContainer = container.querySelector('[data-terminal-workbench-container]')
    expect(workbenchContainer).not.toBeNull()
    expect(workbenchContainer).toBeInstanceOf(HTMLElement)

    // In terminal view: visible, not inert, aria-hidden is false
    expect(workbenchContainer?.getAttribute('aria-hidden')).toBe('false')
    expect(workbenchContainer?.hasAttribute('inert')).toBe(false)
    expect(workbenchContainer?.className).toContain('flex flex-1')
    expect(workbenchContainer?.className).not.toContain('hidden')
    expect(getByTestId('retained-terminal-content')).toBeDefined()
    expect(queryByTestId('office3d-active-page')).toBeNull()

    // Transition to Office 3D:
    act(() => {
      useAppStore.setState({ activeView: 'office3d' })
    })

    // DOM assertions:
    // 1. Container remains mounted in DOM
    const parkedWorkbench = container.querySelector('[data-terminal-workbench-container]')
    expect(parkedWorkbench).not.toBeNull()
    expect(parkedWorkbench).toBe(workbenchContainer) // Same DOM node, not remounted!

    // 2. Hidden and inert attributes are correctly applied
    expect(parkedWorkbench?.getAttribute('aria-hidden')).toBe('true')
    expect(parkedWorkbench?.hasAttribute('inert')).toBe(true)
    expect(parkedWorkbench?.className).toContain('hidden')

    // 3. Child terminal content remains preserved inside the DOM
    expect(getByTestId('retained-terminal-content')).toBeDefined()
    expect(getByTestId('retained-terminal-content').textContent).toBe('Terminal Process Content')

    // 4. Office 3D active page is simultaneously mounted
    expect(getByTestId('office3d-active-page')).toBeDefined()

    // Transition back to Classic:
    act(() => {
      useAppStore.setState({ activeView: 'terminal' })
    })

    // Container is restored to visible flex, inert removed, aria-hidden false
    expect(parkedWorkbench?.getAttribute('aria-hidden')).toBe('false')
    expect(parkedWorkbench?.hasAttribute('inert')).toBe(false)
    expect(parkedWorkbench?.className).toContain('flex flex-1')
    expect(parkedWorkbench?.className).not.toContain('hidden')
    expect(queryByTestId('office3d-active-page')).toBeNull()
  })

  it('confirms existing views retain identical workbench visibility and retention behavior', () => {
    const { result } = renderHook(() => useAppChromeLayout())

    const otherViews: TopLevelView[] = [
      'tasks',
      'settings',
      'skills',
      'activity',
      'automations',
      'space',
      'mobile',
      'artifacts'
    ]

    for (const view of otherViews) {
      act(() => {
        useAppStore.setState({ activeView: view })
      })

      // Like office3d, existing overlay/full views keep workbench mounted but invisible
      expect(result.current.activeView).toBe(view)
      expect(result.current.workspaceChromeActive).toBe(false)
      expect(result.current.terminalWorkbenchVisible).toBe(false)
      expect(result.current.shouldMountTerminalWorkbench).toBe(true)
    }

    // Returning to terminal restores visibility
    act(() => {
      useAppStore.setState({ activeView: 'terminal' })
    })
    expect(result.current.activeView).toBe('terminal')
    expect(result.current.workspaceChromeActive).toBe(true)
    expect(result.current.terminalWorkbenchVisible).toBe(true)
    expect(result.current.shouldMountTerminalWorkbench).toBe(true)
  })
})
