import { expect, test } from './helpers/orca-app'
import { waitForSessionReady, ensureTerminalVisible } from './helpers/store'
import {
  execInTerminal,
  waitForActivePanePtyId,
  waitForActiveTerminalManager,
  waitForTerminalOutput
} from './helpers/terminal'
import { readPaneIdentitySnapshot, getTerminalContent } from './helpers/terminal-pane-identity'
import { splitMarkerEchoCommand } from './terminal-marker-echo-command'
import { waitForPtyShellEcho } from './terminal-pty-readiness'

test('Phase G: Real Electron verification — Office 3D flag, navigation, terminal continuity, safe disabling', async ({
  orcaPage
}, testInfo) => {
  test.setTimeout(120_000)
  await waitForSessionReady(orcaPage)
  await ensureTerminalVisible(orcaPage)
  await waitForActiveTerminalManager(orcaPage, 30_000)

  // 1. Initial State: enableOffice3D is false (or undefined, defaulting to false)
  const initialFlag = await orcaPage.evaluate(
    () => window.__store?.getState().settings?.enableOffice3D ?? false
  )
  expect(initialFlag).toBe(false)

  // Sidebar must NOT show office3d nav item
  const officeSidebarButton = orcaPage.getByRole('button', { name: /Office 3D/i })
  await expect(officeSidebarButton).toHaveCount(0)

  // Guarded open: openOffice3DPage() must be blocked when flag is false
  await orcaPage.evaluate(() => {
    window.__store?.getState().openOffice3DPage()
  })
  const viewAfterGuardedOpen = await orcaPage.evaluate(() => window.__store?.getState().activeView)
  expect(viewAfterGuardedOpen).toBe('terminal')

  // Capture Classic screenshot using testInfo.outputPath() and testInfo.attach()
  const classicScreenshotPath = testInfo.outputPath('office3d_electron_classic.png')
  await orcaPage.screenshot({ path: classicScreenshotPath })
  await testInfo.attach('office3d_electron_classic', { path: classicScreenshotPath })

  // 2. Terminal Process Continuity Preparation
  // Obtain the actual PTY ID from the active terminal pane
  const initialPtyId = await waitForActivePanePtyId(orcaPage, 30_000)
  expect(initialPtyId).toBeTruthy()

  const preSwitchSnapshot = await readPaneIdentitySnapshot(orcaPage)
  expect(preSwitchSnapshot).not.toBeNull()
  expect(preSwitchSnapshot?.panes.length).toBeGreaterThan(0)
  const preSwitchPtyIds = preSwitchSnapshot!.panes.map((p) => p.ptyId).filter(Boolean)

  // Write a recognizable terminal output marker into this shell session
  await waitForPtyShellEcho(orcaPage, initialPtyId, 15_000)
  const marker = `NYX_PTY_CONTINUITY_${Date.now()}`
  await execInTerminal(
    orcaPage,
    initialPtyId,
    splitMarkerEchoCommand(marker.slice(0, 10), marker.slice(10))
  )
  await waitForTerminalOutput(orcaPage, marker, 20_000)

  // 3. Enable Office 3D flag via Settings UI interaction
  // Open Settings
  await orcaPage.evaluate(() => window.__store?.getState().openSettingsPage())
  await expect(orcaPage.getByRole('button', { name: /Back to app/i })).toBeVisible({
    timeout: 10_000
  })

  // Navigate to Experimental section in Settings sidebar
  const experimentalSectionBtn = orcaPage.getByRole('button', { name: /Experimental/i })
  if (await experimentalSectionBtn.isVisible()) {
    await experimentalSectionBtn.click()
  }

  // Toggle Office 3D switch in the Experimental section
  const office3dToggle = orcaPage.getByRole('switch', { name: /Toggle Office 3D/i })
  await expect(office3dToggle).toBeVisible({ timeout: 10_000 })
  await office3dToggle.click()

  // Verify setting flag updated in store
  await expect
    .poll(
      async () => {
        return orcaPage.evaluate(() => window.__store?.getState().settings?.enableOffice3D)
      },
      { timeout: 10_000 }
    )
    .toBe(true)

  // Return to workspace view via "Back to app" button
  await orcaPage.getByRole('button', { name: /Back to app/i }).click()
  await expect
    .poll(
      async () => {
        return orcaPage.evaluate(() => window.__store?.getState().activeView)
      },
      { timeout: 10_000 }
    )
    .toBe('terminal')

  // Sidebar now renders the Office 3D button
  await expect(officeSidebarButton).toBeVisible({ timeout: 10_000 })

  // 4. Switch to Office 3D via sidebar click
  await officeSidebarButton.click()
  await expect(orcaPage.getByRole('heading', { name: /Office 3D/i })).toBeVisible({
    timeout: 10_000
  })
  const activeViewOffice = await orcaPage.evaluate(() => window.__store?.getState().activeView)
  expect(activeViewOffice).toBe('office3d')

  // UNCONDITIONAL assertion: Terminal workbench container remains mounted in DOM with inert and aria-hidden
  const workbenchContainer = orcaPage.locator('[data-terminal-workbench-container]')
  await expect(workbenchContainer).toBeAttached()
  await expect(workbenchContainer).toHaveAttribute('inert', '')
  await expect(workbenchContainer).toHaveAttribute('aria-hidden', 'true')

  // Capture Office 3D screenshot
  const officeScreenshotPath = testInfo.outputPath('office3d_electron_office.png')
  await orcaPage.screenshot({ path: officeScreenshotPath })
  await testInfo.attach('office3d_electron_office', { path: officeScreenshotPath })

  // 5. Return to Classic View via return button on Office 3D page
  const returnButton = orcaPage.locator('[data-testid="office3d-return-button"]')
  await expect(returnButton).toBeVisible()
  await returnButton.click()

  // Active view restored to Classic
  await expect
    .poll(
      async () => {
        return orcaPage.evaluate(() => window.__store?.getState().activeView)
      },
      { timeout: 10_000 }
    )
    .toBe('terminal')

  // Terminal workbench container is visible again (inert removed, aria-hidden false)
  await expect(workbenchContainer).toBeAttached()
  await expect(workbenchContainer).not.toHaveAttribute('inert', '')
  await expect(workbenchContainer).toHaveAttribute('aria-hidden', 'false')

  // 6. Verify actual Terminal Process Continuity
  const postSwitchPtyId = await waitForActivePanePtyId(orcaPage, 30_000)
  expect(postSwitchPtyId).toBe(initialPtyId)

  const postSwitchSnapshot = await readPaneIdentitySnapshot(orcaPage)
  expect(postSwitchSnapshot).not.toBeNull()
  const postSwitchPtyIds = postSwitchSnapshot!.panes.map((p) => p.ptyId).filter(Boolean)
  // Assert both IDs are identical and no replacement PTY was spawned
  expect(postSwitchPtyIds).toEqual(preSwitchPtyIds)

  // Verify terminal output marker survived the transition
  const terminalContent = await getTerminalContent(orcaPage)
  expect(terminalContent).toContain(marker)

  // 7. Safe Runtime Disabling (Fix H2) via UI
  // Step A: Switch back to Office 3D via sidebar
  await officeSidebarButton.click()
  await expect
    .poll(
      async () => {
        return orcaPage.evaluate(() => window.__store?.getState().activeView)
      },
      { timeout: 10_000 }
    )
    .toBe('office3d')

  // Step B: Open Settings while in Office 3D
  await orcaPage.evaluate(() => window.__store?.getState().openSettingsPage())
  expect(await orcaPage.evaluate(() => window.__store?.getState().activeView)).toBe('settings')
  expect(await orcaPage.evaluate(() => window.__store?.getState().previousViewBeforeSettings)).toBe(
    'office3d'
  )

  // Step C: Disable Office 3D toggle in Settings UI
  if (await experimentalSectionBtn.isVisible()) {
    await experimentalSectionBtn.click()
  }
  await expect(office3dToggle).toBeVisible({ timeout: 10_000 })
  await office3dToggle.click()

  // Verify flag is false
  await expect
    .poll(
      async () => {
        return orcaPage.evaluate(() => window.__store?.getState().settings?.enableOffice3D)
      },
      { timeout: 10_000 }
    )
    .toBe(false)

  // Reactive sanitization cleans previousViewBeforeSettings from disabled office3d to terminal
  expect(await orcaPage.evaluate(() => window.__store?.getState().previousViewBeforeSettings)).toBe(
    'terminal'
  )

  // Step D: Close Settings via "Back to app" button — must safely return to Classic ('terminal'), NOT disabled Office 3D
  await orcaPage.getByRole('button', { name: /Back to app/i }).click()
  await expect
    .poll(
      async () => {
        return orcaPage.evaluate(() => window.__store?.getState().activeView)
      },
      { timeout: 10_000 }
    )
    .toBe('terminal')

  // Sidebar no longer renders the Office 3D button
  await expect(officeSidebarButton).toHaveCount(0)

  // Capture final restored classic screenshot
  const restoredScreenshotPath = testInfo.outputPath('office3d_electron_restored_classic.png')
  await orcaPage.screenshot({ path: restoredScreenshotPath })
  await testInfo.attach('office3d_electron_restored_classic', { path: restoredScreenshotPath })
})
