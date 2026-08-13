import { NextResponse } from 'next/server'
import { withCapability, withScope } from '@/lib/api/helpers'
import { assertCanViewJob } from '@/lib/rbac'
import { teamMemberName, type TeamMember } from '@/lib/team-members'

// `jobs.hiring_manager_user_id` is added by migration 100 and isn't in the
// generated Supabase types yet; use a loosely-typed handle for it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any

// GET /api/jobs/:id/hiring-manager — the resolved hiring manager for the job.
// Prefers the assigned real user; falls back to the intake name/email.
export const GET = withScope(async (_req, orgId, supabase, { params }, scope) => {
  const sb = supabase as unknown as Loose
  const first = await sb
    .from('jobs').select('hiring_manager_user_id, custom_fields').eq('id', params.id).eq('org_id', orgId).maybeSingle()
  let job = first.data
  if (first.error) {
    // Pre-migration-100 the column may not exist yet — fall back to intake only.
    const r = await sb.from('jobs').select('custom_fields').eq('id', params.id).eq('org_id', orgId).maybeSingle()
    job = r.data ? { hiring_manager_user_id: null, custom_fields: r.data.custom_fields } : null
  }
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  // Broad recruiting view, or the assigned hiring manager for THIS job (so their
  // own Overview resolves who the HM is instead of showing "— none —").
  const denied = assertCanViewJob(scope, job)
  if (denied) return denied

  if (job.hiring_manager_user_id) {
    const { data: m } = await sb
      .from('org_members')
      .select('user_id, users:user_id (full_name, first_name, last_name, email)')
      .eq('org_id', orgId).eq('user_id', job.hiring_manager_user_id).maybeSingle()
    const name = m ? teamMemberName(m as TeamMember) : 'Hiring manager'
    const email = (m as TeamMember | null)?.users?.email ?? null
    return NextResponse.json({ data: { user_id: job.hiring_manager_user_id, name, email, source: 'assigned' } })
  }

  const intake = (job.custom_fields?.intake ?? {}) as { hm_name?: string; hm_email?: string }
  const name = intake.hm_name || null
  const email = intake.hm_email || null
  return NextResponse.json({ data: { user_id: null, name, email, source: name || email ? 'intake' : 'none' } })
})

// PUT /api/jobs/:id/hiring-manager  { user_id: string | null }
export const PUT = withCapability('recruiting:edit', async (req, orgId, supabase, { params }) => {
  const sb = supabase as unknown as Loose
  const body = await req.json().catch(() => null)
  const userId: string | null = body?.user_id ?? null

  if (userId) {
    const { data: member } = await sb
      .from('org_members').select('user_id').eq('org_id', orgId).eq('user_id', userId).eq('is_active', true).maybeSingle()
    if (!member) return NextResponse.json({ error: 'Not an active member of this org' }, { status: 400 })
  }

  const { error } = await sb
    .from('jobs').update({ hiring_manager_user_id: userId }).eq('id', params.id).eq('org_id', orgId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: { user_id: userId } })
})
