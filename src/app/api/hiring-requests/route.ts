import { NextResponse } from 'next/server'
import sgMail from '@sendgrid/mail'
import { withOrg, parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { hiringRequestInsertSchema } from '@/lib/validations/hiring-requests'
import { logger } from '@/lib/logger'
import type { HiringRequest, HiringRequestInsert } from '@/lib/types/database'

// GET /api/hiring-requests
export const GET = withOrg(async (_req, orgId, supabase) => {
  const { data, error } = await supabase
    .from('hiring_requests')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  if (error) return handleSupabaseError(error)
  return NextResponse.json({ data })
})

// POST /api/hiring-requests
// Mode A (send_to_hm):  { position_title, department?, hiring_manager_name, hiring_manager_email, hiring_manager_slack? }
// Mode B (fill_myself): above + filled_by_recruiter:true + all intake fields + generated_jd
export const POST = withOrg(async (request, orgId, supabase) => {
  const body = await parseBody(request, hiringRequestInsertSchema)
  if (body instanceof NextResponse) return body

  const isOptionB = body.filled_by_recruiter

  const insertPayload: Record<string, unknown> = {
    position_title: body.position_title,
    department: body.department || null,
    hiring_manager_name: body.hiring_manager_name,
    hiring_manager_email: body.hiring_manager_email || null,
    hiring_manager_slack: body.hiring_manager_slack || null,
    filled_by_recruiter: isOptionB,
    status: isOptionB ? 'jd_approved' : 'intake_pending',
    intake_sent_at: isOptionB ? null : new Date().toISOString(),
    org_id: orgId,
    scoring_criteria: body.scoring_criteria ?? null,
  }

  if (isOptionB) {
    Object.assign(insertPayload, {
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
      generated_jd: body.generated_jd || null,
      intake_submitted_at: new Date().toISOString(),
    })
  }

  const { data: reqData, error: insertError } = await supabase
    .from('hiring_requests')
    .insert(insertPayload as HiringRequestInsert)
    .select()
    .single()

  if (insertError) return handleSupabaseError(insertError)
  const req = reqData as HiringRequest

  // Replace DB-trigger-created default stages with user-configured pipeline stages
  if (body.pipeline_stages?.length) {
    const validStages = body.pipeline_stages.filter(s => s.name.trim())
    if (validStages.length > 0) {
      await supabase.from('pipeline_stages').delete().eq('hiring_request_id', req.id)
      await supabase.from('pipeline_stages').insert(
        validStages.map((s, i) => ({
          hiring_request_id: req.id,
          name: s.name.trim(),
          color: s.color,
          order_index: i,
          org_id: orgId,
        }))
      )
    }
  }

  // Option B — no email/Slack, return immediately
  if (isOptionB) {
    return NextResponse.json({ data: req }, { status: 201 })
  }

  // Option A — send intake link to HM
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const intakeUrl = `${appUrl}/intake/${req.intake_token}`

  const apiKey = process.env.SENDGRID_API_KEY
  const fromEmail = process.env.SENDGRID_FROM_EMAIL
  if (apiKey && fromEmail && body.hiring_manager_email) {
    sgMail.setApiKey(apiKey)
    try {
      await sgMail.send({
        to: body.hiring_manager_email,
        from: { email: fromEmail, name: 'RecruiterStack' },
        subject: `Action needed: Share your requirements for ${body.position_title}`,
        text: `Hi ${body.hiring_manager_name},\n\nA hiring request has been kicked off for ${body.position_title}.\n\nFill in your requirements here (5 mins): ${intakeUrl}\n\nThanks!`,
        html: `
          <p>Hi ${body.hiring_manager_name},</p>
          <p>A hiring request has been kicked off for <strong>${body.position_title}</strong>.</p>
          <p style="margin:24px 0;">
            <a href="${intakeUrl}" style="background:#2563eb;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;display:inline-block;">
              Fill In Your Requirements →
            </a>
          </p>
          <p>Once submitted, you can generate or write the JD directly and the recruiter will be notified.</p>
        `,
      })
    } catch (e) {
      logger.error('Intake email failed', e)
    }
  }

  const slackWebhook = process.env.SLACK_WEBHOOK_URL
  if (slackWebhook) {
    const mention = body.hiring_manager_slack
      ? `<@${body.hiring_manager_slack.replace('@', '')}>`
      : body.hiring_manager_name
    try {
      await fetch(slackWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `👋 ${mention} — a hiring request for *${body.position_title}* needs your input.\n\nFill in your requirements here (5 mins): ${intakeUrl}`,
        }),
      })
    } catch (e) {
      logger.error('Slack intake notification failed', e)
    }
  }

  return NextResponse.json({ data: req, intake_url: intakeUrl }, { status: 201 })
})
