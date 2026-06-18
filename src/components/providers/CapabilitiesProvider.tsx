'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { Capability } from '@/lib/permissions'

interface CapabilitiesValue {
  /** Effective RBAC capabilities for the viewer. Empty until the first load resolves. */
  capabilities: Set<Capability>
  /** True while the initial /api/me fetch is in flight — render skeletons, not partial chrome. */
  loading: boolean
  /** Convenience: does the viewer hold this capability? */
  can: (cap: Capability) => boolean
}

const CapabilitiesContext = createContext<CapabilitiesValue | null>(null)

/**
 * Fetches the viewer's capabilities from /api/me exactly once and shares them
 * across the dashboard. Surfaces (Sidebar, Settings, future admin pages) read
 * from this context instead of each firing their own /api/me — that removes the
 * duplicate requests and the per-surface flash where capability-gated chrome
 * popped in after a late fetch. The one remaining unknown window (cold load,
 * before this resolves) is signalled via `loading` so consumers can render a
 * stable placeholder instead of a partial menu.
 */
export function CapabilitiesProvider({ children }: { children: React.ReactNode }) {
  const [capabilities, setCapabilities] = useState<Set<Capability>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    fetch('/api/me')
      .then(r => (r.ok ? r.json() : null))
      .then(j => {
        if (!alive) return
        setCapabilities(new Set<Capability>(j?.data?.capabilities ?? []))
      })
      .catch(() => {
        if (alive) setCapabilities(new Set<Capability>())
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => { alive = false }
  }, [])

  const value: CapabilitiesValue = {
    capabilities,
    loading,
    can: (cap: Capability) => capabilities.has(cap),
  }

  return <CapabilitiesContext.Provider value={value}>{children}</CapabilitiesContext.Provider>
}

/** Read the shared capability set. Must be used under a CapabilitiesProvider. */
export function useCapabilities(): CapabilitiesValue {
  const ctx = useContext(CapabilitiesContext)
  if (!ctx) throw new Error('useCapabilities must be used within a CapabilitiesProvider')
  return ctx
}
