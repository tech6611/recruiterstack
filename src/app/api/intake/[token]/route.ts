import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { notifySlack } from '@/lib/notifications'
import sgMail from '@sendgrid/mail'
import { checkRateLimit } from '@/lib/api/rate-limit'
import {
  getCanonicalIntakeJobByToken,
  getCanonicalIntakeJobFull,
  submitCanonicalIntakeJob,
} from '@/modules/ats/domain/job-pipelines'

// GET /api/intake/:token — validate token, return canonical job info for the HM form
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const rateLimited = await checkRateLimit(_req)
  if (rateLimited) return rateLimited
  const supabase = createAdminClient()

  const data = await getCanonicalIntakeJobByToken(supabase, params.token)
  if (!data) {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 })
  }
  return NextResponse.json({ data })
}

// POST /api/intake/:token — HM submits requirements + final JD → canonical job goes live
export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  const rateLimited = await checkRateLimit(request)
  if (rateLimited) return rateLimited

  const supabase = createAdminClient()

  const job = await getCanonicalIntakeJobFull(supabase, params.token)
  if (!job) {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 })
  }
  // An intake-pending canonical job is still 'draft'; once live it can't be resubmitted.
  if (job.status !== 'draft') {
    return NextResponse.json({ error: 'This intake form has already been submitted' }, { status: 409 })
  }

  let body: {
    position_title?: string           // HM can update the title
    team_context: string
    level?: string
    employment_type?: string
    headcount?: number
    location?: string
    remote_ok?: boolean
    work_model?: 'remote' | 'hybrid' | 'onsite'
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

  try {
    await submitCanonicalIntakeJob(supabase, params.token, {
      positionTitle: body.position_title || job.title,
      finalJd: body.final_jd,
      fields: {
        team_context: body.team_context || null,
        level: body.level || null,
        employment_type: body.employment_type || null,
        headcount: body.headcount || 1,
        location: body.location || null,
        remote_ok: body.remote_ok || false,
        work_model: body.work_model || null,
        key_requirements: body.key_requirements || null,
        nice_to_haves: body.nice_to_haves || null,
        target_companies: body.target_companies || null,
        budget_min: body.budget_min || null,
        budget_max: body.budget_max || null,
        target_start_date: body.target_start_date || null,
        additional_notes: body.additional_notes || null,
      },
      existingCustomFields: job.custom_fields,
    })
  } catch {
    return NextResponse.json({ error: 'Failed to save. Please try again.' }, { status: 500 })
  }

  const positionTitle = body.position_title || job.title
  const intakeBag = (job.custom_fields?.intake ?? {}) as Record<string, unknown>
  const hiringManagerName = (intakeBag.hiring_manager_name as string | undefined) || 'The hiring manager'

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const dashboardUrl = `${appUrl}/jobs`
  const statusUrl = `${appUrl}/intake/${params.token}/status`

  // Slack: notify the recruiter channel configured for this org (per-org webhook,
  // consistent with every other channel alert — see lib/notifications.ts).
  await notifySlack(
    job.org_id,
    `✅ *${hiringManagerName}* has submitted the intake for *${positionTitle}* — JD is ready for review!\n→ Dashboard: ${dashboardUrl}`
  )

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
        subject: `JD Ready: ${positionTitle}`,
        text: `${hiringManagerName} has submitted the intake for ${positionTitle}. The JD is ready.\n\n→ ${dashboardUrl}`,
        html: `
          <p><strong>${hiringManagerName}</strong> submitted the intake for <strong>${positionTitle}</strong>. The JD is ready for your review.</p>
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
