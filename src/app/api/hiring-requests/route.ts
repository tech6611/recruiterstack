import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import sgMail from '@sendgrid/mail'

// GET /api/hiring-requests
export async function GET() {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('hiring_requests')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// POST /api/hiring-requests  { position_title, department?, hiring_manager_name, hiring_manager_email, hiring_manager_slack? }
export async function POST(request: NextRequest) {
  const supabase = createAdminClient()

  let body: {
    position_title: string
    department?: string
    hiring_manager_name: string
    hiring_manager_email: string
    hiring_manager_slack?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.position_title || !body.hiring_manager_name || !body.hiring_manager_email) {
    return NextResponse.json(
      { error: 'position_title, hiring_manager_name, and hiring_manager_email are required' },
      { status: 400 },
    )
  }

  const { data: req, error: insertError } = await supabase
    .from('hiring_requests')
    .insert({
      position_title: body.position_title,
      department: body.department || null,
      hiring_manager_name: body.hiring_manager_name,
      hiring_manager_email: body.hiring_manager_email,
      hiring_manager_slack: body.hiring_manager_slack || null,
      intake_sent_at: new Date().toISOString(),
    } as any)
    .select()
    .single()

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const intakeUrl = `${appUrl}/intake/${req.intake_token}`

  // Send email to hiring manager
  const apiKey = process.env.SENDGRID_API_KEY
  const fromEmail = process.env.SENDGRID_FROM_EMAIL
  if (apiKey && fromEmail) {
    sgMail.setApiKey(apiKey)
    try {
      await sgMail.send({
        to: body.hiring_manager_email,
        from: { email: fromEmail, name: 'RecruiterStack' },
        subject: `Action needed: Share your requirements for ${body.position_title}`,
        text: `Hi ${body.hiring_manager_name},\n\nA hiring request has been kicked off for ${body.position_title}.\n\nTo get the Job Description drafted, we need a few details from you — takes about 5 minutes:\n\n→ ${intakeUrl}\n\nOnce you submit, Claude will generate a polished JD and send it back to you for review.\n\nThanks!`,
        html: `
          <p>Hi ${body.hiring_manager_name},</p>
          <p>A hiring request has been kicked off for <strong>${body.position_title}</strong>.</p>
          <p>To get the Job Description drafted, we need a few details from you — takes about 5 minutes:</p>
          <p style="margin:24px 0;">
            <a href="${intakeUrl}" style="background:#2563eb;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;display:inline-block;">
              Share Your Requirements →
            </a>
          </p>
          <p>Once you submit, Claude will generate a polished JD and send it back to you for review within minutes.</p>
          <p>Thanks!</p>
        `,
      })
    } catch (e) {
      console.error('Intake email failed:', e)
    }
  }

  // Send Slack notification
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
      console.error('Slack intake notification failed:', e)
    }
  }

  return NextResponse.json({ data: req, intake_url: intakeUrl }, { status: 201 })
}
