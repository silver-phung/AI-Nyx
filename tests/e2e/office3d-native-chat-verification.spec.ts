import { expect, test } from './helpers/orca-app'
import { waitForSessionReady, ensureTerminalVisible, waitForActiveWorktree } from './helpers/store'
import { waitForActivePanePtyId, waitForActiveTerminalManager } from './helpers/terminal'
import { splitMarkerEchoCommand } from './terminal-marker-echo-command'
import { waitForPtyShellEcho, getTerminalContentForPtyId } from './terminal-pty-readiness'

test('Real Electron verification — Office 3D Native Chat routing, safety locks, and terminal isolation', async ({
  orcaPage
}, testInfo) => {
  test.setTimeout(120_000)
  await waitForSessionReady(orcaPage)
  await ensureTerminalVisible(orcaPage)
  await waitForActiveTerminalManager(orcaPage, 30_000)

  const worktreeId = await waitForActiveWorktree(orcaPage)
  const initialPtyId = await waitForActivePanePtyId(orcaPage, 30_000)
  expect(initialPtyId).toBeTruthy()
  await waitForPtyShellEcho(orcaPage, initialPtyId, 15_000)
  // Let trailing shell prompt IPC drain completely
  await orcaPage.waitForTimeout(1_000)

  // 1. Enable Office 3D flag and idle agent dashboard in store
  await orcaPage.evaluate(() => {
    const current = window.__store?.getState().settings
    if (!current) {
      throw new Error('Settings are not loaded')
    }
    window.__store?.setState({
      settings: {
        ...current,
        enableOffice3D: true,
        experimentalAgentDashboardShowIdle: true
      }
    })
  })

  // 2. Discover real live active leafId from terminal layout
  const liveTabInfo = await orcaPage.evaluate(
    ({ worktreeId }) => {
      const store = window.__store?.getState()
      if (!store) {
        throw new Error('window.__store is unavailable')
      }
      const tab = store.tabsByWorktree[worktreeId]?.[0]
      if (!tab) {
        throw new Error('No active primary tab')
      }
      const layout = store.terminalLayoutsByTabId[tab.id]
      const activeLeafId =
        layout?.activeLeafId ??
        Object.keys(layout?.ptyIdsByLeafId ?? {})[0] ??
        '00000000-0000-4000-8000-000000000001'
      return { tabId: tab.id, activeLeafId }
    },
    { worktreeId }
  )

  // 3. Seed test agents across workspaces:
  // - Agent A: Local, single pane, Codex agent mapped to the REAL live PTY and leafId
  // - Agent B: Headless agent without PTY
  // - Agent C: Remote SSH execution host
  await orcaPage.evaluate(
    ({ worktreeId, realPtyId, tabId, leafId }) => {
      const store = window.__store
      if (!store) {
        throw new Error('window.__store is unavailable')
      }
      const state = store.getState()
      const allWorktrees = Object.values(state.worktreesByRepo).flat()
      const primaryWtId = worktreeId
      const secondaryWt = allWorktrees.find((w) => w.id !== primaryWtId)
      const secondaryWtId = secondaryWt ? secondaryWt.id : 'secondary-test-wt'

      const tab1 = state.tabsByWorktree[primaryWtId]?.[0]
      if (!tab1) {
        throw new Error('No active primary tab')
      }

      // Ensure tab1 and layout contain the real PTY (Single Pane)
      tab1.ptyId = realPtyId

      state.terminalLayoutsByTabId[tabId] = {
        root: { type: 'leaf', leafId },
        activeLeafId: leafId,
        expandedLeafId: null,
        ptyIdsByLeafId: { [leafId]: realPtyId }
      }
      state.ptyIdsByTabId[tabId] = [realPtyId]

      const realPaneKeyA = `${tabId}:${leafId}`

      // Agent A: Local verified Codex Agent bound to real live PTY (strictly single-pane on primary tab)
      store.getState().setAgentStatus(
        realPaneKeyA,
        {
          state: 'working',
          prompt: '[TEST] Alpha Local Codex Agent',
          agentType: 'codex'
        },
        'Codex',
        { updatedAt: Date.now(), stateStartedAt: Date.now() - 60_000 },
        { tabId, terminalHandle: realPtyId, worktreeId: primaryWtId }
      )

      // Agent B: Local Headless Agent without PTY (in secondary workspace, unverified)
      const tab2 =
        state.tabsByWorktree[secondaryWtId]?.[0] ??
        state.createTab(secondaryWtId, undefined, undefined, {
          activate: false,
          id: 'office3d-headless-tab'
        })
      const leafIdB = '00000000-0000-4000-8000-000000000002'
      state.terminalLayoutsByTabId[tab2.id] = {
        root: { type: 'leaf', leafId: leafIdB },
        activeLeafId: leafIdB,
        expandedLeafId: null,
        ptyIdsByLeafId: {}
      }

      store.getState().setAgentStatus(
        `${tab2.id}:${leafIdB}`,
        {
          state: 'blocked',
          prompt: '[TEST] Beta Headless Agent No PTY',
          agentType: 'terminal'
        },
        'Terminal',
        { updatedAt: Date.now(), stateStartedAt: Date.now() - 30_000 },
        { tabId: tab2.id, terminalHandle: undefined, worktreeId: secondaryWtId }
      )

      // Agent C: Remote SSH Agent (mark secondaryWt as remote host)
      if (secondaryWt) {
        secondaryWt.hostId = 'ssh:remote-server'
      }
      const tab3 = state.createTab(secondaryWtId, undefined, undefined, {
        activate: false,
        id: 'office3d-remote-tab'
      })
      const remoteLeafId = '00000000-0000-4000-8000-000000000003'
      state.terminalLayoutsByTabId[tab3.id] = {
        root: { type: 'leaf', leafId: remoteLeafId },
        activeLeafId: remoteLeafId,
        expandedLeafId: null,
        ptyIdsByLeafId: { [remoteLeafId]: 'pty-remote-999' }
      }
      state.ptyIdsByTabId[tab3.id] = ['pty-remote-999']

      store.getState().setAgentStatus(
        `${tab3.id}:${remoteLeafId}`,
        {
          state: 'working',
          prompt: '[TEST] Gamma Remote SSH Agent',
          agentType: 'claude'
        },
        'Claude',
        { updatedAt: Date.now(), stateStartedAt: Date.now() - 45_000 },
        { tabId: tab3.id, terminalHandle: 'pty-remote-999', worktreeId: secondaryWtId }
      )
    },
    {
      worktreeId,
      realPtyId: initialPtyId,
      tabId: liveTabInfo.tabId,
      leafId: liveTabInfo.activeLeafId
    }
  )

  // 4. Open Office 3D view
  await orcaPage.evaluate(() => {
    window.__store?.getState().openOffice3DPage()
  })

  await expect(orcaPage.getByRole('heading', { name: /Office 3D/i })).toBeVisible({
    timeout: 15_000
  })
  expect(await orcaPage.evaluate(() => window.__store?.getState().activeView)).toBe('office3d')

  // 5. Verify initial unselected state
  const rightPanel = orcaPage.locator('[data-testid="office3d-right-panel"]')
  const terminalPanel = orcaPage.locator('[data-testid="office3d-terminal-panel"]')
  await expect(terminalPanel.getByText(/No Agent Selected/i)).toBeVisible()
  await expect(rightPanel.getByText(/Live Fleet Overview/i)).toBeVisible()
  await expect(rightPanel.getByText(/Alpha Local Codex Agent/i)).toBeVisible()
  await expect(rightPanel.getByText(/Beta Headless Agent No PTY/i)).toBeVisible()
  await expect(rightPanel.getByText(/Gamma Remote SSH Agent/i)).toBeVisible()

  // M5: real Orca status reaches the campus — blocked Agent B walks to the garden as a REAL event.
  await terminalPanel.getByRole('button', { name: /^Logs/ }).click()
  const realRestEvent = terminalPanel
    .locator('div')
    .filter({ hasText: /REAL/ })
    .filter({ hasText: /rest:\s*needs input/ })
  await expect(realRestEvent.first()).toBeVisible({ timeout: 15_000 })
  await expect(terminalPanel.getByText('DEV PREVIEW', { exact: true })).toHaveCount(0)
  await terminalPanel.getByRole('button', { name: /^Terminal$/ }).click()

  // 6. Select Agent A (Local, Single Pane, Verified PTY)
  const agentABtn = rightPanel.getByRole('button', { name: /Alpha Local Codex Agent/i })
  await agentABtn.click()

  // Verify Terminal panel attaches verified terminal preview with real PTY
  await expect(terminalPanel).toBeVisible()
  const agentTerminalPreview = orcaPage.locator('[data-testid="agent-terminal-preview"]')
  await expect(agentTerminalPreview).toBeAttached()
  await expect(agentTerminalPreview).toHaveAttribute('data-pty-id', initialPtyId)

  // Verify Chat tab in Right panel has NO safety banner (it is verified and safe)
  await expect(orcaPage.locator('[data-testid="office3d-chat-safety-banner"]')).toHaveCount(0)

  // Verify NativeChatView surface is mounted
  const chatSurface = orcaPage.locator('[data-testid="office3d-native-chat-surface"]')
  await expect(chatSurface).toBeVisible()

  // 7. REAL DISPATCH TEST: Send a harmless prompt into the real live PTY via the runtime channel
  const marker = `NYX_OFFICE_VERIFIED_${Date.now()}`
  const cmd = splitMarkerEchoCommand(marker.slice(0, 10), marker.slice(10))
  await orcaPage.evaluate(
    ({ ptyId, cmd }) => {
      // Send verified driving input directly through the runtime IPC channel
      window.api?.pty?.write?.(ptyId, `${cmd}\r`, 'driving')
    },
    { ptyId: initialPtyId, cmd }
  )

  // Verify that the REAL shell on initialPtyId received and executed the command,
  // appearing in the live AgentTerminalPreview in Office 3D
  await expect
    .poll(
      async () => {
        return orcaPage.evaluate(() => {
          const container = document.querySelector(
            '[data-testid="agent-terminal-preview"] .origin-bottom-left'
          ) as {
            __xterm?: {
              buffer: {
                active: {
                  length: number
                  getLine: (
                    i: number
                  ) => { translateToString: (trimRight?: boolean) => string } | undefined
                }
              }
            }
          } | null
          const term = container?.__xterm
          if (!term) {
            return ''
          }
          const buf = term.buffer.active
          const lines: string[] = []
          for (let i = 0; i < buf.length; i++) {
            const line = buf.getLine(i)?.translateToString(true)
            if (line) {
              lines.push(line)
            }
          }
          return lines.join('\n')
        })
      },
      {
        timeout: 20_000,
        message: `Office 3D AgentTerminalPreview for PTY ${initialPtyId} did not receive marker ${marker}`
      }
    )
    .toContain(marker)

  // 8. Test Agent Isolation: Switch Agent A -> Agent B (Unverified / No PTY)
  // Switch to Active Sessions tab to click Agent B
  const activeSessionsTab = rightPanel.getByRole('button', { name: /Active Sessions/i })
  await activeSessionsTab.click()
  const agentBCard = rightPanel
    .locator('[data-testid="office3d-session-card"]')
    .filter({ hasText: /Beta Headless Agent No PTY/i })
  await agentBCard.getByRole('button', { name: /Select in 3D/i }).click()

  // Switch back to Chat tab to verify safety banner for unverified Agent B
  const chatTabBtn = rightPanel.getByRole('button', { name: /^Chat$/i })
  await chatTabBtn.click()

  // Terminal panel shows unverified warning
  await expect(
    terminalPanel.getByText('No verified terminal for this agent', { exact: true })
  ).toBeVisible()

  // Right panel displays Chat Safety Banner
  const safetyBannerB = orcaPage.locator('[data-testid="office3d-chat-safety-banner"]')
  await expect(safetyBannerB).toBeVisible()
  await expect(safetyBannerB).toContainText(/Chat sending is locked/i)

  // 9. Test Remote SSH Isolation: Switch to Agent C (Remote SSH)
  await activeSessionsTab.click()
  const agentCCard = rightPanel
    .locator('[data-testid="office3d-session-card"]')
    .filter({ hasText: /Gamma Remote SSH Agent/i })
  await agentCCard.getByRole('button', { name: /Select in 3D/i }).click()
  await chatTabBtn.click()

  // Safety banner indicates chat sending is locked for remote / unverified session
  const safetyBannerC = orcaPage.locator('[data-testid="office3d-chat-safety-banner"]')
  await expect(safetyBannerC).toBeVisible()
  await expect(safetyBannerC).toContainText(/Chat sending is locked/i)

  // 10. Switch back to Agent A: verified terminal and live chat are restored cleanly
  await orcaPage.evaluate(
    ({ tabId, leafId, realPtyId, primaryWtId }) => {
      window.__store?.getState().setAgentStatus(
        `${tabId}:${leafId}`,
        {
          state: 'working',
          prompt: '[TEST] Alpha Local Codex Agent',
          agentType: 'codex'
        },
        'Codex',
        { updatedAt: Date.now(), stateStartedAt: Date.now() - 10_000 },
        { tabId, terminalHandle: realPtyId, worktreeId: primaryWtId }
      )
    },
    {
      tabId: liveTabInfo.tabId,
      leafId: liveTabInfo.activeLeafId,
      realPtyId: initialPtyId,
      primaryWtId: worktreeId
    }
  )

  await activeSessionsTab.click()
  const agentACard = rightPanel
    .locator('[data-testid="office3d-session-card"]')
    .filter({ hasText: /Alpha Local Codex Agent/i })
  await agentACard.getByRole('button', { name: /Select in 3D/i }).click()
  await chatTabBtn.click()

  // Safety banner disappears, PTY re-attaches
  await expect(orcaPage.locator('[data-testid="office3d-chat-safety-banner"]')).toHaveCount(0)
  await expect(agentTerminalPreview).toHaveAttribute('data-pty-id', initialPtyId)

  // 11. Verify Keyboard Safety (M1) — Focus inside Right Panel; Escape does not close Office 3D
  await rightPanel.click()
  await orcaPage.keyboard.press('Escape')
  expect(await orcaPage.evaluate(() => window.__store?.getState().activeView)).toBe('office3d')

  // 12. Return to Classic View and verify PTY continuity
  const returnButton = orcaPage.locator('[data-testid="office3d-return-button"]')
  await expect(returnButton).toBeVisible()
  await returnButton.click()

  // Verify view restored to classic terminal
  await expect
    .poll(async () => orcaPage.evaluate(() => window.__store?.getState().activeView), {
      timeout: 10_000
    })
    .toBe('terminal')

  // Verify initial PTY is preserved intact without replacement
  const postReturnPtyId = await waitForActivePanePtyId(orcaPage, 30_000)
  expect(postReturnPtyId).toBe(initialPtyId)

  // Verify terminal output marker survived the transition
  await expect
    .poll(async () => getTerminalContentForPtyId(orcaPage, initialPtyId, 30_000), {
      timeout: 15_000
    })
    .toContain(marker)

  // Capture verification screenshot
  const screenshotPath = testInfo.outputPath('office3d_native_chat_verified.png')
  await orcaPage.screenshot({ path: screenshotPath })
  await testInfo.attach('office3d_native_chat_verified', { path: screenshotPath })
})
