import { NextRequest, NextResponse } from 'next/server'
import { generateJD } from '@/lib/ai/jd-generator'
import { requireOrgAndUser } from '@/lib/auth'
import { checkAuthRateLimit } from '@/lib/api/rate-limit'

// POST /api/intake/preview-jd
// Used by the recruiter "Fill myself" form (New Job screen) to generate a JD
// preview without a token. It sits under /api/intake (public in middleware, for
// hiring-manager token links), so it must check sign-in itself — otherwise
// anyone could run Gemini Pro on our key.
export async function POST(request: NextRequest) {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth
  const { orgId, userId } = auth

  const limited = await checkAuthRateLimit(`${orgId}:preview-jd`, { maxRequests: 10, window: '60 s' })
  if (limited) return limited

  let body: {
    position_title: string
    department?: string
    level?: string
    location?: string
    remote_ok?: boolean
    headcount?: number
    team_context?: string
    key_requirements?: string
    nice_to_haves?: string
    budget_min?: number
    budget_max?: number
    target_start_date?: string
    additional_notes?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.position_title) {
    return NextResponse.json({ error: 'position_title is required' }, { status: 400 })
  }

  try {
    const jd = await generateJD({
      position_title: body.position_title,
      department: body.department || null,
      level: body.level || null,
      location: body.location || null,
      remote_ok: body.remote_ok || false,
      headcount: body.headcount || 1,
      team_context: body.team_context || null,
      key_requirements: body.key_requirements || null,
      nice_to_haves: body.nice_to_haves || null,
      budget_min: body.budget_min || null,
      budget_max: body.budget_max || null,
      target_start_date: body.target_start_date || null,
      additional_notes: body.additional_notes || null,
    }, { orgId, userId })
    return NextResponse.json({ jd })
  } catch {
    return NextResponse.json({ error: 'Failed to generate JD. Please try again.' }, { status: 500 })
  }
}
