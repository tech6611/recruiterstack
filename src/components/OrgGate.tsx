'use client'

import { useOrganization, useOrganizationList, useClerk, useAuth } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

/**
 * Client-side guard for the active-organization session.
 *
 * Three situations, in priority order:
 *   1. An org is active client-side but the JWT cookie hasn't caught up yet
 *      → force setActive() so server requests see the org.
 *   2. No active org, but the user IS a member of one or more orgs (their
 *      Clerk session simply has no active org selected — e.g. after a token
 *      refresh, a new device, or a transient Clerk blip). Silently re-activate
 *      their first membership instead of stranding them on /org-setup.
 *   3. No active org AND zero memberships → genuinely needs setup, redirect.
 *
 * We use useClerk().setActive() (always defined) rather than the one from
 * useOrganizationList() (can be undefined while loading).
 */
export function OrgGate() {
  const { organization, isLoaded } = useOrganization()
  const { setActive }              = useClerk()
  const { orgId }                  = useAuth()
  const { userMemberships, isLoaded: listLoaded } = useOrganizationList({
    userMemberships: true,
  })
  const router                     = useRouter()

  useEffect(() => {
    if (!isLoaded) return

    // 1. Org known client-side but JWT doesn't have it yet — force activate.
    if (organization) {
      if (!orgId) setActive({ organization: organization.id })
      return
    }

    // No active org. Wait for the membership list before deciding.
    if (!listLoaded) return

    const memberships = userMemberships?.data ?? []
    if (memberships.length > 0) {
      // 2. Self-heal: the user has a workspace, just none active. Activate it.
      setActive({ organization: memberships[0].organization.id })
      return
    }

    // 3. Genuinely no workspace — send to setup.
    router.push('/org-setup')
  }, [isLoaded, organization, orgId, listLoaded, userMemberships, router, setActive])

  return null
}
