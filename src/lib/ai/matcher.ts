import Anthropic from '@anthropic-ai/sdk'
import type { Candidate, Role, MatchRecommendation } from '@/lib/types/database'

export interface MatchResult {
  score: number
  strengths: string[]
  gaps: string[]
  reasoning: string
  recommendation: MatchRecommendation
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function matchCandidateToRole(
  candidate: Candidate,
  role: Role,
): Promise<MatchResult> {
  const salaryRange =
    role.salary_min && role.salary_max
      ? `$${role.salary_min.toLocaleString()} – $${role.salary_max.toLocaleString()}`
      : 'Not specified'

  const prompt = `You are a senior technical recruiter. Evaluate how well this candidate fits the role.

CANDIDATE:
- Name: ${candidate.name}
- Current Title: ${candidate.current_title ?? 'N/A'}
- Experience: ${candidate.experience_years} years
- Skills: ${candidate.skills.join(', ')}
- Location: ${candidate.location ?? 'N/A'}

ROLE:
- Title: ${role.job_title}
- Required Skills: ${role.required_skills.join(', ')}
- Minimum Experience: ${role.min_experience} years
- Location: ${role.location ?? 'Remote/Any'}
- Salary: ${salaryRange}

Respond with ONLY valid JSON — no markdown, no extra text:
{
  "score": <integer 0-100>,
  "strengths": [<2-4 specific strengths>],
  "gaps": [<0-3 specific gaps or missing skills, empty array if strong match>],
  "reasoning": "<2-3 sentences explaining the fit>",
  "recommendation": "<strong_yes | yes | maybe | no>"
}`

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  })

  const content = message.content[0]
  if (content.type !== 'text') throw new Error('Unexpected response type from Claude')

  const raw = content.text.trim()
  // Strip markdown code fences if present
  const json = raw.startsWith('```') ? raw.replace(/```(?:json)?\n?/g, '').trim() : raw

  return JSON.parse(json) as MatchResult
}
