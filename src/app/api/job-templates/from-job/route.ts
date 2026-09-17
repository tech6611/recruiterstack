import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'
import { createJobTemplateFromJob, jobTemplateFromJobSchema } from '@/modules/ats/domain/job-templates'

// POST /api/job-templates/from-job  { job_id, name, description? }
// Snapshot an existing job's setup (fields, JD, comp, intake, first posting)
// into a new reusable template.
export const POST = withCapability('recruiting:edit', async (req, orgId, supabase, _ctx, _scope, userId) => {
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const parsed = jobTemplateFromJobSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'A job and a template name are required.' }, { status: 400 })
  try {
    const tpl = await createJobTemplateFromJob(
      supabase, orgId, parsed.data.job_id, parsed.data.name, userId ?? null,
      { description: parsed.data.description ?? null },
    )
    return NextResponse.json({ data: tpl }, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed'
    if (msg === 'JOB_NOT_FOUND') return NextResponse.json({ error: 'Job not found.' }, { status: 404 })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
})
