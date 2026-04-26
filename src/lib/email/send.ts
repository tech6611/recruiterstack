/**
 * Thin SendGrid wrapper used by all transactional email senders in the app.
 * - Skips silently in dev / when SENDGRID_API_KEY is absent (keeps tests green)
 * - Logs failures via the central logger; never throws — non-critical send path
 */

import sgMail from '@sendgrid/mail'
import { logger } from '@/lib/logger'

let initialized = false

function init(): boolean {
  if (initialized) return true
  const key = process.env.SENDGRID_API_KEY
  if (!key) return false
  sgMail.setApiKey(key)
  initialized = true
  return true
}

export interface EmailMessage {
  to:       string | string[]
  subject:  string
  html:     string
  text?:    string                       // optional plaintext fallback
  cc?:      string | string[]
  reply_to?: string
}

export async function sendEmail(msg: EmailMessage): Promise<void> {
  if (!init()) {
    logger.warn('[email] SENDGRID_API_KEY not set; skipping send', { to: msg.to, subject: msg.subject })
    return
  }
  const from = process.env.SENDGRID_FROM_EMAIL ?? 'no-reply@recruiterstack.in'
  try {
    await sgMail.send({
      to:       msg.to,
      from,
      subject:  msg.subject,
      html:     msg.html,
      text:     msg.text ?? stripHtml(msg.html),
      cc:       msg.cc,
      replyTo:  msg.reply_to,
    })
  } catch (err) {
    logger.error('[email] send failed', err, { to: msg.to, subject: msg.subject })
    // Do not throw — caller treats email as best-effort.
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<\/(p|div|h[1-6]|li|br)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
