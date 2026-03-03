import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/server'
import type { Candidate, Role } from '@/lib/types/database'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// POST /api/email/draft  { candidate_id, role_id, company_name?, recruiter_name?, recruiter_title?, recruiter_email? }
// Returns { subject, body }
export async function POST(request: NextRequest) {
  const supabase = createAdminClient()

  let body: {
    candidate_id: string
    role_id: string
    company_name?: string
    recruiter_name?: string
    recruiter_title?: string
    recruiter_email?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.candidate_id || !body.role_id) {
    return NextResponse.json(
      { error: 'candidate_id and role_id are required' },
      { status: 400 },
    )
  }

  // Fetch candidate, role, and match in parallel
  const [candRes, roleRes, matchRes] = await Promise.all([
    supabase.from('candidates').select('*').eq('id', body.candidate_id).single(),
    supabase.from('roles').select('*').eq('id', body.role_id).single(),
    supabase
      .from('matches')
      .select('score, strengths, reasoning')
      .eq('candidate_id', body.candidate_id)
      .eq('role_id', body.role_id)
      .single(),
  ])

  if (candRes.error || !candRes.data) {
    return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })
  }
  if (roleRes.error || !roleRes.data) {
    return NextResponse.json({ error: 'Role not found' }, { status: 404 })
  }

  const candidate = candRes.data as Candidate
  const role = roleRes.data as Role
  const match = matchRes.data

  const salaryRange =
    role.salary_min && role.salary_max
      ? `$${role.salary_min.toLocaleString()} – $${role.salary_max.toLocaleString()}`
      : null

  const prompt = `You are a senior recruiter writing a personalized outreach email to a candidate about a job opportunity.

CANDIDATE:
- Name: ${candidate.name}
- Current Title: ${candidate.current_title ?? 'Not specified'}
- Experience: ${candidate.experience_years} years
- Skills: ${candidate.skills.join(', ')}
- Location: ${candidate.location ?? 'Not specified'}

ROLE:
- Title: ${role.job_title}
- Required Skills: ${role.required_skills.join(', ')}
- Min Experience: ${role.min_experience} years
- Location: ${role.location ?? 'Remote / Flexible'}
${salaryRange ? `- Salary: ${salaryRange}` : ''}
${match ? `
AI MATCH CONTEXT:
- Match Score: ${match.score}/100
- Key Strengths: ${(match.strengths as string[]).join(', ')}
- Why they fit: ${match.reasoning}` : ''}

Write a concise, personalized outreach email. Requirements:
- 3-4 short paragraphs max
- Reference 2-3 specific skills or experiences from their background
- Mention why this particular role is a strong fit for them specifically
- Professional but warm and human tone — not corporate/robotic
- End with a clear, low-pressure call to action (e.g. "Would you be open to a quick 20-min chat?")
${body.company_name ? `- The recruiter works at: ${body.company_name}${body.company_name ? ` (use this company name naturally in the email)` : ''}` : '- Do NOT include placeholder text like [Company Name] — write as if from a recruiter at a growing tech company'}
${body.recruiter_name ? `- Sign the email from: ${body.recruiter_name}${body.recruiter_title ? `, ${body.recruiter_title}` : ''}${body.recruiter_email ? ` <${body.recruiter_email}>` : ''}` : '- Use a generic sign-off like "Best, [Recruiter]"'}
- Use the candidate's first name

Respond with ONLY valid JSON — no markdown:
{
  "subject": "<email subject line>",
  "body": "<full email body with newlines as \\n>"
}`

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })

  const content = message.content[0]
  if (content.type !== 'text') {
    return NextResponse.json({ error: 'Unexpected Claude response' }, { status: 500 })
  }

  let result: { subject: string; body: string }
  try {
    const raw = content.text.trim()
    const json = raw.startsWith('```') ? raw.replace(/```(?:json)?\n?/g, '').trim() : raw
    result = JSON.parse(json)
  } catch {
    return NextResponse.json({ error: 'Failed to parse email from Claude' }, { status: 500 })
  }

  return NextResponse.json(result)
}
