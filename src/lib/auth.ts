import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

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

/**
 * Map a Clerk user id → our internal users.id (UUID).
 * The webhook handler (src/app/api/webhooks/clerk/route.ts) + the backfill
 * CLI keep this table populated. If a lookup fails, the likely cause is that
 * the webhook hasn't fired yet OR the backfill hasn't been run — surfaced
 * as a 500 to make the issue visible rather than silently corrupting data.
 */
export async function resolveUserIdFromClerk(clerkUserId: string): Promise<string> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('clerk_user_id', clerkUserId)
    .single()

  if (error || !data) {
    throw new Error(
      `User ${clerkUserId} not found in users table. ` +
      `Run "npx tsx scripts/backfill-clerk.ts" or wait for the Clerk webhook to fire.`,
    )
  }
  return data.id
}

/**
 * Convenience: returns { orgId, userId (our UUID), clerkUserId } or a 401/500 NextResponse.
 * Most requisition-module API handlers want all three.
 */
export async function requireOrgAndUser(): Promise<
  { orgId: string; userId: string; clerkUserId: string } | NextResponse
> {
  const orgResult = await requireOrg()
  if (orgResult instanceof NextResponse) return orgResult

  const { userId: clerkUserId } = auth()
  if (!clerkUserId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const userId = await resolveUserIdFromClerk(clerkUserId)
    return { orgId: orgResult.orgId, userId, clerkUserId }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'User sync incomplete' },
      { status: 500 },
    )
  }
}
