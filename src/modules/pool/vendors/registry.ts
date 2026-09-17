/**
 * Adapter registry (S1).
 *
 * The one place that knows which adapters exist. Everything downstream takes a
 * `sourceKey` string and looks it up here, which is what keeps stages 4–6 free of
 * vendor names.
 *
 * Registering a vendor is two lines here plus a `pool_sources` row. If adding one
 * ever needs a change outside `vendors/<name>/` and these two lines, the adapter
 * contract was wrong — that's the S4 test.
 */
import type { VendorAdapter } from '@/modules/pool/vendors/types'
import { mockVendorAdapter } from '@/modules/pool/vendors/mock/adapter'
import { crustdataAdapter } from '@/modules/pool/vendors/crustdata/adapter'

const ADAPTERS: Record<string, VendorAdapter> = {
  [mockVendorAdapter.sourceKey]: mockVendorAdapter,
  [crustdataAdapter.sourceKey]: crustdataAdapter,
  // S2: [coresignalAdapter.sourceKey]: coresignalAdapter,
  // S4: [pdlAdapter.sourceKey]: pdlAdapter,
}

/** Null rather than throwing — a source row can exist before its adapter does. */
export function getAdapter(sourceKey: string): VendorAdapter | null {
  return ADAPTERS[sourceKey] ?? null
}

export function requireAdapter(sourceKey: string): VendorAdapter {
  const a = getAdapter(sourceKey)
  if (!a) throw new Error(`No vendor adapter registered for source "${sourceKey}"`)
  return a
}

export function registeredSourceKeys(): string[] {
  return Object.keys(ADAPTERS).sort()
}
