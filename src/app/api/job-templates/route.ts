import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'
import { listJobTemplates, createJobTemplate, jobTemplateCreateSchema } from '@/modules/ats/domain/job-templates'

// GET /api/job-templates?include_inactive=1 — the org's full job templates
// (job fields + JD + comp + plan template + draft posting). Active only by
// default; the Job templates admin page passes the flag to also see archived.
export const GET = withCapability('recruiting:view', async (req, orgId, supabase) => {
  const includeInactive = req.nextUrl.searchParams.get('include_inactive') === '1'
  const templates = await listJobTemplates(supabase, orgId, { includeInactive })
  return NextResponse.json({ data: templates })
})

// POST /api/job-templates — create a template from scratch (the editor form).
export const POST = withCapability('recruiting:edit', async (req, orgId, supabase, _ctx, _scope, userId) => {
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const parsed = jobTemplateCreateSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return NextResponse.json({ error: first ? `${first.path.join('.') || 'body'}: ${first.message}` : 'Invalid template.' }, { status: 400 })
  }
  const tpl = await createJobTemplate(supabase, orgId, parsed.data, userId ?? null)
  return NextResponse.json({ data: tpl }, { status: 201 })
})
