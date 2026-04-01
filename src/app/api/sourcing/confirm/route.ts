import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'

type ParsedCandidate = {
  name?:             string
  email?:            string
  phone?:            string
  current_title?:    string
  location?:         string
  experience_years?: number
  skills?:           string[]
  linkedin_url?:     string
}

// POST /api/sourcing/confirm
// Body: { candidates: ParsedCandidate[] }
// Returns: { created: number, skipped: number, errors: string[] }
export async function POST(request: NextRequest) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  let body: { candidates: ParsedCandidate[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { candidates } = body
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return NextResponse.json({ error: 'candidates array is required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Build normalized rows
  const rows = candidates.map(c => ({
    name:             (c.name ?? c.email ?? 'Unknown').trim(),
    email:            c.email?.toLowerCase().trim() ?? '',
    phone:            c.phone?.trim()                ?? null,
    current_title:    c.current_title?.trim()        ?? null,
    location:         c.location?.trim()             ?? null,
    experience_years: typeof c.experience_years === 'number' ? c.experience_years : 0,
    skills:           Array.isArray(c.skills) ? c.skills : [],
    linkedin_url:     c.linkedin_url?.trim()         ?? null,
    status:           'active' as const,
    org_id:           orgId,
  }))

  // 1. Find which emails already exist in this org to calculate skipped count
  const emails = rows.map(r => r.email).filter((e): e is string => Boolean(e))
  let skipped = 0

  if (emails.length > 0) {
    const { data: existing } = await supabase
      .from('candidates')
      .select('email')
      .eq('org_id', orgId)
      .in('email', emails)

    const existingSet = new Set((existing ?? []).map(e => e.email))

    // Mark duplicates
    for (const row of rows) {
      if (row.email && existingSet.has(row.email)) skipped++
    }
  }

  // 2. Bulk insert — skip candidates whose email already exists (no-email rows always insert)
  let created = 0
  const errors: string[] = []

  // Split into chunks of 25 to avoid payload limits
  const CHUNK = 25
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)

    const { data, error } = await supabase
      .from('candidates')
      .insert(chunk)
      .select('id')

    if (error) {
      if (error.code === '23505') {
        // Batch had a duplicate — fall back to one-by-one for this chunk
        for (const row of chunk) {
          const { error: e } = await supabase.from('candidates').insert(row).select('id').single()
          if (!e) created++
          // duplicates already counted above; other errors tracked
          else if (e.code !== '23505') errors.push(`${row.name}: ${e.message}`)
        }
      } else {
        errors.push(error.message)
      }
    } else {
      created += data?.length ?? 0
    }
  }

  return NextResponse.json({ created, skipped, errors })
}
