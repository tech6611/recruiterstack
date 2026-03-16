import { NextRequest, NextResponse } from 'next/server'
import sgMail from '@sendgrid/mail'
import { auth } from '@clerk/nextjs/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'

// POST /api/applications/[id]/send-email
// Body: { subject, body, from_name? }
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult
  const { userId } = auth()

  const apiKey   = process.env.SENDGRID_API_KEY
  const fromEmail = process.env.SENDGRID_FROM_EMAIL

  if (!apiKey) {
    return NextResponse.json({ error: 'SENDGRID_API_KEY is not configured. Add it to your environment variables.' }, { status: 503 })
  }
  if (!fromEmail) {
    return NextResponse.json({ error: 'SENDGRID_FROM_EMAIL is not configured. Add it to your environment variables.' }, { status: 503 })
  }

  let body: { subject: string; body: string; from_name?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.subject?.trim() || !body.body?.trim()) {
    return NextResponse.json({ error: 'subject and body are required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Fetch application + candidate email
  const { data: app, error: appErr } = await supabase
    .from('applications')
    .select('id, candidate_id, candidate:candidates(name, email)')
    .eq('id', params.id)
    .eq('org_id', orgId)
    .single()

  if (appErr || !app) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidate = app.candidate as any as { name: string; email: string } | null
  if (!candidate?.email) {
    return NextResponse.json({ error: 'Candidate has no email address' }, { status: 400 })
  }

  // ── Send via Sendgrid ────────────────────────────────────────────────────────
  sgMail.setApiKey(apiKey)
  try {
    await sgMail.send({
      to:      candidate.email,
      from:    { email: fromEmail, name: body.from_name || 'RecruiterStack' },
      subject: body.subject.trim(),
      text:    body.body.trim(),
      html:    body.body.trim().replace(/\n/g, '<br>'),
    })
  } catch (err: unknown) {
    const e = err as { response?: { body?: { errors?: { message: string }[] } }; message?: string }
    const msg = e?.response?.body?.errors?.[0]?.message ?? e?.message ?? 'Failed to send email'
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  // ── Log email_sent event ─────────────────────────────────────────────────────
  const { data: event, error: evtErr } = await supabase
    .from('application_events')
    .insert({
      application_id: params.id,
      org_id:         orgId,
      event_type:     'email_sent',
      note:           body.subject.trim(),
      created_by:     userId ?? 'Recruiter',
      metadata: {
        subject:    body.subject.trim(),
        body:       body.body.trim(),
        to_email:   candidate.email,
        to_name:    candidate.name,
        from_email: fromEmail,
        from_name:  body.from_name || 'RecruiterStack',
      },
    })
    .select()
    .single()

  if (evtErr) {
    // Email was sent — log failure is non-fatal
    console.error('Failed to log email_sent event:', evtErr)
  }

  return NextResponse.json({ data: event ?? null })
}
