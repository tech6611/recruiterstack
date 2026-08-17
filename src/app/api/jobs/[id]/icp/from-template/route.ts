import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withCapability, parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { createIcpDraft } from '@/modules/ats/domain/icp'
import { getRoleTemplate, templateToDraftInput } from '@/modules/ats/domain/role-templates'
import { getCanonicalJobScoringContext } from '@/modules/ats/domain/job-pipelines'
import { analyzeRole } from '@/lib/ai/sourcing-strategist'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSb = any

export const maxDuration = 120 // reasoning pass for the new job

const bodySchema = z.object({ template_id: z.string().uuid() })

/** POST — seed a draft ICP for this job from a saved role template (Component 02).
 *  The recruiter then reviews, edits, and approves the draft like any other ICP.
 *  Reasoning is generated FRESH for THIS job (it's role/job-specific, not part of the
 *  template) so the "How this ICP was reasoned" panel shows on the carried-over job too. */
export const POST = withCapability(
  'recruiting:edit',
  async (req, orgId, supabase, { params }, _scope, userId) => {
    const body = await parseBody(req, bodySchema)
    if (body instanceof NextResponse) return body

    try {
      const template = await getRoleTemplate(supabase, orgId, body.template_id)
      if (!template) {
        return NextResponse.json({ error: 'Template not found.' }, { status: 404 })
      }
      const icp = await createIcpDraft(supabase, orgId, params.id, templateToDraftInput(template), {
        createdBy: userId,
      })

      // Generate reasoning for THIS job against the template's competencies. Best-effort.
      let sourcing_map = null
      try {
        const ctx = await getCanonicalJobScoringContext(supabase, orgId, params.id)
        if (ctx?.job) {
          sourcing_map = await analyzeRole(
            ctx.job,
            icp.competencies.map((c) => ({ name: c.name, weight: c.weight })),
            icp.must_haves.map((g) => ({ label: g.label })),
            { orgId, userId },
          )
          await (supabase as unknown as LooseSb)
            .from('icps').update({ sourcing_map }).eq('id', icp.id).eq('org_id', orgId)
        }
      } catch {
        /* reasoning is additive; keep the ICP */
      }

      return NextResponse.json({ data: { ...icp, sourcing_map } }, { status: 201 })
    } catch (e) {
      return handleSupabaseError(e as { code: string; message: string })
    }
  },
)
