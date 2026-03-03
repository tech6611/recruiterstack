import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { generateJD } from '@/lib/ai/jd-generator'

// POST /api/intake/:token/generate-jd
// Generates a JD preview from the form data WITHOUT saving to DB.
// The HM can then review/edit before final submission.
export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  const supabase = createAdminClient()

  const { data: req, error } = await supabase
    .from('hiring_requests')
    .select('id, position_title, department, status')
    .eq('intake_token', params.token)
    .single()

  if (error || !req) {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 })
  }
  if (req.status !== 'intake_pending') {
    return NextResponse.json({ error: 'This intake form has already been submitted' }, { status: 409 })
  }

  let body: {
    team_context: string
    level?: string
    headcount?: number
    location?: string
    remote_ok?: boolean
    key_requirements: string
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

  if (!body.team_context?.trim() || !body.key_requirements?.trim()) {
    return NextResponse.json(
      { error: 'Team context and key requirements are required to generate a JD.' },
      { status: 400 },
    )
  }

  try {
    const jd = await generateJD({
      position_title: req.position_title,
      department: req.department,
      level: body.level || null,
      location: body.location || null,
      remote_ok: body.remote_ok || false,
      headcount: body.headcount || 1,
      team_context: body.team_context,
      key_requirements: body.key_requirements,
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
