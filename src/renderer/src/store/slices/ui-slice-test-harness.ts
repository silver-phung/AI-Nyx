import { createStore, type StoreApi } from 'zustand/vanilla'
import { getDefaultUIState } from '../../../../shared/constants'
import type { PersistedUIState } from '../../../../shared/persisted-ui-state-types'
import type { AppState } from '../types'
import { createUISlice } from './ui'
import { createWorktreeNavHistorySlice } from './worktree-nav-history'
import { createSettingsSearchState } from './settings-search-state'
import { sanitizeDisabledOfficeViews } from './ui/ui-slice-hydration-sanitizers'

export function createUIStore(): StoreApi<AppState> {
  // Only the UI slice, repo/worktree ids, and right sidebar width fallback are
  // needed for these tests. The worktree-nav-history slice is also included
  // because page opens record view visits.
  // oxlint-disable-next-line typescript/no-explicit-any, typescript/consistent-type-assertions -- SAFETY: a partial store; tests read only the slices it builds.
  const store = createStore<any>()((...args: any[]) => ({
    repos: [],
    worktreesByRepo: {},
    rightSidebarOpen: false,
    rightSidebarWidth: 280,
    markdownTocPanelWidth: 240,
    combinedDiffFileTreeWidth: 256,
    rightSidebarTab: 'explorer',
    rightSidebarExplorerView: 'files',
    // Why: acknowledgeAgents clears the agent-completion marker the terminal slice owns.
    unreadAgentCompletionPanes: {},
    ...createSettingsSearchState(args[0]),
    ...createWorktreeNavHistorySlice(...(args as Parameters<typeof createWorktreeNavHistorySlice>)),
    ...createUISlice(...(args as Parameters<typeof createUISlice>))
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: typed test harness store
  })) as unknown as StoreApi<AppState>

  store.subscribe((state, previousState) => {
    if (
      previousState.settings?.enableOffice3D === true &&
      state.settings?.enableOffice3D !== true
    ) {
      const updates = sanitizeDisabledOfficeViews(state)
      if (Object.keys(updates).length > 0) {
        store.setState(updates)
      }
    }
  })

  return store
}

export function makePersistedUI(overrides: Partial<PersistedUIState> = {}): PersistedUIState {
  return {
    ...getDefaultUIState(),
    ...overrides
  }
}
