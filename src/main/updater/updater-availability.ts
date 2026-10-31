import { app } from 'electron'
import { PRODUCT_IDENTITY } from '../../shared/product-identity'

/** Side-by-side products must never install Orca's public releases over themselves. */
export function isAutoUpdateAvailable(): boolean {
  return app.isPackaged && PRODUCT_IDENTITY.autoUpdate
}
