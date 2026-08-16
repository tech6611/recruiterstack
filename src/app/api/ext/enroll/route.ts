import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withApiKey } from '@/lib/api/api-keys'
import { findOrCreateCandidateProfile } from '@/modules/ats/domain/candidates'
import { enrollCandidate } from '@/modules/crm/domain/enroll'
import { getCanonicalJobScoringContext } from '@/modules/ats/domain/job-pipelines'
import { draftOutreachIntro } from '@/lib/ai/outreach-draft'

export const maxDuration = 60 // may draft a personalized intro (one Gemini call)

// The extension sends a person + a target sequence. Email is required because
// candidate identity is keyed on email (people.email is unique per org).
// Optionally it also sends the job it scored the profit against (job_id) plus the
// fit it computed (fit) — when present we personalize the first message from that
// fit and tie the enrollment to the job. `review` holds it for approval (8b-2).
const enrollSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email').transform(v => v.toLowerCase()),
  linkedin_url: z.string().url().nullish().default(null),
  sequence_id: z.string().uuid('Invalid sequence id'),
  job_id: z.string().uuid().nullish(),
  current_title: z.string().max(400).nullish(),
  review: z.boolean().optional(),
  fit: z
    .object({
      why: z.string().max(4000).nullish(),
      evidence: z.array(z.string().max(600)).max(20).nullish(),
    })
    .nullish(),
})

// POST /api/ext/enroll — create-or-find the candidate, then enroll them into
// the chosen sequence. One call = the extension's whole "Add to sequence"
// action. API-key authenticated. Reuses the exact same domain functions the
// browser UI uses, so candidates are created identically.
export const POST = withApiKey(async (req, orgId, supabase) => {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = enrollSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Validation failed',
        issues: parsed.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })),
      },
      { status: 400 },
    )
  }
  const { name, email, linkedin_url, sequence_id, job_id, current_title, review, fit } = parsed.data

  // Step 1: create or find the candidate (a `people` row is found/created
  // first inside this facade, then the candidate profile).
  let candidateId: string
  let candidateCreated: boolean
  try {
    const result = await findOrCreateCandidateProfile(supabase, orgId, {
      name,
      email,
      phone: null,
      resume_url: null,
      current_title: current_title ?? null,
      location: null,
      linkedin_url,
      skills: [],
      experience_years: 0,
    })
    candidateId = result.id
    candidateCreated = result.created
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create candidate' },
      { status: 400 },
    )
  }

  // Step 1.5 (optional): if the extension scored this profile against a job, write
  // a personalized first message from that fit — same as in-app sourcing (8b-1).
  // Best-effort: any failure falls back to the sequence's plain stage-0 template.
  let intro: { subject: string; body: string } | null = null
  if (job_id && fit?.why) {
    try {
      const context = await getCanonicalJobScoringContext(supabase, orgId, job_id).catch(() => null)
      const roleTitle = context?.job?.position_title ?? 'the role'
      const companyName =
        (context?.job as { autopilot_company_name?: string | null } | undefined)?.autopilot_company_name ||
        'our company'
      intro = await draftOutreachIntro(
        {
          first_name: name.split(' ')[0] || 'there',
          candidate_title: current_title ?? null,
          role_title: roleTitle,
          company_name: companyName,
          recruiter_name: 'The Recruiting Team',
          why_they_fit: fit.why,
          evidence: (fit.evidence ?? []).filter((e): e is string => !!e),
        },
        { orgId },
      )
    } catch {
      intro = null
    }
  }

  // Step 2: enroll. `enrollCandidate` is idempotent — a repeat call returns
  // `already_enrolled` rather than double-enrolling.
  const res = await enrollCandidate(supabase, {
    orgId,
    sequenceId: sequence_id,
    candidateId,
    enrolledBy: null,
    intro,
    holdForReview: review === true,
    jobId: job_id ?? null,
  })

  if (!res.enrolled) {
    const status =
      res.reason === 'sequence_not_found' ? 404
      : res.reason === 'already_enrolled' ? 200
      : 400
    return NextResponse.json(
      {
        data: {
          candidate_id: candidateId,
          candidate_created: candidateCreated,
          enrolled: false,
          reason: res.reason,
        },
      },
      { status },
    )
  }

  return NextResponse.json(
    {
      data: {
        candidate_id: candidateId,
        candidate_created: candidateCreated,
        enrolled: true,
        enrollment_id: res.enrollmentId,
        held: review === true,
        personalized: !!intro,
      },
    },
    { status: 201 },
  )
})
