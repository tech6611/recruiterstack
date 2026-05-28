'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

/**
 * Client guard for the admin-side `/hris/*` pages. Until /api/me responds we
 * render a small loading state (to avoid a flash of admin UI for an
 * employee). On non-admin we redirect to /me.
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
        if (j?.data?.is_admin) setState('allowed')
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
