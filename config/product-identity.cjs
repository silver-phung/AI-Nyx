// Packaging mirror of src/shared/product-identity.ts (kept in sync by product-identity.test.ts).
const PRODUCT_IDENTITIES = {
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

function resolveProductIdentity(env = process.env) {
  const requested = env.ORCA_APP_IDENTITY
  if (requested && !Object.hasOwn(PRODUCT_IDENTITIES, requested)) {
    throw new Error(`Unknown ORCA_APP_IDENTITY "${requested}"`)
  }
  return PRODUCT_IDENTITIES[requested || 'orca']
}

module.exports = { PRODUCT_IDENTITIES, resolveProductIdentity }
