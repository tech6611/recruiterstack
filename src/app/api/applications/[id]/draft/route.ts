import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'
import { auth } from '@clerk/nextjs/server'

type RouteContext = { params: { id: string } }

// ── Graceful PGRST205 helper (table not yet migrated) ─────────────────────────
function isMissingTable(error: unknown): boolean {
  return !!(error && typeof error === 'object' && (error as { code?: string }).code === 'PGRST205')
}

// ── GET /api/applications/[id]/draft — list all saved drafts ─────────────────
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
    .order('updated_at', { ascending: false })

  if (error) {
    if (isMissingTable(error)) return NextResponse.json({ data: [] })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ data: data ?? [] })
}

// ── POST /api/applications/[id]/draft — create a new draft ───────────────────
export async function POST(
  request: NextRequest,
  { params }: RouteContext
) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const { userId } = await auth()

  let body: {
    name?: string
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
    .insert({
      org_id:         orgId,
      application_id: params.id,
      name:           body.name       ?? '',
      to_emails:      body.to_emails  ?? [],
      cc_emails:      body.cc_emails  ?? [],
      bcc_emails:     body.bcc_emails ?? [],
      subject:        body.subject    ?? '',
      body:           body.body       ?? '',
      created_by:     userId ?? 'recruiter',
      updated_at:     new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    if (isMissingTable(error)) return NextResponse.json({ success: true, data: null })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ data })
}

// ── PUT /api/applications/[id]/draft?draft_id=X — update a specific draft ────
export async function PUT(
  request: NextRequest,
  { params }: RouteContext
) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const draftId = request.nextUrl.searchParams.get('draft_id')
  if (!draftId) return NextResponse.json({ error: 'draft_id is required' }, { status: 400 })

  let body: {
    name?: string
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
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.name       !== undefined) update.name       = body.name
  if (body.to_emails  !== undefined) update.to_emails  = body.to_emails
  if (body.cc_emails  !== undefined) update.cc_emails  = body.cc_emails
  if (body.bcc_emails !== undefined) update.bcc_emails = body.bcc_emails
  if (body.subject    !== undefined) update.subject    = body.subject
  if (body.body       !== undefined) update.body       = body.body

  const { data, error } = await supabase
    .from('email_drafts')
    .update(update)
    .eq('id', draftId)
    .eq('org_id', orgId)
    .eq('application_id', params.id)   // security: scope to this application
    .select()
    .single()

  if (error) {
    if (isMissingTable(error)) return NextResponse.json({ success: true, data: null })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ data })
}

// ── DELETE /api/applications/[id]/draft?draft_id=X — delete a specific draft ─
export async function DELETE(
  request: NextRequest,
  { params }: RouteContext
) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const draftId = request.nextUrl.searchParams.get('draft_id')

  const supabase = createAdminClient()
  let q = supabase
    .from('email_drafts')
    .delete()
    .eq('application_id', params.id)
    .eq('org_id', orgId)

  // If a specific draft_id is given, only delete that one; otherwise delete all (post-send cleanup)
  if (draftId) q = (q as typeof q).eq('id', draftId)

  const { error } = await q

  if (error && !isMissingTable(error))
    return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
