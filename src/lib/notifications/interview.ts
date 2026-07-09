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
  scheduledAt:      string         // ISO UTC
  durationMinutes:  number
  timezone:         string | null  // IANA timezone from the booking client, e.g. "Asia/Kolkata"
  // Platform
  interviewType:    string   // 'video' | 'phone' | 'in_person' | etc.
  location:         string | null   // Zoom/Meet URL or office address
  meetLink:         string | null   // Resolved Google Meet link (may differ from location)
  // Extra context
  notes:            string | null   // Recruiter notes / prep instructions for the interview
  // If true, Google Calendar already sent calendar invites — skip SendGrid emails to avoid
  // duplicate confirmations. Slack notification still fires regardless.
  calendarInviteSent?: boolean
  // Recruiter
  recruiterName:    string
  recruiterEmail:   string
}

// ── Formatters ────────────────────────────────────────────────────────────────

/** Strip HTML tags from rich-text notes → plain text for email text body / GCal description */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi,      '\n')
    .replace(/<\/li>/gi,     '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<[^>]+>/g,     '')
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g,  "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function isHtmlEmpty(html: string | null | undefined): boolean {
  return !html || stripHtml(html).trim() === ''
}

function formatDateTime(iso: string, timezone?: string | null): string {
  return new Date(iso).toLocaleString('en-US', {
    weekday:      'long',
    month:        'long',
    day:          'numeric',
    year:         'numeric',
    hour:         '2-digit',
    minute:       '2-digit',
    timeZoneName: 'short',
    ...(timezone ? { timeZone: timezone } : {}),
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
  const apiKey    = process.env.SENDGRID_API_KEY
  const fromEmail = process.env.SENDGRID_FROM_EMAIL

  if (!apiKey || !fromEmail) return

  sgMail.setApiKey(apiKey)

  const dateStr    = formatDateTime(p.scheduledAt, p.timezone)
  const details    = meetingDetails(p)
  const link       = p.meetLink ?? p.location
  const hasNotes   = !isHtmlEmpty(p.notes)
  const notesPlain = hasNotes ? stripHtml(p.notes!) : ''
  const notesHtml  = hasNotes ? p.notes! : ''

  // Plain-text version
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
    hasNotes ? `\nNotes from the recruiter:\n${notesPlain}` : '',
    '',
    `If you have any questions or need to reschedule, please reply to this email.`,
    '',
    `Best of luck!`,
    `${p.recruiterName}`,
  ].filter(Boolean).join('\n')

  // HTML version — notes injected as rich HTML, rest as formatted paragraphs
  const html = `
    <p>Hi ${p.candidateName},</p>
    <p>Your interview for the <strong>${p.positionTitle}</strong> role has been confirmed.</p>
    <p>
      <strong>Date &amp; Time:</strong> ${dateStr}<br>
      <strong>Duration:</strong> ${p.durationMinutes} minutes<br>
      <strong>Interviewer:</strong> ${p.interviewerName}
    </p>
    ${link ? `<p><a href="${link}">Join your interview →</a></p>` : ''}
    ${hasNotes ? `<p><strong>Notes from the recruiter:</strong></p>${notesHtml}` : ''}
    <p>If you have any questions or need to reschedule, please reply to this email.</p>
    <p>Best of luck!<br>${p.recruiterName}</p>
  `.trim()

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

  const dateStr    = formatDateTime(p.scheduledAt, p.timezone)
  const link       = p.meetLink ?? p.location
  const hasNotes   = !isHtmlEmpty(p.notes)
  const notesPlain = hasNotes ? stripHtml(p.notes!) : ''
  const notesHtml  = hasNotes ? p.notes! : ''

  // Plain-text version
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
    hasNotes ? `\nNotes:\n${notesPlain}` : '',
    '',
    `A calendar invite has been sent to your email.`,
    '',
    `— ${p.recruiterName} via RecruiterStack`,
  ].filter(Boolean).join('\n')

  // HTML version
  const html = `
    <p>Hi ${p.interviewerName},</p>
    <p>You have an interview scheduled with <strong>${p.candidateName}</strong> for the <strong>${p.positionTitle}</strong> role.</p>
    <p>
      <strong>Date &amp; Time:</strong> ${dateStr}<br>
      <strong>Duration:</strong> ${p.durationMinutes} minutes<br>
      <strong>Candidate:</strong> ${p.candidateName} &lt;${p.candidateEmail}&gt;
    </p>
    ${link ? `<p><strong>Join link:</strong> <a href="${link}">${link}</a></p>` : ''}
    ${hasNotes ? `<p><strong>Notes:</strong></p>${notesHtml}` : ''}
    <p>A calendar invite has been sent to your email.</p>
    <p>— ${p.recruiterName} via RecruiterStack</p>
  `.trim()

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
 * When calendarInviteSent is true, Google Calendar has already emailed all
 * attendees its own invite, so we skip the SendGrid emails to avoid duplicates.
 * The Slack notification always fires regardless.
 * Never throws — swallows all errors so the caller's main flow isn't broken.
 */
export async function notifyInterviewScheduled(
  p: InterviewNotificationPayload
): Promise<void> {
  try {
    const tasks = [sendSlackNotifications(p)]
    if (!p.calendarInviteSent) {
      tasks.push(sendCandidateEmail(p))
      tasks.push(sendInterviewerEmail(p))
    }
    await Promise.allSettled(tasks)
  } catch (e) {
    console.error('[interview-notify] unexpected error:', e)
  }
}

// ── Cancellation notifications ────────────────────────────────────────────────

export interface InterviewCancelPayload {
  orgId:            string
  candidateName:    string
  candidateEmail:   string
  interviewerName:  string
  interviewerEmail: string | null
  positionTitle:    string
  scheduledAt:      string         // ISO UTC of the interview that was cancelled
  timezone:         string | null  // IANA tz for display, if known
  recruiterName?:   string
  recruiterEmail?:  string
}

async function sendCancelEmails(p: InterviewCancelPayload): Promise<void> {
  const apiKey    = process.env.SENDGRID_API_KEY
  const fromEmail = process.env.SENDGRID_FROM_EMAIL
  if (!apiKey || !fromEmail) return

  sgMail.setApiKey(apiKey)

  const dateStr        = formatDateTime(p.scheduledAt, p.timezone)
  const recruiterName  = p.recruiterName || 'RecruiterStack'
  const replyTo        = p.recruiterEmail || fromEmail
  const fromField      = { email: fromEmail, name: recruiterName }

  const sends: Promise<unknown>[] = []

  // Candidate
  if (p.candidateEmail) {
    const text = [
      `Hi ${p.candidateName},`,
      '',
      `Your interview for the ${p.positionTitle} role, previously scheduled for ${dateStr}, has been cancelled.`,
      '',
      `We'll be in touch with next steps. If you have any questions, just reply to this email.`,
      '',
      `Best,`,
      recruiterName,
    ].join('\n')
    const html = `
      <p>Hi ${p.candidateName},</p>
      <p>Your interview for the <strong>${p.positionTitle}</strong> role, previously scheduled for <strong>${dateStr}</strong>, has been <strong>cancelled</strong>.</p>
      <p>We'll be in touch with next steps. If you have any questions, just reply to this email.</p>
      <p>Best,<br>${recruiterName}</p>
    `.trim()
    sends.push(
      sgMail.send({
        to: p.candidateEmail, from: fromField, replyTo,
        subject: `Interview Cancelled — ${p.positionTitle}`,
        text, html,
      }).catch(e => console.error('[interview-notify] candidate cancel email failed:', e)),
    )
  }

  // Interviewer
  if (p.interviewerEmail) {
    const text = [
      `Hi ${p.interviewerName},`,
      '',
      `The interview with ${p.candidateName} for the ${p.positionTitle} role, scheduled for ${dateStr}, has been cancelled.`,
      '',
      `The calendar invite has been removed. No action is needed on your end.`,
      '',
      `— ${recruiterName} via RecruiterStack`,
    ].join('\n')
    const html = `
      <p>Hi ${p.interviewerName},</p>
      <p>The interview with <strong>${p.candidateName}</strong> for the <strong>${p.positionTitle}</strong> role, scheduled for <strong>${dateStr}</strong>, has been <strong>cancelled</strong>.</p>
      <p>The calendar invite has been removed. No action is needed on your end.</p>
      <p>— ${recruiterName} via RecruiterStack</p>
    `.trim()
    sends.push(
      sgMail.send({
        to: p.interviewerEmail, from: fromField, replyTo,
        subject: `Interview Cancelled: ${p.candidateName} for ${p.positionTitle}`,
        text, html,
      }).catch(e => console.error('[interview-notify] interviewer cancel email failed:', e)),
    )
  }

  await Promise.allSettled(sends)
}

async function sendCancelSlack(p: InterviewCancelPayload): Promise<void> {
  const dateStr = formatDateTime(p.scheduledAt)

  const channelText = [
    `❌ *Interview Cancelled* — ${p.positionTitle}`,
    `👤 Candidate: ${p.candidateName}`,
    `🎤 Interviewer: ${p.interviewerName}`,
    `🕒 was ${dateStr}`,
  ].join('\n')
  await notifySlack(p.orgId, channelText)

  if (p.interviewerEmail) {
    const dmText = [
      `❌ Interview cancelled: *${p.candidateName}* for *${p.positionTitle}*`,
      `🕒 was ${dateStr} — the calendar invite has been removed.`,
    ].join('\n')
    await notifySlackDM(p.orgId, p.interviewerEmail, dmText)
  }
}

/**
 * Dispatches interview-cancellation notifications (emails + Slack) concurrently.
 * Never throws — swallows all errors so the caller's main flow isn't broken.
 */
export async function notifyInterviewCancelled(p: InterviewCancelPayload): Promise<void> {
  try {
    await Promise.allSettled([sendCancelEmails(p), sendCancelSlack(p)])
  } catch (e) {
    console.error('[interview-notify] unexpected cancel error:', e)
  }
}

// ── Reminder notifications ────────────────────────────────────────────────────

export interface InterviewReminderPayload {
  orgId:            string
  candidateName:    string
  candidateEmail:   string
  interviewerName:  string
  interviewerEmail: string | null
  positionTitle:    string
  scheduledAt:      string          // ISO UTC
  durationMinutes:  number
  timezone:         string | null
  interviewType:    string
  location:         string | null   // Zoom/Meet URL or office address
  meetLink:         string | null
  leadMinutes:      number          // how long before the interview this fires
}

/** Human phrase for "how far ahead" — e.g. 1440 → "in about 24 hours", 30 → "in about 30 minutes". */
function leadPhrase(mins: number): string {
  if (mins % 1440 === 0) { const d = mins / 1440; return d === 1 ? 'in about 24 hours' : `in about ${d} days` }
  if (mins % 60 === 0)   { const h = mins / 60;   return h === 1 ? 'in about an hour'   : `in about ${h} hours` }
  return `in about ${mins} minutes`
}

async function sendReminderEmails(p: InterviewReminderPayload): Promise<void> {
  const apiKey    = process.env.SENDGRID_API_KEY
  const fromEmail = process.env.SENDGRID_FROM_EMAIL
  if (!apiKey || !fromEmail) return

  sgMail.setApiKey(apiKey)

  const dateStr   = formatDateTime(p.scheduledAt, p.timezone)
  const link      = p.meetLink ?? p.location
  const lead      = leadPhrase(p.leadMinutes)
  const fromField = { email: fromEmail, name: 'RecruiterStack' }
  const typeLabel = {
    video:      'Video Call',
    phone:      'Phone Call',
    in_person:  'In-Person',
    panel:      'Panel Interview',
    technical:  'Technical Interview',
    assessment: 'Assessment',
  }[p.interviewType] ?? 'Interview'

  const sends: Promise<unknown>[] = []

  // Candidate
  if (p.candidateEmail) {
    const text = [
      `Hi ${p.candidateName},`,
      '',
      `A reminder that your interview for the ${p.positionTitle} role is ${lead}.`,
      '',
      `Date & Time: ${dateStr}`,
      `Format:      ${typeLabel}`,
      `Interviewer: ${p.interviewerName}`,
      link ? `\nJoin: ${link}` : '',
      '',
      `Good luck! If you need to reschedule, please reply to this email.`,
    ].filter(Boolean).join('\n')
    const html = `
      <p>Hi ${p.candidateName},</p>
      <p>A reminder that your interview for the <strong>${p.positionTitle}</strong> role is <strong>${lead}</strong>.</p>
      <p>
        <strong>Date &amp; Time:</strong> ${dateStr}<br>
        <strong>Format:</strong> ${typeLabel}<br>
        <strong>Interviewer:</strong> ${p.interviewerName}
      </p>
      ${link ? `<p><a href="${link}">Join your interview →</a></p>` : ''}
      <p>Good luck! If you need to reschedule, please reply to this email.</p>
    `.trim()
    sends.push(
      sgMail.send({
        to: p.candidateEmail, from: fromField, replyTo: fromEmail,
        subject: `Reminder: your interview is ${lead} — ${p.positionTitle}`,
        text, html,
      }).catch(e => console.error('[interview-notify] candidate reminder email failed:', e)),
    )
  }

  // Interviewer
  if (p.interviewerEmail) {
    const text = [
      `Hi ${p.interviewerName},`,
      '',
      `A reminder that your interview with ${p.candidateName} for the ${p.positionTitle} role is ${lead}.`,
      '',
      `Date & Time: ${dateStr}`,
      `Candidate:   ${p.candidateName} <${p.candidateEmail}>`,
      link ? `\nJoin: ${link}` : '',
      '',
      `— RecruiterStack`,
    ].filter(Boolean).join('\n')
    const html = `
      <p>Hi ${p.interviewerName},</p>
      <p>A reminder that your interview with <strong>${p.candidateName}</strong> for the <strong>${p.positionTitle}</strong> role is <strong>${lead}</strong>.</p>
      <p>
        <strong>Date &amp; Time:</strong> ${dateStr}<br>
        <strong>Candidate:</strong> ${p.candidateName} &lt;${p.candidateEmail}&gt;
      </p>
      ${link ? `<p><strong>Join:</strong> <a href="${link}">${link}</a></p>` : ''}
      <p>— RecruiterStack</p>
    `.trim()
    sends.push(
      sgMail.send({
        to: p.interviewerEmail, from: fromField, replyTo: fromEmail,
        subject: `Reminder: interview with ${p.candidateName} is ${lead}`,
        text, html,
      }).catch(e => console.error('[interview-notify] interviewer reminder email failed:', e)),
    )
  }

  await Promise.allSettled(sends)
}

async function sendReminderSlack(p: InterviewReminderPayload): Promise<void> {
  if (!p.interviewerEmail) return
  const dateStr = formatDateTime(p.scheduledAt)
  const link    = p.meetLink ?? p.location
  const dmText = [
    `⏰ Reminder: interview with *${p.candidateName}* for *${p.positionTitle}* is ${leadPhrase(p.leadMinutes)}`,
    `🕒 ${dateStr} (${p.durationMinutes} min)`,
    link ? `🔗 Join: ${link}` : '',
  ].filter(Boolean).join('\n')
  await notifySlackDM(p.orgId, p.interviewerEmail, dmText)
}

/**
 * Dispatches an interview reminder (emails + interviewer Slack DM).
 * Never throws — the queue handler relies on this so a partial send failure
 * doesn't retry the job and double-send the other half.
 */
export async function notifyInterviewReminder(p: InterviewReminderPayload): Promise<void> {
  try {
    await Promise.allSettled([sendReminderEmails(p), sendReminderSlack(p)])
  } catch (e) {
    console.error('[interview-notify] unexpected reminder error:', e)
  }
}
