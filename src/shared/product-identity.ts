// Product a build ships as. Orca is the default; `ORCA_APP_IDENTITY=ai-nyx` builds a side-by-side
// app with its own name, Windows identity, profile and app-owned home directory.
// Mirrored for packaging in config/product-identity.cjs; product-identity.test.ts keeps both in sync.

// Substituted by electron.vite.config.ts in main builds; module-local so CLI/test configs need no global.
declare const ORCA_APP_IDENTITY: string | null | undefined

export type ProductIdentityId = 'orca' | 'ai-nyx'

export type ProductIdentity = {
  readonly id: ProductIdentityId
  /** Electron app name: derives userData (%APPDATA%\<name>) and the single-instance lock. */
  readonly productName: string
  /** Windows AppUserModelID (taskbar grouping, notifications); also the installer appId. */
  readonly appUserModelId: string
  readonly executableName: string
  readonly protocolScheme: string
  /** Directory under the user's home for app-owned state such as credentials and keybindings. */
  readonly homeDirName: string
  /** Only Orca builds may follow Orca's public release feed. */
  readonly autoUpdate: boolean
}

export const PRODUCT_IDENTITIES: Readonly<Record<ProductIdentityId, ProductIdentity>> = {
  orca: {
    id: 'orca',
    productName: 'Orca',
    appUserModelId: 'com.stablyai.orca',
    executableName: 'Orca',
    protocolScheme: 'orca',
    homeDirName: '.orca',
    autoUpdate: true
  },
  'ai-nyx': {
    id: 'ai-nyx',
    productName: 'AI-Nyx',
    appUserModelId: 'com.nyx.ainyx',
    executableName: 'AI-Nyx',
    protocolScheme: 'ai-nyx',
    homeDirName: '.ai-nyx',
    autoUpdate: false
  }
}

function isProductIdentityId(value: unknown): value is ProductIdentityId {
  return typeof value === 'string' && Object.hasOwn(PRODUCT_IDENTITIES, value)
}

/** Build-time define wins; the env carries it into CLI/daemon children built without the define. */
export function resolveProductIdentity(
  compiled: string | null | undefined,
  // Renderer bundles have no process; they always resolve to the default product.
  env: NodeJS.ProcessEnv = typeof process !== 'undefined' ? process.env : {}
): ProductIdentity {
  const requested = compiled ?? env.ORCA_APP_IDENTITY
  return PRODUCT_IDENTITIES[isProductIdentityId(requested) ? requested : 'orca']
}

export const PRODUCT_IDENTITY: ProductIdentity = resolveProductIdentity(
  // Without the define the identifier is undeclared at runtime, so only typeof is safe.
  // oxlint-disable-next-line unicorn/no-typeof-undefined
  typeof ORCA_APP_IDENTITY !== 'undefined' ? ORCA_APP_IDENTITY : null
)

/** App-owned state root (`~/.orca` for Orca); agent hook installs stay on the shared `~/.orca`. */
export function productHomeDirName(): string {
  return PRODUCT_IDENTITY.homeDirName
}
