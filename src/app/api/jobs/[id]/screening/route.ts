import { NextResponse } from 'next/server'
import { withCapability, parseBody } from '@/lib/api/helpers'
import { screeningFormSchema } from '@/lib/validations/screening'
import { getJobScreeningForm, saveJobScreeningForm } from '@/modules/ats/domain/screening'

// GET /api/jobs/[id]/screening — this job's application form (inherits the org
// default when the job has no override of its own).
export const GET = withCapability('recruiting:view', async (_req, orgId, supabase, { params }) => {
  const form = await getJobScreeningForm(supabase, orgId, params.id)
  return NextResponse.json({ data: form }, { headers: { 'Cache-Control': 'no-store' } })
})

// PUT /api/jobs/[id]/screening — save this job's application form (override).
export const PUT = withCapability('recruiting:edit', async (req, orgId, supabase, { params }) => {
  const form = await parseBody(req, screeningFormSchema)
  if (form instanceof NextResponse) return form

  await saveJobScreeningForm(supabase, orgId, params.id, form)
  return NextResponse.json({ data: form })
})
