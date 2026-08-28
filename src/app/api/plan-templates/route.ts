import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withCapability } from '@/lib/api/helpers'
import { listPlanTemplates, createPlanTemplateFromJob } from '@/modules/ats/domain/plan-templates'

// GET /api/plan-templates — the org's saved interview-plan templates.
export const GET = withCapability('recruiting:view', async (_req, orgId, supabase) => {
  const templates = await listPlanTemplates(supabase, orgId)
  return NextResponse.json({ data: templates })
})

const createSchema = z.object({
  job_id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().nullable(),
})

// POST /api/plan-templates — save a job's current plan (its Active + Offer stages)
// as a reusable template.
export const POST = withCapability('recruiting:edit', async (req, orgId, supabase) => {
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'A job and a template name are required.' }, { status: 400 })
  try {
    const tpl = await createPlanTemplateFromJob(supabase, orgId, {
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      jobId: parsed.data.job_id,
    })
    return NextResponse.json({ data: tpl }, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed'
    if (msg === 'TEMPLATE_EMPTY') {
      return NextResponse.json({ error: 'This plan has no custom stages to save yet — add an Active or Offer stage first.' }, { status: 400 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
})
