import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'

type TemplateKey = 'interview_invite' | 'rejection' | 'offer' | 'followup'

const TEMPLATE_DESC: Record<TemplateKey, string> = {
  interview_invite: 'an interview invitation',
  rejection:        'a respectful, empathetic rejection',
  offer:            'an exciting job offer congratulations',
  followup:         'a friendly follow-up to check on their application status',
}

// POST /api/applications/[id]/email-draft
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY is not configured. Add it to .env.local to enable AI email drafts.' },
      { status: 503 }
    )
  }

  let body: Record<string, string>
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const template      = (body.template      as TemplateKey) ?? 'interview_invite'
  const recruiterName = body.recruiter_name  ?? 'The Recruiting Team'
  const recruiterTitle = body.recruiter_title ?? ''
  const companyName   = body.company_name    ?? 'our company'

  if (!TEMPLATE_DESC[template]) {
    return NextResponse.json({ error: 'Invalid template' }, { status: 400 })
  }

  // ── Fetch application context ──────────────────────────────────────────────
  const supabase = createAdminClient()
  const { data: app, error } = await supabase
    .from('applications')
    .select(`
      id, status,
      candidate:candidates(name, email),
      job:hiring_requests(position_title, department),
      stage:pipeline_stages(name)
    `)
    .eq('id', params.id)
    .eq('org_id', orgId)
    .single()

  if (error || !app) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidate   = app.candidate as any as { name: string; email: string } | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const job         = app.job       as any as { position_title: string; department: string | null } | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stage       = app.stage     as any as { name: string } | null

  const firstName   = candidate?.name?.split(' ')[0] ?? 'there'
  const jobTitle    = job?.position_title ?? 'the position'
  const department  = job?.department
  const stageName   = stage?.name ?? 'Applied'

  // ── Call Claude ────────────────────────────────────────────────────────────
  const client = new Anthropic({ apiKey })

  const prompt = `Write ${TEMPLATE_DESC[template]} email from a recruiter to a job candidate.

Context:
- Candidate first name: ${firstName}
- Role: ${jobTitle}${department ? ` — ${department}` : ''}
- Current pipeline stage: ${stageName}
- Company: ${companyName}
- Recruiter: ${recruiterName}${recruiterTitle ? `, ${recruiterTitle}` : ''}

Requirements:
- Professional but warm tone
- Concise (3-5 short paragraphs max)
- Address candidate by first name
- Sign off with recruiter name and title
- No placeholder brackets like [date] or [time] — use natural language instead (e.g. "in the coming days")

Respond with ONLY a valid JSON object in this exact format, nothing else:
{"subject": "...", "body": "..."}`

  try {
    const message = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages:   [{ role: 'user', content: prompt }],
    })

    const raw  = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
    const json = raw.startsWith('{') ? raw : (raw.match(/\{[\s\S]*\}/)?.[0] ?? '')
    const draft = JSON.parse(json) as { subject: string; body: string }

    return NextResponse.json({ data: draft })
  } catch {
    return NextResponse.json({ error: 'AI generation failed — check your API key and try again.' }, { status: 500 })
  }
}
