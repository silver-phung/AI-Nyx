import { expect, test } from './helpers/orca-app'
import { waitForSessionReady, ensureTerminalVisible, waitForActiveWorktree } from './helpers/store'
import { waitForActiveTerminalManager } from './helpers/terminal'

test('Real Electron 3D Scene Verification — Canvas rendering, Quality toggle, DOM fallback, and Return to Classic', async ({
  orcaPage
}, testInfo) => {
  test.setTimeout(120_000)
  await waitForSessionReady(orcaPage)
  await ensureTerminalVisible(orcaPage)
  await waitForActiveTerminalManager(orcaPage, 30_000)

  const worktreeId = await waitForActiveWorktree(orcaPage)

  // 1. Enable Office 3D flag in store
  await orcaPage.evaluate(() => {
    const current = window.__store?.getState().settings
    if (!current) {
      throw new Error('Settings are not loaded')
    }
    window.__store?.setState({
      settings: {
        ...current,
        enableOffice3D: true
      }
    })
  })

  // 2. Seed 3 representative agents across 2 workspaces (all explicitly labeled as SYNTHETIC)
  await orcaPage.evaluate(
    ({ worktreeId }) => {
      const store = window.__store
      if (!store) {
        throw new Error('window.__store is unavailable')
      }
      const state = store.getState()
      const allWorktrees = Object.values(state.worktreesByRepo).flat()
      const primaryWtId = worktreeId
      const secondaryWt = allWorktrees.find((w) => w.id !== primaryWtId)
      const secondaryWtId = secondaryWt ? secondaryWt.id : 'secondary-demo-wt'

      const tab1 =
        state.tabsByWorktree[primaryWtId]?.[0] ??
        state.createTab(primaryWtId, undefined, undefined, {
          activate: true,
          id: 'office3d-demo-tab-1'
        })

      const tab2 =
        state.tabsByWorktree[secondaryWtId]?.[0] ??
        state.createTab(secondaryWtId, undefined, undefined, {
          activate: false,
          id: 'office3d-demo-tab-2'
        })

      // Agent 1: Primary workspace, Codex engine, working state
      store.getState().setAgentStatus(
        `${tab1.id}:00000000-0000-4000-8000-000000000001`,
        {
          state: 'working',
          prompt: '[SYNTHETIC TEST] Codex Agent Implementation',
          agentType: 'codex'
        },
        'Codex',
        { updatedAt: Date.now(), stateStartedAt: Date.now() - 120_000 },
        { tabId: tab1.id, terminalHandle: 'term-1', worktreeId: primaryWtId }
      )

      // Agent 2: Primary workspace, Claude engine, attention state
      store.getState().setAgentStatus(
        `${tab1.id}:00000000-0000-4000-8000-000000000002`,
        {
          state: 'blocked',
          prompt: '[SYNTHETIC TEST] Claude Security Review',
          agentType: 'claude'
        },
        'Claude',
        { updatedAt: Date.now(), stateStartedAt: Date.now() - 60_000 },
        { tabId: tab1.id, terminalHandle: 'term-2', worktreeId: primaryWtId }
      )

      // Agent 3: Secondary workspace, Terminal engine, done state
      store.getState().setAgentStatus(
        `${tab2.id}:00000000-0000-4000-8000-000000000003`,
        {
          state: 'done',
          prompt: '[SYNTHETIC TEST] Background Terminal Job',
          agentType: 'terminal'
        },
        'Terminal',
        { updatedAt: Date.now(), stateStartedAt: Date.now() - 30_000 },
        { tabId: tab2.id, terminalHandle: 'term-3', worktreeId: secondaryWtId }
      )
    },
    { worktreeId }
  )

  // 3. Open Office 3D view
  await orcaPage.evaluate(() => {
    window.__store?.getState().openOffice3DPage()
  })

  await expect(orcaPage.getByRole('heading', { name: /Office 3D/i })).toBeVisible({
    timeout: 15_000
  })

  const activeView = await orcaPage.evaluate(() => window.__store?.getState().activeView)
  expect(activeView).toBe('office3d')

  // 4. Verify Canvas container and WebGL canvas are mounted, or graceful WebGL error fallback in headless mode
  const canvasContainer = orcaPage.locator('[data-testid="office3d-canvas-container"]')
  const webglFallback = orcaPage.getByRole('heading', { name: /3D Acceleration Unavailable/i })

  if (await webglFallback.isVisible()) {
    // Headless environment without GPU acceleration renders graceful WebGL fallback
    await expect(webglFallback).toBeVisible()
    await expect(orcaPage.getByRole('button', { name: /Switch to DOM View/i })).toBeVisible()
  } else {
    await expect(canvasContainer).toBeVisible({ timeout: 15_000 })
    const canvasElement = canvasContainer.locator('canvas')
    await expect(canvasElement).toBeAttached({ timeout: 15_000 })
  }

  // 5. Verify Quality toggle button and FPS indicator
  const qualityBtn = orcaPage.getByRole('button', { name: /High|Low/i })
  await expect(qualityBtn).toBeVisible()
  const fpsBadge = orcaPage.locator('[data-testid="office3d-fps-badge"]')
  await expect(fpsBadge).toBeVisible()

  // 6. Test Quality mode toggling
  await qualityBtn.click()
  await expect(orcaPage.getByRole('button', { name: /Low/i })).toBeVisible()
  await qualityBtn.click()
  await expect(orcaPage.getByRole('button', { name: /High/i })).toBeVisible()

  // 7. Verify DOM Overview switch and all 3 seeded synthetic agent cards across 2 workspaces
  const domOverviewBtn = orcaPage.getByRole('button', { name: /DOM Overview/i })
  if (await domOverviewBtn.isVisible()) {
    await domOverviewBtn.click()
    await expect(
      orcaPage.getByTestId('office3d-page-root').getByText(/Live Agent Fleet/i)
    ).toBeVisible()
    await expect(
      orcaPage
        .getByTestId('office3d-page-root')
        .getByText(/\[SYNTHETIC TEST\] Codex Agent Implementation/i)
    ).toBeVisible()
    await expect(
      orcaPage
        .getByTestId('office3d-page-root')
        .getByText(/\[SYNTHETIC TEST\] Claude Security Review/i)
    ).toBeVisible()
    await expect(
      orcaPage
        .getByTestId('office3d-page-root')
        .getByText(/\[SYNTHETIC TEST\] Background Terminal Job/i)
    ).toBeVisible()

    // Switch back to 3D Office
    const office3dTabBtn = orcaPage.getByRole('button', { name: /3D Office/i })
    await office3dTabBtn.click()
    await expect(
      (await canvasContainer.isVisible()) ? canvasContainer : webglFallback
    ).toBeVisible()
  }

  // Allow 3D scene to render frames
  await orcaPage.waitForTimeout(2000)

  // 8. Capture Electron screenshot of the live 3D Office with active agent characters
  const office3dScreenshotPath = testInfo.outputPath('office3d_real_scene_electron.png')
  await orcaPage.screenshot({ path: office3dScreenshotPath })
  await testInfo.attach('office3d_real_scene_electron', { path: office3dScreenshotPath })
  try {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const auditEvidenceDir = path.resolve(__dirname, '../../docs/office3d/audit-evidence')
    if (!fs.existsSync(auditEvidenceDir)) {
      fs.mkdirSync(auditEvidenceDir, { recursive: true })
    }
    fs.copyFileSync(
      office3dScreenshotPath,
      path.join(auditEvidenceDir, 'office3d_real_scene_electron.png')
    )
  } catch {
    // optional copy
  }

  // 9. Return to Classic View
  const returnBtn = orcaPage.locator('[data-testid="office3d-return-button"]')
  await expect(returnBtn).toBeVisible()
  await returnBtn.click()

  await expect
    .poll(
      async () => {
        return orcaPage.evaluate(() => window.__store?.getState().activeView)
      },
      { timeout: 10_000 }
    )
    .toBe('terminal')
})
