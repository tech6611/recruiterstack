import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { generateJD } from '@/lib/ai/jd-generator'
import {
  getCanonicalIntakeJobFull,
  setCanonicalIntakeJobJd,
} from '@/modules/ats/domain/job-pipelines'

// POST /api/intake/:token/generate-jd
// Generates a JD from the form data for the canonical intake job and stores it
// on jobs.description (the HM can still review/edit before final submission).
export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  const supabase = createAdminClient()

  const job = await getCanonicalIntakeJobFull(supabase, params.token)
  if (!job) {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 })
  }
  // An intake-pending canonical job is still 'draft'.
  if (job.status !== 'draft') {
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
      position_title: job.title,
      department: job.department,
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
    // Persist the latest draft JD on the canonical job (status unchanged).
    try {
      await setCanonicalIntakeJobJd(supabase, params.token, jd)
    } catch (e) {
      console.error('Failed to persist generated JD:', e)
    }
    return NextResponse.json({ jd })
  } catch {
    return NextResponse.json({ error: 'Failed to generate JD. Please try again.' }, { status: 500 })
  }
}
