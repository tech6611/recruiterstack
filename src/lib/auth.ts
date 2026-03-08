import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

/**
 * Extracts the Clerk org ID from the current request context.
 * Returns { orgId } if authenticated with an active org,
 * or a 401 NextResponse if not.
 *
 * Usage in API routes:
 *   const authResult = requireOrg()
 *   if (authResult instanceof NextResponse) return authResult
 *   const { orgId } = authResult
 */
export function requireOrg(): { orgId: string } | NextResponse {
  const { orgId } = auth()
  if (!orgId) {
    return NextResponse.json(
      { error: 'No organization selected. Please select or create a workspace.' },
      { status: 401 },
    )
  }
  return { orgId }
}

/**
 * Like requireOrg but returns null orgId instead of 401.
 * Use for read-only aggregation routes (dashboard, analytics, inbox)
 * where an empty response is better UX than an error during JWT refresh.
 */
export function getOrgId(): string | null {
  const { orgId } = auth()
  return orgId ?? null
}
