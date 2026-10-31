import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const appMock = vi.hoisted(() => ({
  getPath: vi.fn((name: string) => (name === 'appData' ? 'C:\\Users\\me\\AppData\\Roaming' : '')),
  setPath: vi.fn(),
  quit: vi.fn(),
  exit: vi.fn(),
  isPackaged: true,
  disableHardwareAcceleration: vi.fn(),
  commandLine: { appendSwitch: vi.fn(), getSwitchValue: vi.fn(() => '') }
}))

vi.mock('electron', () => ({ app: appMock }))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
  appMock.setPath.mockClear()
})

async function loadWithIdentity(identity: string | undefined) {
  vi.stubEnv('ORCA_E2E_USER_DATA_DIR', '')
  vi.stubEnv('ORCA_APP_IDENTITY', identity ?? '')
  vi.resetModules()
  return import('./configure-process')
}

describe('packaged product profile', () => {
  it('pins a side-by-side product to its own profile instead of Orca’s', async () => {
    const { configureDevUserDataPath } = await loadWithIdentity('ai-nyx')
    configureDevUserDataPath(false)
    expect(appMock.setPath).toHaveBeenCalledWith(
      'userData',
      join('C:\\Users\\me\\AppData\\Roaming', 'AI-Nyx')
    )
  })

  it('leaves packaged Orca on Electron’s default profile', async () => {
    const { configureDevUserDataPath } = await loadWithIdentity(undefined)
    configureDevUserDataPath(false)
    expect(appMock.setPath).not.toHaveBeenCalled()
  })
})
