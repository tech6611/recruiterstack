/**
 * Backfill users + org_members from Clerk's Management API.
 *
 * Run: npx tsx scripts/backfill-clerk.ts
 *
 * Idempotent — safe to re-run. Uses the same sync helpers as the webhook
 * (src/lib/clerk/sync.ts) so behavior stays consistent.
 *
 * Required env vars (from .env.local):
 *   - CLERK_SECRET_KEY
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'

// Load .env.local the same way scripts/seed.ts does
const envPath = resolve(process.cwd(), '.env.local')
try {
  const envLines = readFileSync(envPath, 'utf-8').split('\n')
  for (const line of envLines) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  }
} catch {
  // If no .env.local, rely on whatever's already in the environment
}

// Import after env is loaded
import {
  syncUserFromClerk,
  syncMembershipFromClerk,
  type ClerkUserPayload,
  type ClerkMembershipPayload,
} from '../src/lib/clerk/sync'

const CLERK_API = 'https://api.clerk.com/v1'
const CLERK_KEY = process.env.CLERK_SECRET_KEY

if (!CLERK_KEY) {
  console.error('CLERK_SECRET_KEY not set in .env.local')
  process.exit(1)
}

const authHeader = { Authorization: `Bearer ${CLERK_KEY}` }

interface ClerkListResponse<T> {
  data: T[]
  total_count: number
}

/**
 * Clerk's /v1/users returns a bare array; /v1/users/:id/organization_memberships
 * returns {data, total_count}. Tolerate both shapes.
 */
function extractList<T>(body: unknown): T[] {
  if (Array.isArray(body)) return body as T[]
  if (body && typeof body === 'object' && Array.isArray((body as ClerkListResponse<T>).data)) {
    return (body as ClerkListResponse<T>).data
  }
  return []
}

async function fetchAllUsers(): Promise<ClerkUserPayload[]> {
  const users: ClerkUserPayload[] = []
  const limit = 500                    // Clerk's max per page
  let offset = 0

  while (true) {
    const res = await fetch(`${CLERK_API}/users?limit=${limit}&offset=${offset}`, {
      headers: authHeader,
    })
    if (!res.ok) throw new Error(`Clerk /users failed: ${res.status} ${await res.text()}`)

    const page = extractList<ClerkUserPayload>(await res.json())
    users.push(...page)

    if (page.length < limit) break
    offset += limit
  }

  return users
}

async function fetchUserMemberships(clerkUserId: string): Promise<ClerkMembershipPayload[]> {
  const res = await fetch(
    `${CLERK_API}/users/${clerkUserId}/organization_memberships?limit=100`,
    { headers: authHeader },
  )
  if (!res.ok) {
    console.warn(`  memberships fetch failed for ${clerkUserId}: ${res.status}`)
    return []
  }
  return extractList<ClerkMembershipPayload>(await res.json())
}

async function main() {
  console.log('Fetching users from Clerk…')
  const users = await fetchAllUsers()
  console.log(`  found ${users.length} users\n`)

  let userOk = 0
  let userErr = 0
  let memOk = 0
  let memErr = 0

  for (const user of users) {
    try {
      await syncUserFromClerk(user)
      userOk++
    } catch (err) {
      userErr++
      console.error(`  ✖ user ${user.id}: ${(err as Error).message}`)
      continue                         // skip memberships if user sync failed
    }

    const memberships = await fetchUserMemberships(user.id)
    for (const m of memberships) {
      try {
        await syncMembershipFromClerk(m)
        memOk++
      } catch (err) {
        memErr++
        console.error(`  ✖ membership ${user.id}@${m.organization.id}: ${(err as Error).message}`)
      }
    }
  }

  console.log(`\nUsers:       ${userOk} synced, ${userErr} failed`)
  console.log(`Memberships: ${memOk} synced, ${memErr} failed`)

  if (userErr > 0 || memErr > 0) process.exit(1)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
