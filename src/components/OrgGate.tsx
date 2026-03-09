'use client'

import { useOrganization, useOrganizationList, useAuth } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

/**
 * Client-side guard: redirects to /org-setup when the user has no active
 * organization. When the user HAS an org client-side but the JWT hasn't
 * been updated yet (Clerk cookie timing), force-calls setActive() to write
 * the org into the JWT so server-side auth().orgId is populated.
 */
export function OrgGate() {
  const { organization, isLoaded } = useOrganization()
  const { setActive }              = useOrganizationList()
  const { orgId }                  = useAuth()
  const router                     = useRouter()

  useEffect(() => {
    if (!isLoaded) return

    if (!organization) {
      router.push('/org-setup')
      return
    }

    // Org is known client-side but JWT doesn't have it yet — force activate
    if (!orgId && setActive) {
      setActive({ organization: organization.id })
    }
  }, [isLoaded, organization, orgId, router, setActive])

  return null
}
