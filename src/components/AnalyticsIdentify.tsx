'use client'

import { useOrganization, useAuth } from '@clerk/nextjs'
import { useEffect, useRef } from 'react'
import { setUserProperties } from '@/lib/analytics'

export function AnalyticsIdentify() {
  const { organization, isLoaded } = useOrganization()
  const { orgRole } = useAuth()
  const identified = useRef(false)

  useEffect(() => {
    if (!isLoaded || !organization || identified.current) return
    identified.current = true

    setUserProperties({
      org_id: organization.id,
      user_role: orgRole ?? undefined,
    })
  }, [isLoaded, organization, orgRole])

  return null
}
