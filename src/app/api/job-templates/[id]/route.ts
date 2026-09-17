import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'
import {
  getJobTemplate, updateJobTemplate, deactivateJobTemplate, jobTemplateUpdateSchema,
} from '@/modules/ats/domain/job-templates'

// GET /api/job-templates/[id] — one template.
export const GET = withCapability('recruiting:view', async (_req, orgId, supabase, { params }) => {
  const tpl = await getJobTemplate(supabase, orgId, params.id)
  if (!tpl) return NextResponse.json({ error: 'Template not found.' }, { status: 404 })
  return NextResponse.json({ data: tpl })
})

// PATCH /api/job-templates/[id] — partial update (any template field).
export const PATCH = withCapability('recruiting:edit', async (req, orgId, supabase, { params }) => {
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const parsed = jobTemplateUpdateSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return NextResponse.json({ error: first ? `${first.path.join('.') || 'body'}: ${first.message}` : 'Invalid template.' }, { status: 400 })
  }
  const tpl = await updateJobTemplate(supabase, orgId, params.id, parsed.data)
  if (!tpl) return NextResponse.json({ error: 'Template not found.' }, { status: 404 })
  return NextResponse.json({ data: tpl })
})

// DELETE /api/job-templates/[id] — deactivate (soft delete). Past jobs keep
// their provenance; the template just leaves the New Job picker.
export const DELETE = withCapability('recruiting:edit', async (_req, orgId, supabase, { params }) => {
  const ok = await deactivateJobTemplate(supabase, orgId, params.id)
  if (!ok) return NextResponse.json({ error: 'Template not found.' }, { status: 404 })
  return NextResponse.json({ data: { ok: true } })
})
