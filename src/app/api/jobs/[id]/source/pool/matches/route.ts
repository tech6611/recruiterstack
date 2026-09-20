import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withCapability, parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { setPoolMatchFlags } from '@/modules/pool/domain/pool-sourcing'

const schema = z.object({ profile_id: z.string().uuid(), starred: z.boolean().optional(), hidden: z.boolean().optional() })

/** PATCH — star or hide a market match for this job. Free (no unlock); survives re-ranks. */
export const PATCH = withCapability('recruiting:edit', async (req, orgId, supabase, { params }) => {
  const body = await parseBody(req, schema)
  if (body instanceof NextResponse) return body
  try {
    const ok = await setPoolMatchFlags(supabase, orgId, params.id, body.profile_id, { starred: body.starred, hidden: body.hidden })
    if (!ok) return NextResponse.json({ error: 'That profile is not in this job’s market list' }, { status: 404 })
    return NextResponse.json({ data: { profile_id: body.profile_id, starred: body.starred, hidden: body.hidden } })
  } catch (e) {
    return handleSupabaseError(e as { code: string; message: string })
  }
})
