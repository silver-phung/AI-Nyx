import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { PRODUCT_IDENTITIES, resolveProductIdentity } from './product-identity'

const require = createRequire(import.meta.url)
const packaging = require('../../config/product-identity.cjs') as {
  PRODUCT_IDENTITIES: unknown
  resolveProductIdentity: (env: NodeJS.ProcessEnv) => unknown
}

describe('product identity', () => {
  it('keeps the packaging mirror identical to the runtime table', () => {
    expect(packaging.PRODUCT_IDENTITIES).toEqual(PRODUCT_IDENTITIES)
  })

  it('defaults to Orca and lets the env reach children built without the define', () => {
    expect(resolveProductIdentity(null, {}).id).toBe('orca')
    expect(resolveProductIdentity(null, { ORCA_APP_IDENTITY: 'ai-nyx' }).id).toBe('ai-nyx')
    expect(resolveProductIdentity('ai-nyx', { ORCA_APP_IDENTITY: 'orca' }).id).toBe('ai-nyx')
    expect(resolveProductIdentity(null, { ORCA_APP_IDENTITY: 'unknown' }).id).toBe('orca')
  })

  it('gives AI-Nyx nothing Orca stable owns', () => {
    const orca = PRODUCT_IDENTITIES.orca
    const nyx = PRODUCT_IDENTITIES['ai-nyx']
    for (const key of [
      'productName',
      'appUserModelId',
      'executableName',
      'protocolScheme',
      'homeDirName'
    ] as const) {
      expect(nyx[key]).not.toBe(orca[key])
    }
    expect(nyx.autoUpdate).toBe(false)
  })

  it('refuses an unknown identity at packaging time', () => {
    expect(() => packaging.resolveProductIdentity({ ORCA_APP_IDENTITY: 'nope' })).toThrow()
  })
})
