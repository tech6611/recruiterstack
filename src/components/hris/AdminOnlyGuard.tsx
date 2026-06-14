'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

// People-area capabilities — holding ANY of them grants entry to the /hris area.
// Per-page nav visibility and the API enforce the per-module specifics.
const HRIS_AREA_CAPS = [
  'people:view', 'onboarding:view', 'okrs:view',
  'documents:view', 'hr_cases:view', 'leave:view',
]

/**
 * Client guard for the admin-side `/hris/*` pages. Until /api/me responds we
 * render a small loading state (to avoid a flash of admin UI for an
 * employee). A member with no People-area capability is redirected to /me.
 */
export function AdminOnlyGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [state, setState] = useState<'loading' | 'allowed' | 'forbidden'>('loading')

  useEffect(() => {
    let alive = true
    fetch('/api/me')
      .then(r => r.ok ? r.json() : null)
      .then(j => {
        if (!alive) return
        const caps: string[] = j?.data?.capabilities ?? []
        const allowed = Boolean(j?.data?.is_admin) || HRIS_AREA_CAPS.some(c => caps.includes(c))
        if (allowed) setState('allowed')
        else {
          setState('forbidden')
          router.replace('/me')
        }
      })
      .catch(() => { if (alive) { setState('forbidden'); router.replace('/me') } })
    return () => { alive = false }
  }, [router])

  if (state !== 'allowed') {
    return (
      <div className="p-8 text-sm text-slate-400">
        {state === 'loading' ? 'Checking access…' : 'Redirecting…'}
      </div>
    )
  }
  return <>{children}</>
}
