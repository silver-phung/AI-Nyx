import { _electron as electron, expect, test } from '@stablyai/playwright-test'
import asar from '@electron/asar'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { getE2ECompletedOnboardingProfile } from './helpers/e2e-completed-onboarding-profile'
import { createElectronHomeIsolation } from './helpers/electron-home-isolation'
import { closeElectronAppForE2E } from './helpers/electron-process-shutdown'

// Release gate for a locally packaged Windows build (`electron-builder --win`). It launches the real
// packaged exe hidden, in a throwaway profile and home, so it never touches an installed Orca or AI-Nyx.
const UNPACKED_DIR = path.join(process.cwd(), 'dist', 'win-unpacked')
const PACKAGED = [
  { exe: 'AI-Nyx.exe', productName: 'AI-Nyx', identity: 'ai-nyx' },
  { exe: 'Orca.exe', productName: 'Orca', identity: undefined }
].find((candidate) => existsSync(path.join(UNPACKED_DIR, candidate.exe)))

test.skip(process.platform !== 'win32' || !PACKAGED, 'needs a packaged dist/win-unpacked build')

test('packaged Windows build loads Moonlight Campus assets and round-trips Classic', async () => {
  test.setTimeout(180_000)
  const userDataDir = mkdtempSync(path.join(os.tmpdir(), 'orca-packaged-smoke-'))
  const profile = getE2ECompletedOnboardingProfile()
  writeFileSync(
    path.join(userDataDir, 'orca-data.json'),
    `${JSON.stringify(
      {
        ...profile, // AI-Nyx must reach Moonlight Campus by default; only Orca keeps it opt-in.
        settings: { ...profile.settings, ...(PACKAGED?.identity ? {} : { enableOffice3D: true }) }
      },
      null,
      2
    )}\n`
  )
  const { ELECTRON_RUN_AS_NODE: _unused, ...inheritedEnv } = process.env
  void _unused
  const isolation = createElectronHomeIsolation({
    inheritedEnv,
    launchEnv: {},
    extraEnv: { ORCA_BACKGROUND_LAUNCH: '1' },
    userDataDir
  })
  const app = await electron.launch({
    executablePath: path.join(UNPACKED_DIR, PACKAGED!.exe),
    args: [],
    env: { ...isolation.env, ORCA_E2E_HEADLESS: '1' }
  })
  try {
    const runtime = await app.evaluate(({ app }) => ({
      isPackaged: app.isPackaged,
      name: app.getName(),
      identity: process.env.ORCA_APP_IDENTITY
    }))
    expect(runtime).toEqual({
      isPackaged: true,
      name: PACKAGED!.productName,
      identity: PACKAGED!.identity
    })
    // Electron names the default profile and NSIS the install folder after the packaged name.
    const packagedName = (
      JSON.parse(
        asar
          .extractFile(path.join(UNPACKED_DIR, 'resources', 'app.asar'), 'package.json')
          .toString()
      ) as { name: string }
    ).name
    expect(packagedName).toBe(PACKAGED!.identity === undefined ? 'orca' : PACKAGED!.productName)
    // Side-by-side products ship no update feed, so they can never install Orca's releases.
    expect(existsSync(path.join(UNPACKED_DIR, 'resources', 'app-update.yml'))).toBe(
      PACKAGED!.identity === undefined
    )
    const page = await app.firstWindow({ timeout: 120_000 })
    const failedAssets: string[] = []
    page.on('requestfailed', (request) => failedAssets.push(request.url()))
    page.on('console', (message) => {
      if (message.type() === 'error' && /models\/office3d|glb/i.test(message.text())) {
        failedAssets.push(message.text())
      }
    })

    const office3dNav = page.getByRole('button', { name: /^Office 3D$/ }).first()
    await expect(office3dNav).toBeVisible({ timeout: 60_000 })
    await office3dNav.click()
    await expect(page.getByRole('heading', { name: /Office 3D/i })).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-testid="office3d-canvas-container"] canvas')).toBeAttached({
      timeout: 30_000
    })
    // Give the GLB loaders time to resolve; a missing model surfaces as the WebGL fallback.
    await page.waitForTimeout(8_000)
    await expect(page.getByRole('heading', { name: /3D Acceleration Unavailable/i })).toHaveCount(0)
    await expect(page.locator('[data-testid="campus-dev-preview"]')).toHaveCount(0)
    expect(failedAssets.filter((url) => /models\/office3d|\.glb/i.test(url))).toEqual([])

    const metrics = await app.evaluate(({ app }) => {
      const all = app.getAppMetrics()
      return {
        processes: all.length,
        workingSetMB: Math.round(all.reduce((sum, m) => sum + m.memory.workingSetSize, 0) / 1024),
        cpuPercent: Math.round(all.reduce((sum, m) => sum + m.cpu.percentCPUUsage, 0))
      }
    })
    console.log('[packaged-smoke] metrics', JSON.stringify(metrics))

    await page.getByRole('button', { name: /Return to Classic View/i }).click()
    await expect(page.getByRole('heading', { name: /Office 3D/i })).toHaveCount(0)
    await expect(page.locator('[data-testid="office3d-canvas-container"]')).toHaveCount(0)
  } finally {
    await closeElectronAppForE2E(app, { cleanupDaemonsForUserDataDir: userDataDir })
    rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5 })
  }
})
