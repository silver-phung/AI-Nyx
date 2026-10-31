import os from 'node:os'
import type { Page } from '@stablyai/playwright-test'
import { expect, test } from './helpers/orca-app'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import { waitForActivePanePtyId, waitForActiveTerminalManager } from './helpers/terminal'
import { getTerminalContentForPtyId, waitForPtyShellEcho } from './terminal-pty-readiness'

// PAID, OWNER-APPROVED ONLY: drives a real, logged-in Claude Code session through Office 3D Native Chat.
// Claude runs in the isolated app's terminal with the real home only for that process, so it uses the
// existing login while Orca's hooks (routed by the terminal's env) report to this test app.
const REAL_HOME = os.homedir()

test.skip(
  process.env.ORCA_E2E_REAL_AGENT !== '1',
  'set ORCA_E2E_REAL_AGENT=1 to spend real model usage'
)

// Serialized buffers encode gaps as cursor-forward escapes; expand them so words stay matchable.
async function terminalText(page: Page, ptyId: string): Promise<string> {
  const raw = await getTerminalContentForPtyId(page, ptyId, 20_000)
  const esc = String.fromCharCode(27)
  return raw
    .replace(new RegExp(`${esc}\\[(\\d*)C`, 'g'), (_, n: string) => ' '.repeat(Number(n || 1)))
    .replace(new RegExp(`${esc}\\[[0-9;?]*[A-Za-z]`, 'g'), '')
}

async function sendFromComposer(page: Page, text: string): Promise<void> {
  const composer = page
    .locator('[data-testid="office3d-native-chat-surface"] [contenteditable="true"]')
    .first()
  await expect(composer).toBeVisible({ timeout: 30_000 })
  await composer.focus()
  await page.keyboard.type(text)
  await page.keyboard.press('Enter')
}

test('real Claude Code agent through Office 3D Native Chat', async ({ orcaPage }, testInfo) => {
  test.setTimeout(420_000)
  await waitForSessionReady(orcaPage)
  await ensureTerminalVisible(orcaPage)
  await waitForActiveTerminalManager(orcaPage, 30_000)
  await waitForActiveWorktree(orcaPage)
  const ptyId = await waitForActivePanePtyId(orcaPage, 30_000)
  await waitForPtyShellEcho(orcaPage, ptyId, 15_000)
  const paneKey = await orcaPage.evaluate(() => {
    const s = window.__store!.getState()
    const tabId = s.activeTabId!
    const layout = s.terminalLayoutsByTabId[tabId]
    return `${tabId}:${layout?.activeLeafId ?? ''}`
  })

  const launch =
    process.platform === 'win32'
      ? `$env:USERPROFILE='${REAL_HOME}'; $env:HOME='${REAL_HOME}'; claude --model haiku\r`
      : `HOME='${REAL_HOME}' claude --model haiku\r`
  await orcaPage.evaluate(
    ({ ptyId, launch }) => window.api?.pty?.write?.(ptyId, launch, 'driving'),
    {
      ptyId,
      launch
    }
  )

  // First run in the throwaway repo asks to trust the folder; its default is "No, exit", so pick "Yes".
  await expect
    .poll(
      async () =>
        /trust this folder|for shortcuts|\? for/i.test(await terminalText(orcaPage, ptyId)),
      {
        timeout: 60_000
      }
    )
    .toBe(true)
  if (/trust this folder/i.test(await terminalText(orcaPage, ptyId))) {
    await orcaPage.evaluate(
      (ptyId) => window.api?.pty?.write?.(ptyId, '\u001b[B', 'driving'),
      ptyId
    )
    await orcaPage.waitForTimeout(500)
    await orcaPage.evaluate((ptyId) => window.api?.pty?.write?.(ptyId, '\r', 'driving'), ptyId)
  }
  await expect
    .poll(
      () =>
        orcaPage.evaluate(
          (key) => window.__store!.getState().agentStatusByPaneKey[key]?.agentType ?? null,
          paneKey
        ),
      { timeout: 60_000 }
    )
    .toBe('claude')

  await orcaPage.evaluate(() => {
    const s = window.__store!
    s.setState({ settings: { ...s.getState().settings!, enableOffice3D: true } })
    s.getState().openOffice3DPage()
  })
  const rightPanel = orcaPage.locator('[data-testid="office3d-right-panel"]')
  await rightPanel.getByRole('button', { name: /Active Sessions/i }).click()
  await rightPanel
    .locator('[data-testid="office3d-session-card"]')
    .first()
    .getByRole('button', { name: /Select in 3D/i })
    .click()
  await rightPanel.getByRole('button', { name: /^Chat$/i }).click()
  await expect(orcaPage.locator('[data-testid="agent-terminal-preview"]')).toHaveAttribute(
    'data-pty-id',
    ptyId
  )
  await expect(orcaPage.locator('[data-testid="office3d-chat-safety-banner"]')).toHaveCount(0)
  const chat = orcaPage.locator('[data-testid="office3d-native-chat-surface"]')

  // Turn 1: prompt -> real reply in this session's conversation.
  // The expected token never appears in the prompt, so only a real reply can satisfy the check.
  await sendFromComposer(
    orcaPage,
    'Reply with one word: the text NYX, an underscore, then REAL_OK. Nothing else.'
  )
  await expect(chat.getByText('NYX_REAL_OK', { exact: true })).toBeVisible({ timeout: 120_000 })
  await orcaPage.screenshot({ path: testInfo.outputPath('turn1-reply.png') })

  // Turn 2: a tool call that needs approval, answered from Office 3D.
  await sendFromComposer(
    orcaPage,
    'Use the Bash tool to run exactly: echo NYX_APPROVAL_$((40+2)) and then stop.'
  )
  // The user's own Claude permission rules decide whether this command needs approval at all.
  const approve = chat.getByRole('button', { name: /^(Yes|Allow|Approve)\b/i }).first()
  const result = chat.getByText(/NYX_APPROVAL_42/).last()
  await expect(approve.or(result)).toBeVisible({ timeout: 120_000 })
  const approvalShown = await approve.isVisible()
  testInfo.annotations.push({ type: 'approval-prompt', description: String(approvalShown) })
  if (approvalShown) {
    await orcaPage.screenshot({ path: testInfo.outputPath('turn2-approval.png') })
    await approve.click()
  }
  await expect(result).toBeVisible({ timeout: 120_000 })
  await orcaPage.screenshot({ path: testInfo.outputPath('turn2-done.png') })

  // Conversation survives Classic <-> Office and reselection.
  await orcaPage.getByRole('button', { name: /Return to Classic View/i }).click()
  await orcaPage.evaluate(() => window.__store!.getState().openOffice3DPage())
  await rightPanel.getByRole('button', { name: /Active Sessions/i }).click()
  await rightPanel
    .locator('[data-testid="office3d-session-card"]')
    .first()
    .getByRole('button', { name: /Select in 3D/i })
    .click()
  await rightPanel.getByRole('button', { name: /^Chat$/i }).click()
  await expect(chat.getByText('NYX_REAL_OK', { exact: true })).toBeVisible({ timeout: 30_000 })
  await orcaPage.screenshot({ path: testInfo.outputPath('restored.png') })
})
