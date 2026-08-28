import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'
import { deletePlanTemplate } from '@/modules/ats/domain/plan-templates'

// DELETE /api/plan-templates/[id] — remove a saved plan template.
export const DELETE = withCapability('recruiting:edit', async (_req, orgId, supabase, { params }) => {
  await deletePlanTemplate(supabase, orgId, params.id)
  return NextResponse.json({ data: { ok: true } })
})
