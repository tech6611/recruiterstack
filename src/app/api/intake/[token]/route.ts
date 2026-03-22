import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import sgMail from '@sendgrid/mail'
import { checkRateLimit } from '@/lib/api/rate-limit'

// GET /api/intake/:token — validate token, return request info for the HM form
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const rateLimited = await checkRateLimit(_req)
  if (rateLimited) return rateLimited
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('hiring_requests')
    .select('id, position_title, department, hiring_manager_name, status, intake_submitted_at, jd_sent_at, created_at')
    .eq('intake_token', params.token)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 })
  }
  return NextResponse.json({ data })
}

// POST /api/intake/:token — HM submits requirements + final JD → status = jd_approved
export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  const rateLimited = await checkRateLimit(request)
  if (rateLimited) return rateLimited

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
    position_title?: string           // HM can update the title
    team_context: string
    level?: string
    headcount?: number
    location?: string
    remote_ok?: boolean
    key_requirements: string
    nice_to_haves?: string
    target_companies?: string
    budget_min?: number
    budget_max?: number
    target_start_date?: string
    additional_notes?: string
    final_jd: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.final_jd?.trim()) {
    return NextResponse.json({ error: 'A Job Description is required before submitting.' }, { status: 400 })
  }

  const { error: updateError } = await supabase.from('hiring_requests').update({
    position_title: body.position_title || req.position_title,
    team_context: body.team_context || null,
    level: body.level || null,
    headcount: body.headcount || 1,
    location: body.location || null,
    remote_ok: body.remote_ok || false,
    key_requirements: body.key_requirements || null,
    nice_to_haves: body.nice_to_haves || null,
    target_companies: body.target_companies || null,
    budget_min: body.budget_min || null,
    budget_max: body.budget_max || null,
    target_start_date: body.target_start_date || null,
    additional_notes: body.additional_notes || null,
    generated_jd: body.final_jd,
    status: 'jd_approved',
    intake_submitted_at: new Date().toISOString(),
    jd_sent_at: new Date().toISOString(),
  } as any).eq('intake_token', params.token)

  if (updateError) {
    return NextResponse.json({ error: 'Failed to save. Please try again.' }, { status: 500 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const dashboardUrl = `${appUrl}/hiring-requests`
  const statusUrl = `${appUrl}/intake/${params.token}/status`

  // Slack: notify recruiter channel
  const slackWebhook = process.env.SLACK_WEBHOOK_URL
  if (slackWebhook) {
    try {
      await fetch(slackWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `✅ *${req.hiring_manager_name}* has submitted the intake for *${req.position_title}* — JD is ready for review!\n→ Dashboard: ${dashboardUrl}`,
        }),
      })
    } catch (e) {
      console.error('Slack recruiter notification failed:', e)
    }
  }

  // Email: notify recruiter if RECRUITER_EMAIL is set
  const recruiterEmail = process.env.RECRUITER_EMAIL
  const apiKey = process.env.SENDGRID_API_KEY
  const fromEmail = process.env.SENDGRID_FROM_EMAIL
  if (recruiterEmail && apiKey && fromEmail) {
    sgMail.setApiKey(apiKey)
    try {
      await sgMail.send({
        to: recruiterEmail,
        from: { email: fromEmail, name: 'RecruiterStack' },
        subject: `JD Ready: ${req.position_title}`,
        text: `${req.hiring_manager_name} has submitted the intake for ${req.position_title}. The JD is ready.\n\n→ ${dashboardUrl}`,
        html: `
          <p><strong>${req.hiring_manager_name}</strong> submitted the intake for <strong>${req.position_title}</strong>. The JD is ready for your review.</p>
          <p style="margin:24px 0;">
            <a href="${dashboardUrl}" style="background:#2563eb;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">View in Dashboard →</a>
          </p>
        `,
      })
    } catch (e) {
      console.error('Recruiter email notification failed:', e)
    }
  }

  return NextResponse.json({ success: true, status_url: statusUrl })
}
