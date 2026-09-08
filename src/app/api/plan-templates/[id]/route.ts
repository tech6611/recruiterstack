import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'
import { deletePlanTemplate, updatePlanTemplateFromJob } from '@/modules/ats/domain/plan-templates'

// DELETE /api/plan-templates/[id] — remove a saved plan template.
export const DELETE = withCapability('recruiting:edit', async (_req, orgId, supabase, { params }) => {
  await deletePlanTemplate(supabase, orgId, params.id)
  return NextResponse.json({ data: { ok: true } })
})

// PUT /api/plan-templates/[id]  { job_id } — refresh this template in place from a
// job's current plan (same template + name, updated stages + rules).
export const PUT = withCapability('recruiting:edit', async (req, orgId, supabase, { params }) => {
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const jobId = String((body as { job_id?: unknown })?.job_id ?? '')
  if (!jobId) return NextResponse.json({ error: 'job_id required' }, { status: 400 })
  try {
    const tpl = await updatePlanTemplateFromJob(supabase, orgId, params.id, jobId)
    return NextResponse.json({ data: tpl })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed'
    if (msg === 'TEMPLATE_EMPTY') {
      return NextResponse.json({ error: 'This plan has no custom stages to save yet — add an Active or Offer stage first.' }, { status: 400 })
    }
    if (msg === 'TEMPLATE_NOT_FOUND') return NextResponse.json({ error: 'Template not found.' }, { status: 404 })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
})
