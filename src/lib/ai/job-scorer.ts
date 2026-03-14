/**
 * AI Scoring: Candidate vs. HiringRequest
 *
 * Scores a candidate (0–100) against a specific job's requirements.
 * Uses Claude Haiku for speed and cost efficiency during bulk scoring.
 * Separate from src/lib/ai/matcher.ts which scores against generic Role objects.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { Candidate, HiringRequest, AiRecommendation } from '@/lib/types/database'

export interface JobScoreResult {
  score:          number          // 0–100 integer
  recommendation: AiRecommendation
  strengths:      string[]        // 2–4 concrete points relevant to THIS job
  gaps:           string[]        // 0–3 specific gaps (empty if strong match)
}

// Score calibration anchors — embedded in every prompt for consistency
const SCORE_ANCHORS = `
Score calibration (be honest, don't inflate):
  90–100 → Exceptional fit: meets all key requirements, right level, strong background
  75–89  → Strong fit: meets most requirements, minor gaps, recommend advancing
  60–74  → Partial fit: meets some requirements, notable gaps but worth a screen
  40–59  → Weak fit: missing important requirements, level or skills mismatch
  0–39   → Poor fit: major misalignment on requirements, level, or location
`.trim()

function buildScoringCriteriaSection(job: HiringRequest): string {
  const criteria = job.scoring_criteria
  if (!criteria || criteria.length === 0) return ''
  const lines = criteria.map(c =>
    `  - ${c.name} (${c.weight}%)${c.description ? `: ${c.description}` : ''}`,
  )
  return `\nSCORING CRITERIA (weighted rubric for this role — respect these proportions when evaluating):\n${lines.join('\n')}\n`
}

function buildPrompt(candidate: Candidate, job: HiringRequest): string {
  const budget =
    job.budget_min && job.budget_max
      ? `₹${job.budget_min.toLocaleString('en-IN')} – ₹${job.budget_max.toLocaleString('en-IN')}`
      : job.budget_min
        ? `From ₹${job.budget_min.toLocaleString('en-IN')}`
        : job.budget_max
          ? `Up to ₹${job.budget_max.toLocaleString('en-IN')}`
          : 'Not specified'

  const locationLine = job.location
    ? `${job.location}${job.remote_ok ? ' (Remote OK)' : ''}`
    : job.remote_ok
      ? 'Remote'
      : 'Not specified'

  return `You are a senior technical recruiter performing a structured candidate evaluation.

JOB REQUIREMENTS:
- Position: ${job.position_title}${job.department ? ` — ${job.department}` : ''}
- Level: ${job.level ?? 'Not specified'}
- Location: ${locationLine}
- Compensation: ${budget}
- Key Requirements: ${job.key_requirements ?? 'Not provided'}
- Nice to Have: ${job.nice_to_haves ?? 'None listed'}
- Team Context: ${job.team_context ?? 'Not provided'}

CANDIDATE PROFILE:
- Name: ${candidate.name}
- Current Title: ${candidate.current_title ?? 'Not provided'}
- Experience: ${candidate.experience_years} year${candidate.experience_years !== 1 ? 's' : ''}
- Skills: ${candidate.skills.length > 0 ? candidate.skills.join(', ') : 'Not listed'}
- Location: ${candidate.location ?? 'Not provided'}

${SCORE_ANCHORS}
${buildScoringCriteriaSection(job)}
Evaluate how well this candidate fits the job. Focus primarily on the Key Requirements. Be honest about gaps — recruiters need accurate scoring, not inflated ones.

Respond with ONLY valid JSON (no markdown, no extra text):
{
  "score": <integer 0-100>,
  "recommendation": "<strong_yes|yes|maybe|no>",
  "strengths": [<2-4 specific strengths relevant to THIS job>],
  "gaps": [<0-3 specific gaps — empty array [] if strong match>]
}`
}

export async function scoreApplicationForJob(
  candidate: Candidate,
  job: HiringRequest,
): Promise<JobScoreResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const message = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages:   [{ role: 'user', content: buildPrompt(candidate, job) }],
  })

  const content = message.content[0]
  if (content.type !== 'text') throw new Error('Unexpected Claude response type')

  const raw = content.text.trim()
  // Strip markdown code fences if present (safety net)
  const json = raw.startsWith('```')
    ? raw.replace(/```(?:json)?\n?/g, '').trim()
    : raw.startsWith('{')
      ? raw
      : (raw.match(/\{[\s\S]*\}/)?.[0] ?? raw)

  const result = JSON.parse(json) as JobScoreResult

  // Defensive clamping — LLMs occasionally drift
  result.score        = Math.max(0, Math.min(100, Math.round(result.score)))
  result.strengths    = Array.isArray(result.strengths) ? result.strengths.slice(0, 4) : []
  result.gaps         = Array.isArray(result.gaps)      ? result.gaps.slice(0, 3)      : []
  result.recommendation = (['strong_yes', 'yes', 'maybe', 'no'] as AiRecommendation[])
    .includes(result.recommendation)
    ? result.recommendation
    : 'maybe'

  return result
}
