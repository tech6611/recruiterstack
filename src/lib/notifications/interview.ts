/**
 * Interview notification helpers
 *
 * Sends confirmation emails (via SendGrid) to:
 *   1. The candidate — joining instructions + Meet link
 *   2. The interviewer — reminder + candidate context + Meet link
 *
 * Also fires a Slack channel notification and an optional DM to the interviewer.
 *
 * All functions are fire-and-forget (they swallow errors so as not to break
 * the main schedule-interview flow).
 */

import sgMail from '@sendgrid/mail'
import { notifySlack, notifySlackDM } from '@/lib/notifications'

export interface InterviewNotificationPayload {
  orgId:            string
  // Candidate
  candidateName:    string
  candidateEmail:   string
  // Interviewer
  interviewerName:  string
  interviewerEmail: string | null
  // Position
  positionTitle:    string
  // Timing
  scheduledAt:      string   // ISO UTC
  durationMinutes:  number
  // Platform
  interviewType:    string   // 'video' | 'phone' | 'in_person' | etc.
  location:         string | null   // Zoom/Meet URL or office address
  meetLink:         string | null   // Resolved Google Meet link (may differ from location)
  // Extra context
  notes:            string | null   // Recruiter notes / prep instructions for the interview
  // Recruiter
  recruiterName:    string
  recruiterEmail:   string
}

// ── Formatters ────────────────────────────────────────────────────────────────

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'long',
    month:   'long',
    day:     'numeric',
    year:    'numeric',
    hour:    '2-digit',
    minute:  '2-digit',
    timeZoneName: 'short',
  })
}

function meetingDetails(p: InterviewNotificationPayload): string {
  const link = p.meetLink ?? p.location
  const typeLabel = {
    video:      'Video Call',
    phone:      'Phone Call',
    in_person:  'In-Person',
    panel:      'Panel Interview',
    technical:  'Technical Interview',
    assessment: 'Assessment',
  }[p.interviewType] ?? 'Interview'

  const lines: string[] = [`Format: ${typeLabel}`]
  if (link) lines.push(`Join: ${link}`)
  return lines.join('\n')
}

// ── Email: Candidate ──────────────────────────────────────────────────────────

async function sendCandidateEmail(p: InterviewNotificationPayload): Promise<void> {
  const apiKey   = process.env.SENDGRID_API_KEY
  const fromEmail = process.env.SENDGRID_FROM_EMAIL

  if (!apiKey || !fromEmail) return

  sgMail.setApiKey(apiKey)

  const dateStr = formatDateTime(p.scheduledAt)
  const details = meetingDetails(p)
  const link    = p.meetLink ?? p.location

  const text = [
    `Hi ${p.candidateName},`,
    '',
    `Your interview for the ${p.positionTitle} role has been confirmed.`,
    '',
    `Date & Time: ${dateStr}`,
    `Duration:    ${p.durationMinutes} minutes`,
    `Interviewer: ${p.interviewerName}`,
    '',
    details,
    '',
    link ? `To join your interview, use this link:\n${link}` : '',
    '',
    p.notes?.trim() ? `Notes from the recruiter:\n${p.notes.trim()}` : '',
    '',
    `If you have any questions or need to reschedule, please reply to this email.`,
    '',
    `Best of luck!`,
    `${p.recruiterName}`,
  ].filter(l => l !== undefined).join('\n')

  const html = text
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/^/, '<p>')
    .replace(/$/, '</p>')

  try {
    await sgMail.send({
      to:      p.candidateEmail,
      from:    { email: fromEmail, name: p.recruiterName || 'RecruiterStack' },
      replyTo: p.recruiterEmail,
      subject: `Interview Confirmation — ${p.positionTitle}`,
      text,
      html,
    })
  } catch (e) {
    console.error('[interview-notify] candidate email failed:', e)
  }
}

// ── Email: Interviewer ────────────────────────────────────────────────────────

async function sendInterviewerEmail(p: InterviewNotificationPayload): Promise<void> {
  if (!p.interviewerEmail) return

  const apiKey    = process.env.SENDGRID_API_KEY
  const fromEmail = process.env.SENDGRID_FROM_EMAIL

  if (!apiKey || !fromEmail) return

  sgMail.setApiKey(apiKey)

  const dateStr = formatDateTime(p.scheduledAt)
  const link    = p.meetLink ?? p.location

  const text = [
    `Hi ${p.interviewerName},`,
    '',
    `You have an interview scheduled with ${p.candidateName} for the ${p.positionTitle} role.`,
    '',
    `Date & Time: ${dateStr}`,
    `Duration:    ${p.durationMinutes} minutes`,
    `Candidate:   ${p.candidateName} <${p.candidateEmail}>`,
    '',
    link ? `Join link: ${link}` : '',
    '',
    p.notes?.trim() ? `Recruiter notes:\n${p.notes.trim()}` : '',
    '',
    `A calendar invite has been sent to your email.`,
    '',
    `— ${p.recruiterName} via RecruiterStack`,
  ].filter(l => l !== undefined).join('\n')

  const html = text
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/^/, '<p>')
    .replace(/$/, '</p>')

  try {
    await sgMail.send({
      to:      p.interviewerEmail,
      from:    { email: fromEmail, name: p.recruiterName || 'RecruiterStack' },
      replyTo: p.recruiterEmail,
      subject: `Interview Scheduled: ${p.candidateName} for ${p.positionTitle}`,
      text,
      html,
    })
  } catch (e) {
    console.error('[interview-notify] interviewer email failed:', e)
  }
}

// ── Slack Notifications ───────────────────────────────────────────────────────

async function sendSlackNotifications(p: InterviewNotificationPayload): Promise<void> {
  const dateStr = formatDateTime(p.scheduledAt)
  const link    = p.meetLink ?? p.location

  // Channel notification
  const channelText = [
    `📅 *Interview Scheduled* — ${p.positionTitle}`,
    `👤 Candidate: ${p.candidateName}`,
    `🎤 Interviewer: ${p.interviewerName}`,
    `🕒 ${dateStr} (${p.durationMinutes} min)`,
    link ? `🔗 ${link}` : '',
  ].filter(Boolean).join('\n')

  await notifySlack(p.orgId, channelText)

  // DM to interviewer if email present
  if (p.interviewerEmail) {
    const dmText = [
      `📅 Interview scheduled: *${p.candidateName}* for *${p.positionTitle}*`,
      `🕒 ${dateStr} (${p.durationMinutes} min)`,
      link ? `🔗 Join: ${link}` : '',
    ].filter(Boolean).join('\n')

    await notifySlackDM(p.orgId, p.interviewerEmail, dmText)
  }
}

// ── Public: Fire All Notifications ───────────────────────────────────────────

/**
 * Dispatches all interview-related notifications (emails + Slack) concurrently.
 * Never throws — swallows all errors so the caller's main flow isn't broken.
 */
export async function notifyInterviewScheduled(
  p: InterviewNotificationPayload
): Promise<void> {
  try {
    await Promise.allSettled([
      sendCandidateEmail(p),
      sendInterviewerEmail(p),
      sendSlackNotifications(p),
    ])
  } catch (e) {
    console.error('[interview-notify] unexpected error:', e)
  }
}
