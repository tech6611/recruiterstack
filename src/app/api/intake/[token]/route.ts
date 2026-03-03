import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { generateJD } from '@/lib/ai/jd-generator'
import sgMail from '@sendgrid/mail'

// GET /api/intake/:token — validate token, return basic request info
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('hiring_requests')
    .select('id, position_title, department, hiring_manager_name, status')
    .eq('intake_token', params.token)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 })
  }
  return NextResponse.json({ data })
}

// POST /api/intake/:token — submit HM details, generate JD, notify HM
export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  const supabase = createAdminClient()

  const { data: req, error: fetchError } = await supabase
    .from('hiring_requests')
    .select('*')
    .eq('intake_token', params.token)
    .single()

  if (fetchError || !req) {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 })
  }
  if (req.status !== 'intake_pending') {
    return NextResponse.json({ error: 'This intake form has already been submitted' }, { status: 409 })
  }

  let body: {
    team_context: string
    level: string
    headcount: number
    location: string
    remote_ok: boolean
    key_requirements: string
    nice_to_haves?: string
    budget_min?: number
    budget_max?: number
    target_start_date?: string
    additional_notes?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Save intake details
  await supabase.from('hiring_requests').update({
    team_context: body.team_context || null,
    level: body.level || null,
    headcount: body.headcount || 1,
    location: body.location || null,
    remote_ok: body.remote_ok || false,
    key_requirements: body.key_requirements || null,
    nice_to_haves: body.nice_to_haves || null,
    budget_min: body.budget_min || null,
    budget_max: body.budget_max || null,
    target_start_date: body.target_start_date || null,
    additional_notes: body.additional_notes || null,
    status: 'intake_submitted',
    intake_submitted_at: new Date().toISOString(),
  } as any).eq('intake_token', params.token)

  // Generate JD with Claude
  let generatedJD: string
  try {
    generatedJD = await generateJD({
      position_title: req.position_title,
      department: req.department,
      level: body.level || null,
      location: body.location || null,
      remote_ok: body.remote_ok || false,
      headcount: body.headcount || 1,
      team_context: body.team_context || null,
      key_requirements: body.key_requirements || null,
      nice_to_haves: body.nice_to_haves || null,
      budget_min: body.budget_min || null,
      budget_max: body.budget_max || null,
      target_start_date: body.target_start_date || null,
      additional_notes: body.additional_notes || null,
    })
  } catch {
    return NextResponse.json({ error: 'Failed to generate JD. Please try again.' }, { status: 500 })
  }

  await supabase.from('hiring_requests').update({
    generated_jd: generatedJD,
    status: 'jd_generated',
  } as any).eq('intake_token', params.token)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const approveUrl = `${appUrl}/api/intake/${params.token}/approve`
  const viewUrl = `${appUrl}/hiring-requests`

  // Email JD to hiring manager
  const apiKey = process.env.SENDGRID_API_KEY
  const fromEmail = process.env.SENDGRID_FROM_EMAIL
  if (apiKey && fromEmail) {
    sgMail.setApiKey(apiKey)
    // Simple markdown → HTML for email
    const jdHtml = generatedJD
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/^## (.+)$/gm, '<h2 style="color:#1e293b;margin:20px 0 8px;">$1</h2>')
      .replace(/^# (.+)$/gm, '<h1 style="color:#0f172a;">$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/^- (.+)$/gm, '<li style="margin:4px 0;">$1</li>')
      .replace(/(<li.*<\/li>\n?)+/g, (m) => `<ul style="padding-left:20px;margin:8px 0;">${m}</ul>`)
      .replace(/\n\n/g, '</p><p style="margin:12px 0;">')
      .replace(/\n/g, '<br>')

    try {
      await sgMail.send({
        to: req.hiring_manager_email,
        from: { email: fromEmail, name: 'RecruiterStack' },
        subject: `JD Ready for Review: ${req.position_title}`,
        text: `Hi ${req.hiring_manager_name},\n\nYour Job Description for ${req.position_title} is ready.\n\n${generatedJD}\n\n→ Approve this JD: ${approveUrl}\n\nIf you'd like changes, reply to this email.`,
        html: `
          <div style="font-family:system-ui,sans-serif;max-width:640px;margin:0 auto;">
            <p>Hi ${req.hiring_manager_name},</p>
            <p>Your Job Description for <strong>${req.position_title}</strong> is ready for your review.</p>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
            <div style="font-family:Georgia,serif;line-height:1.75;color:#1e293b;">
              <p style="margin:12px 0;">${jdHtml}</p>
            </div>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
            <p>
              <a href="${approveUrl}" style="background:#16a34a;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;margin-right:12px;">
                ✓ Approve JD
              </a>
            </p>
            <p style="color:#94a3b8;font-size:13px;margin-top:16px;">
              If you'd like changes, simply reply to this email with your feedback.
            </p>
          </div>
        `,
      })
    } catch (e) {
      console.error('JD review email failed:', e)
    }
  }

  // Slack notification
  const slackWebhook = process.env.SLACK_WEBHOOK_URL
  if (slackWebhook) {
    const mention = req.hiring_manager_slack
      ? `<@${req.hiring_manager_slack.replace('@', '')}>`
      : req.hiring_manager_name
    try {
      await fetch(slackWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `✅ JD for *${req.position_title}* is ready for review!\n${mention} — check your email for the full draft.\n→ Approve here: ${approveUrl}\n→ View in dashboard: ${viewUrl}`,
        }),
      })
    } catch (e) {
      console.error('Slack JD notification failed:', e)
    }
  }

  await supabase.from('hiring_requests').update({
    status: 'jd_sent',
    jd_sent_at: new Date().toISOString(),
  } as any).eq('intake_token', params.token)

  return NextResponse.json({ success: true })
}
