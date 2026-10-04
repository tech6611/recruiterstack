import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withCapability, parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { getLatestIcp } from '@/modules/ats/domain/icp'
import { briefChat } from '@/lib/ai/brief-chat'

export const maxDuration = 60 // one Gemini Flash call

const bodySchema = z.object({
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().trim().min(1).max(2000) })).min(1).max(20),
})

/**
 * POST — one turn of "edit the brief by talking to it": what the AI understood, and the
 * brief's corrections rewritten to include it. Nothing is saved — applying the notes
 * (PATCH the ICP's recruiter_corrections, then Regenerate) is the recruiter's call.
 */
export const POST = withCapability('recruiting:edit', async (req, orgId, supabase, { params }, _scope, userId) => {
  const body = await parseBody(req, bodySchema)
  if (body instanceof NextResponse) return body
  try {
    const [{ data: job }, icp] = await Promise.all([
      supabase.from('jobs').select('title').eq('id', params.id).eq('org_id', orgId).maybeSingle(),
      getLatestIcp(supabase, orgId, params.id).catch(() => null),
    ])
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    const brief = icp?.sourcing_map?.recruiter_brief ?? null
    const out = await briefChat({
      role: { title: (job as { title?: string }).title ?? 'this role' },
      brief,
      notes: brief?.corrections ?? '',
      messages: body.messages,
    }, { orgId, userId })
    return NextResponse.json({ data: out })
  } catch (e) {
    return handleSupabaseError(e as { code: string; message: string })
  }
})
