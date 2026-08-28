import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'
import { getPlanTemplate, applyPlanTemplateToJob } from '@/modules/ats/domain/plan-templates'

// POST /api/jobs/[id]/apply-plan-template  { template_id }
// Replace this job's custom (Active + Offer) stages with the template's; candidates
// in a replaced stage are moved to "Applied" first so none are left without a stage.
export const POST = withCapability('recruiting:edit', async (req, orgId, supabase, { params }) => {
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const templateId = String((body as { template_id?: unknown })?.template_id ?? '')
  if (!templateId) return NextResponse.json({ error: 'template_id required' }, { status: 400 })

  const tpl = await getPlanTemplate(supabase, orgId, templateId)
  if (!tpl) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

  try {
    await applyPlanTemplateToJob(supabase, orgId, params.id, tpl)
    return NextResponse.json({ data: { ok: true } })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to apply template' }, { status: 500 })
  }
})
