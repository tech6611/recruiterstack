import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'
import { auth } from '@clerk/nextjs/server'

type RouteContext = { params: { id: string } }

// ── Graceful PGRST205 helper (table not yet migrated) ─────────────────────────
function isMissingTable(error: unknown): boolean {
  return !!(error && typeof error === 'object' && (error as { code?: string }).code === 'PGRST205')
}

// ── GET /api/applications/[id]/draft — load saved draft ──────────────────────
export async function GET(
  _request: NextRequest,
  { params }: RouteContext
) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('email_drafts')
    .select('*')
    .eq('application_id', params.id)
    .eq('org_id', orgId)
    .maybeSingle()

  if (error) {
    if (isMissingTable(error)) return NextResponse.json({ data: null })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ data })
}

// ── PUT /api/applications/[id]/draft — upsert (auto-save) ────────────────────
export async function PUT(
  request: NextRequest,
  { params }: RouteContext
) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const { userId } = await auth()

  let body: {
    to_emails?: string[]
    cc_emails?: string[]
    bcc_emails?: string[]
    subject?: string
    body?: string
  }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('email_drafts')
    .upsert(
      {
        org_id:         orgId,
        application_id: params.id,
        to_emails:      body.to_emails  ?? [],
        cc_emails:      body.cc_emails  ?? [],
        bcc_emails:     body.bcc_emails ?? [],
        subject:        body.subject    ?? '',
        body:           body.body       ?? '',
        created_by:     userId ?? 'recruiter',
        updated_at:     new Date().toISOString(),
      },
      { onConflict: 'application_id,org_id' }
    )
    .select()
    .single()

  if (error) {
    if (isMissingTable(error)) return NextResponse.json({ success: true, data: null })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ data })
}

// ── DELETE /api/applications/[id]/draft — remove after send ──────────────────
export async function DELETE(
  _request: NextRequest,
  { params }: RouteContext
) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('email_drafts')
    .delete()
    .eq('application_id', params.id)
    .eq('org_id', orgId)

  if (error && !isMissingTable(error))
    return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
