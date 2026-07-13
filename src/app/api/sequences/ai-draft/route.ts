import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'
import { generateText } from '@/lib/ai/llm'
import { trackUsage } from '@/lib/ai/track-usage'
import { SEQUENCE_TOKENS } from '@/lib/sequences/tokens'

// The five draft styles the stage editor offers. Each maps to a short brief the
// model expands into a full email. Kept server-side so the prompt can't be
// tampered with from the client.
const TEMPLATE_BRIEFS: Record<string, string> = {
  cold_outreach:
    'A first-touch cold outreach email introducing a job opportunity to a passive candidate. Warm, specific, and low-pressure — earn a reply, do not hard-sell.',
  follow_up:
    'A brief, polite follow-up to an earlier unanswered outreach email. Gently bump the thread, acknowledge they are busy, and restate the value in one line.',
  interview_invite:
    'An email inviting the candidate to an interview after they showed interest. Enthusiastic and clear, proposing that they share their availability.',
  value_prop:
    'An email that sells why this company is a compelling place to work for someone with the candidate\'s background — 2-3 concrete reasons, still humble and non-pushy.',
  breakup:
    'A final, graceful "break-up" email after several unanswered touches. No guilt-tripping; leave the door open and wish them well.',
}

const TOKEN_LIST = SEQUENCE_TOKENS.map(t => `${t.token} (${t.label})`).join(', ')

// POST /api/sequences/ai-draft  { template_id, channel?, company_name?, recruiter_name? }
// Returns { subject, body } — an AI-written email template with merge tokens left
// in place (substituted per candidate at send time).
export const POST = withCapability('recruiting:edit', async (req, orgId, _supabase, _ctx, _scope, userId) => {
  let payload: { template_id?: string; channel?: string; company_name?: string; recruiter_name?: string }
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const brief = TEMPLATE_BRIEFS[payload.template_id ?? '']
  if (!brief) {
    return NextResponse.json({ error: 'Unknown template_id' }, { status: 400 })
  }

  const channel = payload.channel === 'whatsapp' || payload.channel === 'sms' || payload.channel === 'linkedin'
    ? payload.channel
    : 'email'

  const prompt = `You are a senior recruiter writing a reusable ${channel} outreach template that will be sent to many different candidates.

TEMPLATE STYLE: ${brief}

You must write it using merge tokens so it personalizes per candidate at send time. Use ONLY these tokens where relevant (write them verbatim, including the double braces): ${TOKEN_LIST}.
${payload.company_name ? `The hiring company is "${payload.company_name}" — you may still use {{company_name}} in the copy.` : ''}
${payload.recruiter_name ? `Sign off as "${payload.recruiter_name}" or use {{recruiter_name}}.` : 'Sign off with {{recruiter_name}}.'}

Requirements:
- 3-4 short paragraphs max, professional but warm and human — never robotic or spammy.
- Naturally reference the candidate using {{candidate_first_name}} and at least one of {{candidate_title}} / {{candidate_company}}.
- Always mention the opportunity via {{job_title}} and/or {{company_name}}.
- End with a clear, low-pressure call to action.
- The body must be simple HTML using <p> paragraphs (and <ul><li> only if a list genuinely helps).

Respond with ONLY valid JSON — no markdown, no code fences:
{
  "subject": "<subject line, may include tokens>",
  "body": "<HTML body with tokens>"
}`

  const { text, usage, model } = await generateText(prompt, {
    model: 'gemini-2.5-pro',
    maxTokens: 1024,
  })
  trackUsage('sequence-ai-draft', model, usage, { orgId, userId })

  let result: { subject: string; body: string }
  try {
    const raw = text.trim()
    const json = raw.startsWith('```') ? raw.replace(/```(?:json)?\n?/g, '').trim() : raw
    result = JSON.parse(json)
  } catch {
    return NextResponse.json({ error: 'AI returned an unexpected format. Please try again.' }, { status: 502 })
  }

  if (!result.subject || !result.body) {
    return NextResponse.json({ error: 'AI draft was incomplete. Please try again.' }, { status: 502 })
  }

  return NextResponse.json({ data: result })
})
