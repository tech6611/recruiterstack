import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'
import { enqueue } from '@/lib/api/job-queue'
import { runInBackground } from '@/lib/api/background'
import { logger } from '@/lib/logger'

// GET /api/candidates/[id]/ai-summary — poll for generated summary
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('candidates')
    .select('ai_summary, ai_summary_generated_at')
    .eq('id', params.id)
    .eq('org_id', orgId)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })
  }

  return NextResponse.json({
    data: {
      summary: data.ai_summary ?? null,
      generated_at: data.ai_summary_generated_at ?? null,
    },
  })
}

// POST /api/candidates/[id]/ai-summary
// Kicks off AI summary generation in the background and returns 202 immediately.
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()

  // Quick check: candidate exists
  const { data: candCheck, error: candErr } = await supabase
    .from('candidates')
    .select('id')
    .eq('id', params.id)
    .eq('org_id', orgId)
    .single()

  if (candErr || !candCheck) {
    return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY is not configured.' },
      { status: 503 },
    )
  }

  // Prefer job queue (persistent, retryable); fall back to runInBackground
  const candidateId = params.id
  try {
    await enqueue({
      orgId,
      jobType: 'ai_summary',
      payload: { candidateId },
    })
  } catch {
    logger.warn('Queue unavailable, falling back to runInBackground', { candidateId })
    runInBackground(async () => {
      await generateAndStoreSummary(candidateId, orgId, apiKey)
    })
  }

  return NextResponse.json(
    { data: { status: 'processing', candidate_id: params.id } },
    { status: 202 },
  )
}

/** Generate AI summary and write it to the candidates table */
async function generateAndStoreSummary(candidateId: string, orgId: string, apiKey: string) {
  const supabase = createAdminClient()

  // ── Fetch candidate + all applications + events + scorecards ────────────────
  const [candRes, appsRes] = await Promise.all([
    supabase
      .from('candidates')
      .select('*')
      .eq('id', candidateId)
      .eq('org_id', orgId)
      .single(),
    supabase
      .from('applications')
      .select(`
        id, status, source, applied_at, ai_score, ai_recommendation,
        ai_strengths, ai_gaps,
        pipeline_stages(name),
        hiring_requests(position_title, department, level)
      `)
      .eq('candidate_id', candidateId)
      .eq('org_id', orgId)
      .order('applied_at', { ascending: false }),
  ])

  if (candRes.error || !candRes.data) {
    logger.error('AI summary: candidate not found', undefined, { candidateId })
    return
  }

  const candidate = candRes.data
  const apps = appsRes.data ?? []

  // Fetch events for all applications
  const appIds = apps.map((a: { id: string }) => a.id)
  const { data: events } = appIds.length
    ? await supabase
        .from('application_events')
        .select('event_type, note, created_by, created_at, from_stage, to_stage')
        .in('application_id', appIds)
        .order('created_at', { ascending: true })
    : { data: [] }

  // Fetch scorecards
  const { data: scorecards } = appIds.length
    ? await supabase
        .from('scorecards')
        .select('interviewer_name, stage_name, recommendation, scores, overall_notes, created_at')
        .in('application_id', appIds)
        .order('created_at', { ascending: false })
    : { data: [] }

  // ── Build context for Claude ────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const appSummaries = apps.map((a: any) => {
    const stage = a.pipeline_stages?.name ?? 'Unknown'
    const job   = a.hiring_requests
    return `- ${job?.position_title ?? 'Unknown role'}${job?.department ? ` (${job.department})` : ''}: ${a.status} / stage: ${stage}${a.ai_score !== null ? ` / AI score: ${a.ai_score}/100` : ''}`
  }).join('\n')

  const eventLog = (events ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((e: any) => {
      const parts = [e.event_type]
      if (e.from_stage && e.to_stage) parts.push(`${e.from_stage} → ${e.to_stage}`)
      else if (e.to_stage) parts.push(e.to_stage)
      if (e.note) parts.push(`"${e.note}"`)
      return `  [${e.created_at?.slice(0, 10)}] ${parts.join(' | ')}`
    })
    .join('\n')

  const scorecardLog = (scorecards ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((s: any) => `  ${s.interviewer_name} (${s.stage_name ?? 'unknown stage'}): ${s.recommendation}${s.overall_notes ? ` — "${s.overall_notes}"` : ''}`)
    .join('\n')

  const prompt = `You are an expert recruiter AI. Summarise the following candidate profile in 3-4 concise paragraphs for a hiring team.

**Candidate**
Name: ${candidate.name}
Title: ${candidate.current_title ?? 'Unknown'}
Location: ${candidate.location ?? 'Not specified'}
Experience: ${candidate.experience_years ?? '?'} years
Skills: ${(candidate.skills ?? []).join(', ') || 'Not listed'}

**Applications**
${appSummaries || 'No applications yet'}

**Activity Timeline**
${eventLog || 'No activity recorded'}

**Interview Scorecards**
${scorecardLog || 'No scorecards yet'}

Write a professional, factual summary covering:
1. Who the candidate is (background, seniority, skills)
2. Their pipeline status across jobs
3. Interview feedback highlights (if any)
4. Overall hiring recommendation with brief rationale

Be concise, direct, and useful for a recruiter who hasn't reviewed this profile before. Do not fabricate details not in the data.`

  const client = new Anthropic({ apiKey })

  const message = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 800,
    messages:   [{ role: 'user', content: prompt }],
  })

  const summary = message.content[0].type === 'text' ? message.content[0].text.trim() : ''

  // Store the summary on the candidate record
  const { error: updateErr } = await supabase
    .from('candidates')
    .update({
      ai_summary: summary,
      ai_summary_generated_at: new Date().toISOString(),
    } as never)
    .eq('id', candidateId)
    .eq('org_id', orgId)

  if (updateErr) {
    logger.error('AI summary: failed to save', updateErr, { candidateId })
  } else {
    logger.info('AI summary generated', { candidateId })
  }
}
