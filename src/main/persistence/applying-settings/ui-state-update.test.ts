import { describe, expect, it, vi } from 'vitest'
import {
  getDefaultUIState,
  getDefaultSettings,
  getDefaultPersistedState
} from '../../../shared/constants'
import type { PersistedState } from '../../../shared/persisted-state-types'
import type { GlobalSettings } from '../../../shared/global-settings-types'
import type { PersistedUIState } from '../../../shared/persisted-ui-state-types'
import type { TopLevelView } from '../../../shared/ui-chrome-types'
import { updatePersistedUI, type UIUpdateOperations } from './ui-state-update'

function createMockOperations(options?: {
  settings?: Partial<GlobalSettings>
  initialUI?: Partial<PersistedUIState>
}): {
  operations: UIUpdateOperations
  getActiveView: () => PersistedState['ui']['activeView']
  getNotifyCount: () => number
  getSaveCount: () => number
} {
  let activeView: PersistedState['ui']['activeView'] = options?.initialUI?.activeView ?? 'terminal'
  let notifyCount = 0
  let saveCount = 0

  const defaultSettings = getDefaultSettings('/fake/path')
  const settings: GlobalSettings = options?.settings
    ? { ...defaultSettings, ...options.settings }
    : defaultSettings

  const state: PersistedState = {
    ...getDefaultPersistedState('/fake/path'),
    settings,
    ui: {
      ...getDefaultUIState(),
      ...options?.initialUI
    }
  }

  const operations: UIUpdateOperations = {
    state,
    removeRetainedBlob: vi.fn(),
    setActiveView: (next) => {
      if (next === undefined || next === activeView) {
        return false
      }
      activeView = next
      state.ui.activeView = next
      return true
    },
    getUI: () => state.ui,
    scheduleSave: () => {
      saveCount += 1
    },
    notifyUIChanged: () => {
      notifyCount += 1
    }
  }

  return {
    operations,
    getActiveView: () => activeView,
    getNotifyCount: () => notifyCount,
    getSaveCount: () => saveCount
  }
}

describe('ui-state-update: activeView Office 3D flag coercion and safety', () => {
  it('coerces office3d to terminal when enableOffice3D is false', () => {
    const { operations, getActiveView, getNotifyCount } = createMockOperations({
      settings: { enableOffice3D: false },
      initialUI: { activeView: 'terminal' }
    })

    updatePersistedUI(operations, { activeView: 'office3d' })

    // Coerced to terminal; since activeView was already terminal, no change notification
    expect(getActiveView()).toBe('terminal')
    expect(getNotifyCount()).toBe(0)
  })

  it('coerces office3d to terminal and notifies when activeView changes from another view', () => {
    const { operations, getActiveView, getNotifyCount } = createMockOperations({
      settings: { enableOffice3D: false },
      initialUI: { activeView: 'tasks' }
    })

    updatePersistedUI(operations, { activeView: 'office3d' })

    // Coerced to terminal, which is different from tasks, so notifyUIChanged is called
    expect(getActiveView()).toBe('terminal')
    expect(getNotifyCount()).toBe(1)
  })

  it('permits office3d when enableOffice3D is true', () => {
    const { operations, getActiveView, getNotifyCount } = createMockOperations({
      settings: { enableOffice3D: true },
      initialUI: { activeView: 'terminal' }
    })

    updatePersistedUI(operations, { activeView: 'office3d' })

    expect(getActiveView()).toBe('office3d')
    expect(getNotifyCount()).toBe(1)
  })

  it('leaves all existing top-level view values unchanged when enableOffice3D is false', () => {
    const standardViews: TopLevelView[] = [
      'terminal',
      'tasks',
      'settings',
      'skills',
      'activity',
      'automations',
      'space',
      'mobile',
      'artifacts'
    ]

    for (const view of standardViews) {
      const { operations, getActiveView } = createMockOperations({
        settings: { enableOffice3D: false },
        initialUI: { activeView: 'terminal' }
      })

      updatePersistedUI(operations, { activeView: view })
      expect(getActiveView()).toBe(view)
    }
  })

  it('leaves all existing top-level view values unchanged when enableOffice3D is true', () => {
    const standardViews: TopLevelView[] = [
      'terminal',
      'tasks',
      'settings',
      'skills',
      'activity',
      'automations',
      'space',
      'mobile',
      'artifacts'
    ]

    for (const view of standardViews) {
      const { operations, getActiveView } = createMockOperations({
        settings: { enableOffice3D: true },
        initialUI: { activeView: 'office3d' }
      })

      updatePersistedUI(operations, { activeView: view })
      expect(getActiveView()).toBe(view)
    }
  })

  describe('unexpected or outdated settings handling', () => {
    it('safely coerces office3d to terminal when settings object is missing or undefined', () => {
      const { operations, getActiveView } = createMockOperations({
        initialUI: { activeView: 'tasks' }
      })
      // Force settings to undefined
      Reflect.set(operations.state, 'settings', undefined)

      updatePersistedUI(operations, { activeView: 'office3d' })
      expect(getActiveView()).toBe('terminal')
    })

    it('safely coerces office3d to terminal when enableOffice3D is undefined', () => {
      const { operations, getActiveView } = createMockOperations({
        settings: { enableOffice3D: undefined },
        initialUI: { activeView: 'tasks' }
      })

      updatePersistedUI(operations, { activeView: 'office3d' })
      expect(getActiveView()).toBe('terminal')
    })

    it('safely coerces office3d to terminal when enableOffice3D is a non-boolean truthy/falsy value', () => {
      for (const invalidValue of [null, 0, 1, 'true', 'false', {}, []]) {
        const { operations, getActiveView } = createMockOperations({
          initialUI: { activeView: 'tasks' }
        })
        Reflect.set(operations.state.settings, 'enableOffice3D', invalidValue)

        updatePersistedUI(operations, { activeView: 'office3d' })
        expect(getActiveView()).toBe('terminal')
      }
    })

    it('handles undefined activeView gracefully without changing existing activeView', () => {
      const { operations, getActiveView, getNotifyCount } = createMockOperations({
        settings: { enableOffice3D: true },
        initialUI: { activeView: 'office3d' }
      })

      updatePersistedUI(operations, { activeView: undefined })
      expect(getActiveView()).toBe('office3d')
      expect(getNotifyCount()).toBe(0)
    })

    it('handles empty updates object gracefully', () => {
      const { operations, getActiveView, getNotifyCount } = createMockOperations({
        settings: { enableOffice3D: true },
        initialUI: { activeView: 'terminal' }
      })

      updatePersistedUI(operations, {})
      expect(getActiveView()).toBe('terminal')
      expect(getNotifyCount()).toBe(0)
    })
  })

  describe('settings synchronization ordering between renderer and main process', () => {
    it('coerces office3d to terminal if ui.set arrives before enableOffice3D is saved in main process', () => {
      // Scenario: Renderer sends ui.set({ activeView: 'office3d' }) while settings in main still has enableOffice3D: false
      const { operations, getActiveView } = createMockOperations({
        settings: { enableOffice3D: false },
        initialUI: { activeView: 'terminal' }
      })

      updatePersistedUI(operations, { activeView: 'office3d' })
      expect(getActiveView()).toBe('terminal')

      // Then settings arrives and updates to enableOffice3D: true
      operations.state.settings.enableOffice3D = true

      // Subsequent ui.set({ activeView: 'office3d' }) now succeeds
      updatePersistedUI(operations, { activeView: 'office3d' })
      expect(getActiveView()).toBe('office3d')
    })

    it('immediately coerces office3d to terminal if enableOffice3D is flipped to false in main process', () => {
      // Scenario: Active view was office3d with enableOffice3D: true
      const { operations, getActiveView } = createMockOperations({
        settings: { enableOffice3D: true },
        initialUI: { activeView: 'office3d' }
      })

      // Setting disabled
      operations.state.settings.enableOffice3D = false

      // Any UI update with activeView: 'office3d' is coerced to terminal
      updatePersistedUI(operations, { activeView: 'office3d' })
      expect(getActiveView()).toBe('terminal')
    })
  })
})
