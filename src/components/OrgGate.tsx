'use client'

import { useOrganization } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

/**
 * Client-side guard: redirects to /org-setup when the user has no
 * active organization. Using client-side hooks avoids the JWT timing
 * issue that caused redirect loops with server-side auth().
 */
export function OrgGate() {
  const { organization, isLoaded } = useOrganization()
  const router = useRouter()

  useEffect(() => {
    if (isLoaded && !organization) {
      router.push('/org-setup')
    }
  }, [isLoaded, organization, router])

  return null
}
