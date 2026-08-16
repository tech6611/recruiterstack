import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withCapability, parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { getCurrentIcp } from '@/modules/ats/domain/icp'
import { listRoleTemplates, createRoleTemplateFromIcp } from '@/modules/ats/domain/role-templates'

/** GET — the org's saved role templates (Component 02). */
export const GET = withCapability('recruiting:view', async (_req, orgId, supabase) => {
  try {
    const templates = await listRoleTemplates(supabase, orgId)
    return NextResponse.json({ data: templates })
  } catch (e) {
    return handleSupabaseError(e as { code: string; message: string })
  }
})

const createSchema = z.object({
  job_id: z.string().uuid(),
  name: z.string().min(1).max(120),
  description: z.string().max(500).nullish(),
})

/** POST — save a job's current ICP (approved or latest draft) as a reusable role
 *  template. */
export const POST = withCapability('recruiting:edit', async (req, orgId, supabase, _ctx, _scope, userId) => {
  const body = await parseBody(req, createSchema)
  if (body instanceof NextResponse) return body

  try {
    const icp = await getCurrentIcp(supabase, orgId, body.job_id)
    if (!icp) {
      return NextResponse.json(
        { error: 'This job has no ICP to save yet. Generate and approve one first.' },
        { status: 400 },
      )
    }
    const template = await createRoleTemplateFromIcp(supabase, orgId, {
      name: body.name,
      description: body.description ?? null,
      icp,
      createdBy: userId,
    })
    return NextResponse.json({ data: template }, { status: 201 })
  } catch (e) {
    return handleSupabaseError(e as { code: string; message: string })
  }
})
