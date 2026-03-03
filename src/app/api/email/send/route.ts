import { NextRequest, NextResponse } from 'next/server'
import sgMail from '@sendgrid/mail'

// POST /api/email/send  { to, subject, body, from_name?, reply_to? }
export async function POST(request: NextRequest) {
  const apiKey = process.env.SENDGRID_API_KEY
  const fromEmail = process.env.SENDGRID_FROM_EMAIL

  if (!apiKey) {
    return NextResponse.json({ error: 'SENDGRID_API_KEY is not configured' }, { status: 500 })
  }
  if (!fromEmail) {
    return NextResponse.json({ error: 'SENDGRID_FROM_EMAIL is not configured' }, { status: 500 })
  }

  let body: {
    to: string
    subject: string
    body: string
    from_name?: string
    reply_to?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.to || !body.subject || !body.body) {
    return NextResponse.json({ error: 'to, subject, and body are required' }, { status: 400 })
  }

  sgMail.setApiKey(apiKey)

  try {
    await sgMail.send({
      to: body.to,
      from: {
        email: fromEmail,
        name: body.from_name || 'RecruiterStack',
      },
      replyTo: body.reply_to || undefined,
      subject: body.subject,
      text: body.body,
      html: body.body.replace(/\n/g, '<br>'),
    })
  } catch (err: any) {
    const msg = err?.response?.body?.errors?.[0]?.message ?? err?.message ?? 'Failed to send email'
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
