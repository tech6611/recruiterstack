import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withApiKey } from '@/lib/api/api-keys'
import { findOrCreateCandidateProfile } from '@/modules/ats/domain/candidates'
import { enrollCandidate } from '@/modules/crm/domain/enroll'

// The extension sends a person + a target sequence. Email is required because
// candidate identity is keyed on email (people.email is unique per org).
const enrollSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email').transform(v => v.toLowerCase()),
  linkedin_url: z.string().url().nullish().default(null),
  sequence_id: z.string().uuid('Invalid sequence id'),
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
  const { name, email, linkedin_url, sequence_id } = parsed.data

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
      current_title: null,
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

  // Step 2: enroll. `enrollCandidate` is idempotent — a repeat call returns
  // `already_enrolled` rather than double-enrolling.
  const res = await enrollCandidate(supabase, {
    orgId,
    sequenceId: sequence_id,
    candidateId,
    enrolledBy: null,
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
      },
    },
    { status: 201 },
  )
})
