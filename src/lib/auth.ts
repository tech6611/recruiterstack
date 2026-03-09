import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

/**
 * Falls back to Clerk Management API when orgId is missing from the JWT.
 * Handles the race condition where the client has an active org but the
 * JWT cookie hasn't been updated yet.
 */
async function lookupOrgId(userId: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.clerk.com/v1/users/${userId}/organization_memberships?limit=1`,
      { headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` } },
    )
    if (!res.ok) return null
    const { data } = await res.json()
    return (data?.[0]?.organization?.id as string) ?? null
  } catch {
    return null
  }
}

/**
 * Returns { orgId } if authenticated with an active org, or a 401 NextResponse.
 * Falls back to Clerk Management API when orgId is missing from the JWT.
 */
export async function requireOrg(): Promise<{ orgId: string } | NextResponse> {
  const { orgId, userId } = auth()
  if (orgId) return { orgId }

  if (userId) {
    const resolved = await lookupOrgId(userId)
    if (resolved) return { orgId: resolved }
  }

  return NextResponse.json(
    { error: 'No organization selected. Please select or create a workspace.' },
    { status: 401 },
  )
}

/**
 * Like requireOrg but returns null instead of 401.
 * Use for aggregation routes (dashboard, analytics, inbox).
 */
export async function getOrgId(): Promise<string | null> {
  const { orgId, userId } = auth()
  if (orgId) return orgId
  if (userId) return lookupOrgId(userId)
  return null
}
