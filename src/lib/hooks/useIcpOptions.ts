'use client'

import { useEffect, useState } from 'react'
import { EMPTY_OPTIONS, type FetchedOptions } from '@/lib/icp-options'

/**
 * The database-backed suggestion lists for the ideal-profile pickers.
 *
 * Fetched once per page load and shared by every picker on it — the lists are the same
 * for all of them, and each pill opening its own request would be several hundred
 * kilobytes of identical JSON. The promise is cached at module scope rather than in
 * state so two pickers mounting in the same tick make one request, not two.
 *
 * A failure is silent by design: the pickers fall back to free text, which is exactly
 * what the field was before. A suggestion list going missing must not stop someone
 * writing an ICP.
 */
let inflight: Promise<FetchedOptions> | null = null

function load(): Promise<FetchedOptions> {
  inflight ??= fetch('/api/icp/options')
    .then((r) => (r.ok ? r.json() : EMPTY_OPTIONS))
    .then((j: Partial<FetchedOptions>) => ({ ...EMPTY_OPTIONS, ...j }))
    .catch(() => EMPTY_OPTIONS)
  return inflight
}

export function useIcpOptions(): FetchedOptions {
  const [options, setOptions] = useState<FetchedOptions>(EMPTY_OPTIONS)
  useEffect(() => {
    let live = true
    load().then((o) => { if (live) setOptions(o) })
    return () => { live = false }
  }, [])
  return options
}
