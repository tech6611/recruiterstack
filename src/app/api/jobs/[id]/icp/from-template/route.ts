import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withCapability, parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { createIcpDraft } from '@/modules/ats/domain/icp'
import { getRoleTemplate, templateToDraftInput } from '@/modules/ats/domain/role-templates'

const bodySchema = z.object({ template_id: z.string().uuid() })

/** POST — seed a draft ICP for this job from a saved role template (Component 02).
 *  The recruiter then reviews, edits, and approves the draft like any other ICP. */
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
      const draft = await createIcpDraft(supabase, orgId, params.id, templateToDraftInput(template), {
        createdBy: userId,
      })
      return NextResponse.json({ data: draft }, { status: 201 })
    } catch (e) {
      return handleSupabaseError(e as { code: string; message: string })
    }
  },
)
