import type { UISlice, UISliceGet, UISliceSet } from './ui-slice-contract'
import { rewindHistoryIndexPastView } from '../worktree-nav-history'
import { resolveSafePreviousView } from './ui-slice-hydration-sanitizers'

export function createUiViewActions(set: UISliceSet, get: UISliceGet): Partial<UISlice> {
  return {
    openActivityPage: () => {
      set((state) => ({
        activeView: 'activity',
        previousViewBeforeActivity:
          state.activeView === 'activity' ? state.previousViewBeforeActivity : state.activeView
      }))
    },
    closeActivityPage: () =>
      set((state) => ({
        activeView: resolveSafePreviousView(state.previousViewBeforeActivity, state.settings)
      })),
    selectedAutomationId: null,
    setSelectedAutomationId: (id) => set({ selectedAutomationId: id }),
    pendingAutomationRunNavigation: null,
    setPendingAutomationRunNavigation: (navigation) =>
      set({ pendingAutomationRunNavigation: navigation }),
    openAutomationsPage: () => {
      get().recordViewVisit('automations')
      set((state) => ({
        activeView: 'automations',
        previousViewBeforeAutomations:
          state.activeView === 'automations'
            ? state.previousViewBeforeAutomations
            : state.activeView
      }))
    },
    closeAutomationsPage: () =>
      set((state) => ({
        activeView: resolveSafePreviousView(state.previousViewBeforeAutomations, state.settings),
        worktreeNavHistoryIndex: rewindHistoryIndexPastView(state, 'automations')
      })),
    openSpacePage: () => {
      get().recordFeatureInteraction?.('workspace-cleanup')
      if (typeof window !== 'undefined' && window.api?.workspaceSpace?.openWindow) {
        void window.api.workspaceSpace.openWindow()
        return
      }
      set((state) => ({
        activeView: 'space',
        previousViewBeforeSpace:
          state.activeView === 'space' ? state.previousViewBeforeSpace : state.activeView
      }))
    },
    closeSpacePage: () =>
      set((state) => ({
        activeView: resolveSafePreviousView(state.previousViewBeforeSpace, state.settings)
      })),
    openSkillsPage: () => {
      get().recordViewVisit('skills')
      set((state) => ({
        activeView: 'skills',
        previousViewBeforeSkills:
          state.activeView === 'skills' ? state.previousViewBeforeSkills : state.activeView
      }))
    },
    closeSkillsPage: () =>
      set((state) => ({
        activeView: resolveSafePreviousView(state.previousViewBeforeSkills, state.settings),
        worktreeNavHistoryIndex: rewindHistoryIndexPastView(state, 'skills')
      })),
    openSkillShare: (shareId) => {
      get().recordViewVisit('skills')
      set((state) => ({
        activeView: 'skills',
        previousViewBeforeSkills:
          state.activeView === 'skills' ? state.previousViewBeforeSkills : state.activeView,
        pendingSkillShareId: shareId
      }))
    },
    clearPendingSkillShare: () => set({ pendingSkillShareId: null }),
    openSkillsSharedLinks: () => {
      get().recordViewVisit('skills')
      set((state) => ({
        activeView: 'skills',
        previousViewBeforeSkills:
          state.activeView === 'skills' ? state.previousViewBeforeSkills : state.activeView,
        pendingSkillsSharedView: true
      }))
    },
    clearPendingSkillsSharedView: () => set({ pendingSkillsSharedView: false }),
    openArtifactsPage: () => {
      get().recordViewVisit('artifacts')
      set((state) => ({
        activeView: 'artifacts',
        previousViewBeforeArtifacts:
          state.activeView === 'artifacts' ? state.previousViewBeforeArtifacts : state.activeView
      }))
    },
    closeArtifactsPage: () =>
      set((state) => ({
        activeView: resolveSafePreviousView(state.previousViewBeforeArtifacts, state.settings),
        worktreeNavHistoryIndex: rewindHistoryIndexPastView(state, 'artifacts')
      })),
    openMobilePage: () =>
      set((state) => ({
        activeView: 'mobile',
        previousViewBeforeMobile:
          state.activeView === 'mobile' ? state.previousViewBeforeMobile : state.activeView
      })),
    closeMobilePage: () =>
      set((state) => ({
        activeView: resolveSafePreviousView(state.previousViewBeforeMobile, state.settings)
      })),
    openOffice3DPage: () => {
      if (get().settings?.enableOffice3D !== true) {
        return
      }
      set((state) => ({
        activeView: 'office3d',
        previousViewBeforeOffice3D:
          state.activeView === 'office3d' ? state.previousViewBeforeOffice3D : state.activeView
      }))
    },
    closeOffice3DPage: () =>
      set((state) => ({
        activeView: !state.previousViewBeforeOffice3D
          ? 'terminal'
          : resolveSafePreviousView(state.previousViewBeforeOffice3D, state.settings)
      })),
    setNewWorkspaceDraft: (draft) => set({ newWorkspaceDraft: draft }),
    clearNewWorkspaceDraft: () => set({ newWorkspaceDraft: null })
  }
}
