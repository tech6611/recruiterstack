import { NextRequest, NextResponse } from 'next/server'
import sgMail from '@sendgrid/mail'
import { auth } from '@clerk/nextjs/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'

interface SendEmailBody {
  subject:    string
  body:       string
  body_html?: string
  from_name?: string
  to_emails?: string[]    // override recipients (defaults to candidate email)
  cc_emails?: string[]
  bcc_emails?: string[]
  send_at?: number        // Unix timestamp for scheduled send (Sendgrid batch send)
}

// POST /api/applications/[id]/send-email
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

  let body: SendEmailBody
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

  // Resolve recipient list: use explicit list if provided, else fall back to candidate email
  const toEmails: string[] = body.to_emails && body.to_emails.length > 0
    ? body.to_emails
    : candidate?.email ? [candidate.email] : []

  if (toEmails.length === 0) {
    return NextResponse.json({ error: 'No recipient email address available' }, { status: 400 })
  }

  // ── Build Sendgrid mail object ───────────────────────────────────────────────
  sgMail.setApiKey(apiKey)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mailPayload: any = {
    to:      toEmails.length === 1 ? toEmails[0] : toEmails,
    from:    { email: fromEmail, name: body.from_name || 'RecruiterStack' },
    subject: body.subject.trim(),
    text:    body.body.trim(),
    html:    body.body_html?.trim() ?? body.body.trim().replace(/\n/g, '<br>'),
  }

  if (body.cc_emails && body.cc_emails.length > 0) {
    mailPayload.cc = body.cc_emails.length === 1 ? body.cc_emails[0] : body.cc_emails
  }
  if (body.bcc_emails && body.bcc_emails.length > 0) {
    mailPayload.bcc = body.bcc_emails.length === 1 ? body.bcc_emails[0] : body.bcc_emails
  }
  if (body.send_at) {
    mailPayload.sendAt = body.send_at
  }

  try {
    await sgMail.send(mailPayload)
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
        body_html:  body.body_html?.trim() ?? null,
        to_emails:  toEmails,
        // keep to_email/to_name for backwards compatibility with EmailsTab
        to_email:   toEmails[0],
        to_name:    candidate?.name ?? null,
        cc_emails:  body.cc_emails  ?? [],
        bcc_emails: body.bcc_emails ?? [],
        from_email: fromEmail,
        from_name:  body.from_name || 'RecruiterStack',
        scheduled:  body.send_at ? new Date(body.send_at * 1000).toISOString() : null,
      },
    })
    .select()
    .single()

  if (evtErr) {
    console.error('Failed to log email_sent event:', evtErr)
  }

  return NextResponse.json({ data: event ?? null })
}
