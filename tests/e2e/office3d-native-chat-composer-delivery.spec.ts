import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Page } from '@stablyai/playwright-test'
import { expect, test } from './helpers/orca-app'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import { waitForActivePanePtyId, waitForActiveTerminalManager } from './helpers/terminal'
import { waitForPtyShellEcho } from './terminal-pty-readiness'

// NOT a real AI agent: a copy of node named `codex` logs the bytes it receives and, on Enter,
// appends the prompt plus an `ECHO:` reply to a Codex-format transcript. Orca's real foreground
// recognition, verified Native Chat delivery and transcript reader run end to end with no model call.
const STUB = [
  "const fs = require('node:fs')",
  'const [log, transcript] = process.argv.slice(2)',
  "let line = ''",
  'const record = (role, type, text) =>',
  "  fs.appendFileSync(transcript, JSON.stringify({ type: 'message', id: role + Date.now(), timestamp: new Date().toISOString(), role, content: [{ type, text }] }) + '\\n')",
  "fs.writeFileSync(transcript, JSON.stringify({ id: 'stub', timestamp: new Date().toISOString(), instructions: null }) + '\\n')",
  'process.stdin.setRawMode?.(true)',
  'process.stdin.resume()',
  "fs.writeFileSync(log, 'READY\\n')",
  "process.stdin.on('data', (d) => {",
  '  const text = d.toString()',
  '  if (text.includes(String.fromCharCode(3))) process.exit(0)',
  "  fs.appendFileSync(log, JSON.stringify(text) + '\\n')",
  '  for (const ch of text) {',
  "    if (ch === '\\r') {",
  "      if (line) { record('user', 'input_text', line); record('assistant', 'output_text', 'ECHO: ' + line) }",
  "      line = ''",
  "    } else if (ch >= ' ') line += ch",
  '  }',
  '})'
].join('\n')

type Stub = { exe: string; script: string }
type Pane = { tabId: string; leafId: string; ptyId: string }

function prepareStub(dir: string): Stub {
  mkdirSync(dir, { recursive: true })
  const exe = path.join(dir, process.platform === 'win32' ? 'codex.exe' : 'codex')
  copyFileSync(process.execPath, exe)
  const script = path.join(dir, 'stub.cjs')
  writeFileSync(script, STUB)
  return { exe, script }
}

function stubCommand(stub: Stub, log: string, transcript: string): string {
  const prefix = process.platform === 'win32' ? '& ' : ''
  return `${prefix}'${stub.exe}' '${stub.script}' '${log}' '${transcript}'\r`
}

function received(log: string): string {
  return existsSync(log) ? readFileSync(log, 'utf8') : ''
}

async function activePane(page: Page): Promise<Pane> {
  const ptyId = await waitForActivePanePtyId(page, 30_000)
  const ids = await page.evaluate(() => {
    const s = window.__store!.getState()
    const tabId = s.activeTabId!
    const layout = s.terminalLayoutsByTabId[tabId]
    return {
      tabId,
      leafId: layout?.activeLeafId ?? Object.keys(layout?.ptyIdsByLeafId ?? {})[0] ?? ''
    }
  })
  return { ...ids, ptyId }
}

async function seedCodexStatus(
  page: Page,
  pane: Pane,
  worktreeId: string,
  prompt: string,
  transcriptPath: string
) {
  await page.evaluate(
    ({ pane, worktreeId, prompt, transcriptPath }) => {
      window
        .__store!.getState()
        .setAgentStatus(
          `${pane.tabId}:${pane.leafId}`,
          { state: 'waiting', prompt, agentType: 'codex' },
          'Codex',
          { updatedAt: Date.now(), stateStartedAt: Date.now() },
          { tabId: pane.tabId, terminalHandle: pane.ptyId, worktreeId },
          { providerSession: { key: 'session_id', id: `m7-${pane.leafId}`, transcriptPath } }
        )
    },
    { pane, worktreeId, prompt, transcriptPath }
  )
}

async function sendFromComposer(page: Page, text: string): Promise<void> {
  const composer = page
    .locator('[data-testid="office3d-native-chat-surface"] [contenteditable="true"]')
    .first()
  await expect(composer).toBeVisible({ timeout: 15_000 })
  await composer.focus()
  await page.keyboard.type(text)
  await page.keyboard.press('Enter')
}

test('Office 3D Native Chat composer delivers only to the selected agent PTY (local stand-in agent)', async ({
  orcaPage
}, testInfo) => {
  test.setTimeout(240_000)
  await waitForSessionReady(orcaPage)
  await ensureTerminalVisible(orcaPage)
  await waitForActiveTerminalManager(orcaPage, 30_000)
  const worktreeId = await waitForActiveWorktree(orcaPage)
  const stub = prepareStub(testInfo.outputPath('fake-agent'))
  const logA = testInfo.outputPath('fake-agent', 'agent-a.log')
  const logB = testInfo.outputPath('fake-agent', 'agent-b.log')
  const transcriptA = testInfo.outputPath('fake-agent', 'agent-a.jsonl')
  const transcriptB = testInfo.outputPath('fake-agent', 'agent-b.jsonl')

  const paneA = await activePane(orcaPage)
  await waitForPtyShellEcho(orcaPage, paneA.ptyId, 15_000)
  await orcaPage.evaluate((wt) => {
    window.__store!.getState().createTab(wt, undefined, undefined, {
      activate: true,
      id: 'm7-agent-b'
    })
  }, worktreeId)
  await expect.poll(async () => (await activePane(orcaPage)).ptyId).not.toBe(paneA.ptyId)
  const paneB = await activePane(orcaPage)
  await waitForPtyShellEcho(orcaPage, paneB.ptyId, 15_000)

  for (const [pane, log, transcript] of [
    [paneA, logA, transcriptA],
    [paneB, logB, transcriptB]
  ] as const) {
    await orcaPage.evaluate(({ ptyId, cmd }) => window.api?.pty?.write?.(ptyId, cmd, 'driving'), {
      ptyId: pane.ptyId,
      cmd: stubCommand(stub, log, transcript)
    })
    await expect.poll(() => received(log), { timeout: 20_000 }).toContain('READY')
  }
  await seedCodexStatus(orcaPage, paneA, worktreeId, '[M7] Agent Alpha', transcriptA)
  await seedCodexStatus(orcaPage, paneB, worktreeId, '[M7] Agent Beta', transcriptB)

  await orcaPage.evaluate(() => {
    const s = window.__store!
    s.setState({ settings: { ...s.getState().settings!, enableOffice3D: true } })
    s.getState().openOffice3DPage()
  })
  const rightPanel = orcaPage.locator('[data-testid="office3d-right-panel"]')
  const preview = orcaPage.locator('[data-testid="agent-terminal-preview"]')

  // 1. Agent A: composer text reaches A's process, never B's.
  await rightPanel.getByRole('button', { name: /\[M7\] Agent Alpha/ }).click()
  await expect(preview).toHaveAttribute('data-pty-id', paneA.ptyId)
  await expect(orcaPage.locator('[data-testid="office3d-chat-safety-banner"]')).toHaveCount(0)
  const markerA = `NYXA${Date.now() % 100000}`
  await sendFromComposer(orcaPage, markerA)
  await expect.poll(() => received(logA), { timeout: 20_000 }).toContain(markerA)
  expect(received(logB)).not.toContain(markerA)
  // The stand-in's reply arrives through Orca's transcript reader into A's conversation.
  const chat = orcaPage.locator('[data-testid="office3d-native-chat-surface"]')
  await expect(chat.getByText(`ECHO: ${markerA}`)).toBeVisible({ timeout: 20_000 })

  // 2. Switching to Agent B re-targets the composer; A receives nothing new.
  await orcaPage.locator('button[title="Clear selection"]').first().click()
  await rightPanel.getByRole('button', { name: /\[M7\] Agent Beta/ }).click()
  await expect(preview).toHaveAttribute('data-pty-id', paneB.ptyId)
  const markerB = `NYXB${Date.now() % 100000}`
  await sendFromComposer(orcaPage, markerB)
  await expect.poll(() => received(logB), { timeout: 20_000 }).toContain(markerB)
  expect(received(logA)).not.toContain(markerB)
  await expect(chat.getByText(`ECHO: ${markerB}`)).toBeVisible({ timeout: 20_000 })
  await expect(chat.getByText(`ECHO: ${markerA}`)).toHaveCount(0)

  // 3. Classic <-> Office keeps both agent sessions alive.
  await orcaPage.getByRole('button', { name: /Return to Classic View/i }).click()
  await orcaPage.evaluate(() => window.__store!.getState().openOffice3DPage())
  await expect(rightPanel.getByText('[M7] Agent Alpha')).toBeVisible({ timeout: 15_000 })
  await expect(rightPanel.getByText('[M7] Agent Beta')).toBeVisible()

  await rightPanel.getByRole('button', { name: /\[M7\] Agent Alpha/ }).click()
  await expect(chat.getByText(`ECHO: ${markerA}`)).toBeVisible({ timeout: 20_000 })
  await expect(chat.getByText(`ECHO: ${markerB}`)).toHaveCount(0)
  await orcaPage.locator('button[title="Clear selection"]').first().click()

  // 4. Agent A exits: Orca ends its session and Office 3D drops it; B is unaffected.
  await orcaPage.evaluate(
    (ptyId) => window.api?.pty?.write?.(ptyId, '\u0003', 'driving'),
    paneA.ptyId
  )
  await expect(rightPanel.getByText('[M7] Agent Alpha')).toHaveCount(0, { timeout: 30_000 })
  await expect(rightPanel.getByText('[M7] Agent Beta')).toBeVisible()
})
