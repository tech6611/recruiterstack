import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createAdminClient } from '@/lib/supabase/server'

// Temporary debug endpoint — remove after diagnosing data issue
export async function GET() {
  const { userId, orgId, sessionClaims } = auth()

  // Step 1: JWT state
  const jwtInfo = { userId, orgId, sessionClaims }

  // Step 2: Clerk Management API fallback
  let clerkLookup: { orgId: string | null; error?: string } = { orgId: null }
  if (userId) {
    try {
      const res = await fetch(
        `https://api.clerk.com/v1/users/${userId}/organization_memberships?limit=5`,
        { headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` } },
      )
      const data = await res.json()
      clerkLookup = {
        orgId: data?.data?.[0]?.organization?.id ?? null,
        ...data,
      }
    } catch (e) {
      clerkLookup = { orgId: null, error: String(e) }
    }
  }

  // Step 3: Supabase row counts per org_id
  const supabase = createAdminClient()
  const targetOrgId = orgId ?? clerkLookup.orgId

  let dbCounts: Record<string, number | string> = {}
  if (targetOrgId) {
    const [jobs, candidates, apps] = await Promise.all([
      supabase.from('hiring_requests').select('id', { count: 'exact', head: true }).eq('org_id', targetOrgId),
      supabase.from('candidates').select('id', { count: 'exact', head: true }).eq('org_id', targetOrgId),
      supabase.from('applications').select('id', { count: 'exact', head: true }).eq('org_id', targetOrgId),
    ])
    dbCounts = {
      hiring_requests: jobs.count ?? jobs.error?.message ?? 'error',
      candidates: candidates.count ?? candidates.error?.message ?? 'error',
      applications: apps.count ?? apps.error?.message ?? 'error',
    }
  }

  return NextResponse.json({ jwtInfo, clerkLookup, targetOrgId, dbCounts })
}
