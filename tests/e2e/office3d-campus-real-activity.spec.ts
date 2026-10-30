import type { Page } from '@stablyai/playwright-test'
import { expect, test } from './helpers/orca-app'
import { waitForSessionReady, waitForActiveWorktree } from './helpers/store'
import {
  getZoneDef,
  type CampusZoneId
} from '../../src/renderer/src/components/office3d/scene/campus/campus-layout'

// SwiftShader gives the hidden test window a software WebGL context so actors really render.
test.use({
  orcaAppExtraArgs: [
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist'
  ]
})

type ActorInfo = { employeeId: string; zoneId: CampusZoneId; x: number; z: number }

async function readActors(page: Page): Promise<ActorInfo[] | null> {
  return page.evaluate(() => {
    const state = (
      window as unknown as { __THREE_STATE__?: { scene: { getObjectByName(n: string): unknown } } }
    ).__THREE_STATE__
    const group = state?.scene.getObjectByName('campus-actors') as
      | {
          children: {
            userData: { campus?: { employeeId: string; zoneId: string } }
            position: { x: number; z: number }
          }[]
        }
      | undefined
    if (!group) {
      return null
    }
    return group.children
      .filter((c) => c.userData.campus)
      .map((c) => ({
        employeeId: c.userData.campus!.employeeId,
        zoneId: c.userData.campus!.zoneId as CampusZoneId,
        x: c.position.x,
        z: c.position.z
      }))
  })
}

function atZone(actor: ActorInfo): boolean {
  const { spot } = getZoneDef(actor.zoneId)
  return Math.hypot(actor.x - spot.x, actor.z - spot.z) < 4
}

async function setStatus(
  page: Page,
  paneKey: string,
  state: 'working' | 'waiting',
  command?: string
): Promise<void> {
  await page.evaluate(
    ({ paneKey, state, command }) => {
      const store = window.__store!
      const tabId = paneKey.split(':')[0]
      store.getState().setAgentStatus(
        paneKey,
        {
          state,
          prompt: `[TEST] campus ${paneKey}`,
          agentType: 'claude',
          // Orca keeps the last tool when a payload omits it, so "coding" is an explicit Edit.
          toolName: command ? 'Bash' : 'Edit',
          toolInput: command ?? 'src/app.ts'
        },
        'Claude',
        { updatedAt: Date.now(), stateStartedAt: Date.now() },
        {
          tabId,
          terminalHandle: undefined,
          worktreeId: store.getState().activeWorktreeId ?? undefined
        }
      )
    },
    { paneKey, state, command }
  )
}

test('Moonlight Campus moves real agents to the right zones and cleans up', async ({
  orcaPage
}) => {
  test.setTimeout(600_000)
  await waitForSessionReady(orcaPage)
  const worktreeId = await waitForActiveWorktree(orcaPage)

  const paneKeys = await orcaPage.evaluate((worktreeId) => {
    const store = window.__store!
    const current = store.getState().settings
    if (!current) {
      throw new Error('Settings are not loaded')
    }
    store.setState({
      settings: { ...current, enableOffice3D: true, experimentalAgentDashboardShowIdle: true }
    })
    return ['git', 'test', 'rest'].map((name, i) => {
      const state = store.getState()
      const tab = state.createTab(worktreeId, undefined, undefined, {
        activate: false,
        id: `campus-${name}-tab`
      })
      const leafId = `00000000-0000-4000-8000-00000000010${i}`
      state.terminalLayoutsByTabId[tab.id] = {
        root: { type: 'leaf', leafId },
        activeLeafId: leafId,
        expandedLeafId: null,
        ptyIdsByLeafId: {}
      }
      return `${tab.id}:${leafId}`
    })
  }, worktreeId)
  const [gitPane, testPane, restPane] = paneKeys

  await setStatus(orcaPage, gitPane, 'working', 'git push origin main')
  await setStatus(orcaPage, testPane, 'working', 'pnpm test')
  await setStatus(orcaPage, restPane, 'waiting')

  await orcaPage.evaluate(() => window.__store?.getState().openOffice3DPage())
  const canvas = orcaPage.locator('[data-testid="office3d-canvas-container"] canvas')
  await expect(canvas).toBeAttached({ timeout: 30_000 })
  await expect(orcaPage.getByRole('heading', { name: /3D Acceleration Unavailable/i })).toHaveCount(
    0
  )
  await expect(orcaPage.locator('[data-testid="campus-dev-preview"]')).toHaveCount(0)
  // Low quality keeps SwiftShader usable; it also rebuilds the director, exercising trip replay.
  await orcaPage.getByRole('button', { name: /^High$/ }).click()
  await expect(orcaPage.getByRole('button', { name: /^Low$/ })).toBeVisible()

  // 1. Three concurrent agents each walk to the zone their real status implies.
  await expect
    .poll(async () => (await readActors(orcaPage))?.map((a) => `${a.zoneId}:${atZone(a)}`).sort(), {
      timeout: 300_000
    })
    .toEqual(['git-station:true', 'testing-lab:true', 'waiting-garden:true'])

  // 2. Rapid flapping never duplicates an agent's actor.
  for (let i = 0; i < 5; i++) {
    await setStatus(orcaPage, restPane, 'working')
    await setStatus(orcaPage, restPane, 'waiting')
  }
  const afterFlap = (await readActors(orcaPage)) ?? []
  expect(new Set(afterFlap.map((a) => a.employeeId)).size).toBe(afterFlap.length)

  // 3. A vanished session's actor is removed immediately; a finished one walks home and goes away.
  await orcaPage.evaluate((pane) => window.__store?.getState().removeAgentStatus(pane), gitPane)
  await setStatus(orcaPage, testPane, 'working')
  await expect
    .poll(async () => (await readActors(orcaPage))?.some((a) => a.zoneId === 'git-station'), {
      timeout: 15_000
    })
    .toBe(false)
  await expect
    // Software GL runs ~1 FPS (0.1 s of sim per frame), so assert it leaves the station, not the walk home.
    .poll(
      async () =>
        (await readActors(orcaPage))?.some((a) => a.zoneId === 'testing-lab' && atZone(a)),
      {
        timeout: 300_000
      }
    )
    .toBe(false)

  // 4. Classic -> Office replays the still-waiting agent exactly once.
  await orcaPage.getByRole('button', { name: /Return to Classic View/i }).click()
  await expect(canvas).toHaveCount(0)
  await orcaPage.evaluate(() => window.__store?.getState().openOffice3DPage())
  await expect(canvas).toBeAttached({ timeout: 30_000 })
  await expect
    .poll(async () => (await readActors(orcaPage))?.map((a) => a.zoneId), { timeout: 60_000 })
    .toEqual(['waiting-garden'])
})
