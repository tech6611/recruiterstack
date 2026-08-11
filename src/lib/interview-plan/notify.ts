// Notifications for interview-plan approvals (Phase C2, all channels).
// Each channel degrades gracefully: email skips without SENDGRID, Slack DM skips
// if the org has no Slack / the user isn't found, in-app always writes. The whole
// thing is non-throwing so a notification failure never breaks submit/decide.

import { createAdminClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email/send'
import { notifySlackDM } from '@/lib/notifications'
import { createNotification } from '@/lib/api/notify'
import { logger } from '@/lib/logger'

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL ?? 'https://recruiterstack.in'
const planLink = (jobId: string) => `${APP_URL()}/req-jobs/${jobId}`

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any

async function getUser(userId: string | null): Promise<{ email: string | null; name: string } | null> {
  if (!userId) return null
  const sb = createAdminClient() as unknown as Loose
  const { data } = await sb.from('users').select('email, full_name').eq('id', userId).maybeSingle()
  if (!data) return null
  return { email: data.email ?? null, name: data.full_name || data.email || 'there' }
}

async function getJobTitle(jobId: string): Promise<string> {
  const sb = createAdminClient() as unknown as Loose
  const { data } = await sb.from('jobs').select('title').eq('id', jobId).maybeSingle()
  return data?.title ?? 'a job'
}

/** On submit: tell the approver (hiring manager) a change awaits their sign-off. */
export async function notifyPlanChangeSubmitted(input: {
  orgId: string; jobId: string; approverUserId: string | null; requesterUserId: string | null
}): Promise<void> {
  try {
    if (!input.approverUserId) return
    const [approver, requester, title] = await Promise.all([
      getUser(input.approverUserId), getUser(input.requesterUserId), getJobTitle(input.jobId),
    ])
    if (!approver) return
    const link = planLink(input.jobId)
    const by = requester ? ` by ${requester.name}` : ''
    const subject = `Interview-plan change awaiting your approval — ${title}`
    const line = `A change to the interview plan for “${title}” was submitted${by} and needs your approval.`

    await createNotification({
      orgId: input.orgId, userId: input.approverUserId, type: 'approval_requested',
      title: `Interview-plan change awaiting approval — ${title}`, resourceType: 'job', resourceId: input.jobId,
    })
    if (approver.email) {
      await sendEmail({
        to: approver.email, subject,
        html: `<p>Hi ${approver.name},</p><p>${line}</p><p><a href="${link}">Review it on the Interview plan tab →</a></p>`,
      })
      await notifySlackDM(input.orgId, approver.email, `${line}\n${link}`)
    }
  } catch (e) {
    logger.warn('[interview-plan] submit notification failed', { error: e instanceof Error ? e.message : String(e) })
  }
}

/** On decision: tell the requester whether their change was approved or rejected. */
export async function notifyPlanChangeDecided(input: {
  orgId: string; jobId: string; requesterUserId: string | null; deciderUserId: string | null
  decision: 'approve' | 'reject'; reason?: string | null
}): Promise<void> {
  try {
    if (!input.requesterUserId) return
    const [requester, decider, title] = await Promise.all([
      getUser(input.requesterUserId), getUser(input.deciderUserId), getJobTitle(input.jobId),
    ])
    if (!requester) return
    const link = planLink(input.jobId)
    const verb = input.decision === 'approve' ? 'approved and applied' : 'rejected'
    const by = decider ? ` by ${decider.name}` : ''
    const reason = input.reason ? ` Reason: ${input.reason}` : ''
    const subject = `Interview-plan change ${input.decision === 'approve' ? 'approved' : 'rejected'} — ${title}`
    const line = `Your interview-plan change for “${title}” was ${verb}${by}.${reason}`

    await createNotification({
      orgId: input.orgId, userId: input.requesterUserId, type: 'approval_decided',
      title: subject, resourceType: 'job', resourceId: input.jobId,
    })
    if (requester.email) {
      await sendEmail({
        to: requester.email, subject,
        html: `<p>Hi ${requester.name},</p><p>${line}</p><p><a href="${link}">View the plan →</a></p>`,
      })
      await notifySlackDM(input.orgId, requester.email, `${line}\n${link}`)
    }
  } catch (e) {
    logger.warn('[interview-plan] decision notification failed', { error: e instanceof Error ? e.message : String(e) })
  }
}
