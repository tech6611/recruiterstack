import { NextRequest, NextResponse } from 'next/server'
import { generateJD } from '@/lib/ai/jd-generator'

// POST /api/intake/preview-jd
// Used by the recruiter "Fill myself" form to generate a JD preview without a token.
export async function POST(request: NextRequest) {
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
    })
    return NextResponse.json({ jd })
  } catch {
    return NextResponse.json({ error: 'Failed to generate JD. Please try again.' }, { status: 500 })
  }
}
