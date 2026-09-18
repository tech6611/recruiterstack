import { describe, it, expect } from 'vitest'
import { getFirstLeadStage, getFirstApplicationStage, getFirstJobStage } from './job-pipelines'

// Minimal Supabase stub: every query for pipeline_stages resolves to `rows`.
// These helpers end in .order('order_index'), which we resolve directly.
function mockSb(rows: unknown[]) {
  const q: Record<string, unknown> = {}
  q.select = () => q
  q.eq = () => q
  q.order = () => Promise.resolve({ data: rows, error: null })
  q.limit = () => q
  q.maybeSingle = () => Promise.resolve({ data: (rows as unknown[])[0] ?? null, error: null })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from: () => q } as any
}

// Post-migration-134 shape: "Applied" is in the application_review zone; the first
// ACTIVE-zone stage is "Screening".
const NEW_LEAD = { id: 'lead-1', name: 'New lead', order_index: -3, zone: 'lead' }
const REACHED = { id: 'lead-2', name: 'Reached out', order_index: -2, zone: 'lead' }
const APPLIED = { id: 'app-1', name: 'Applied', order_index: 0, zone: 'application_review' }
const SCREEN = { id: 'act-1', name: 'Screening', order_index: 1, zone: 'active' }
const FULL = [NEW_LEAD, REACHED, APPLIED, SCREEN]

describe('getFirstApplicationStage', () => {
  it('routes an inbound applicant to the first application_review stage ("Applied")', async () => {
    const stage = await getFirstApplicationStage(mockSb(FULL), 'org_1', 'job_1')
    expect(stage).toEqual({ id: 'app-1', name: 'Applied' })
  })

  it('falls back to the first active stage when no application_review zone exists (pre-134)', async () => {
    // Pre-migration shape: "Applied" is still zone 'active' and sorts first.
    const preRows = [{ id: 'app-1', name: 'Applied', order_index: 0, zone: 'active' }, SCREEN]
    const stage = await getFirstApplicationStage(mockSb(preRows), 'org_1', 'job_1')
    expect(stage).toEqual({ id: 'app-1', name: 'Applied' })
  })

  it('returns null when the job has no stages', async () => {
    expect(await getFirstApplicationStage(mockSb([]), 'org_1', 'job_1')).toBeNull()
  })
})

describe('getFirstJobStage (active-zone entry = lead promotion target)', () => {
  it('returns the first ACTIVE-zone stage ("Screening"), skipping the review zone', async () => {
    const stage = await getFirstJobStage(mockSb(FULL), 'org_1', 'job_1')
    expect(stage).toEqual({ id: 'act-1', name: 'Screening' })
  })
})

describe('getFirstLeadStage', () => {
  it('routes a sourced candidacy to the first lead stage with lifecycle "lead"', async () => {
    const res = await getFirstLeadStage(mockSb(FULL), 'org_1', 'job_1')
    expect(res.lifecycle).toBe('lead')
    expect(res.stage).toEqual({ id: 'lead-1', name: 'New lead' })
  })

  it('falls back to the application-review entry ("Applied", lifecycle "active") when the job has no lead zone', async () => {
    const res = await getFirstLeadStage(mockSb([APPLIED, SCREEN]), 'org_1', 'job_1')
    expect(res.lifecycle).toBe('active')
    expect(res.stage).toEqual({ id: 'app-1', name: 'Applied' })
  })

  it('returns a null stage (lifecycle "active") when the job has no stages at all', async () => {
    const res = await getFirstLeadStage(mockSb([]), 'org_1', 'job_1')
    expect(res.lifecycle).toBe('active')
    expect(res.stage).toBeNull()
  })
})

// ── canonicalJobToHiringRequest: the intake + JD must reach the AI prompts ────────
import { canonicalJobToHiringRequest, htmlToPromptText } from './job-pipelines'

describe('htmlToPromptText', () => {
  it('turns Tiptap list HTML into "- " bullets and drops tags/entities', () => {
    const html = '<ul><li><p>At least a 2:1 degree</p></li><li><p>SQL, Python,&nbsp;or R &amp; more</p></li></ul><p></p>'
    expect(htmlToPromptText(html)).toBe('- At least a 2:1 degree\n- SQL, Python, or R & more')
  })
  it('passes plain text through and returns null for empty input', () => {
    expect(htmlToPromptText('Just text')).toBe('Just text')
    expect(htmlToPromptText('<p></p>')).toBeNull()
    expect(htmlToPromptText(null)).toBeNull()
  })
})

describe('canonicalJobToHiringRequest', () => {
  const row = {
    id: 'job-1', org_id: 'org_1', title: 'Strategy & Operations Manager', status: 'open', created_at: '2026-07-13',
    description: '<p>At RecruiterStack, Operations means problem-solving at scale.</p>',
    department: { name: 'Operations' },
    custom_fields: {
      scoring_criteria: [{ id: 'a', name: 'A', weight: 100 }],
      intake: {
        level: 'Senior', location: 'Bangalore', work_model: 'onsite', remote_ok: false, headcount: 2,
        budget_min: 3000000, budget_max: 6500000, target_companies: 'Google',
        key_requirements: '<ul><li><p>At least a 2:1 degree</p></li><li><p>Experience in coding with SQL, Python, or R</p></li></ul>',
        team_context: '<ul><li><p>Leading core infrastructure projects</p></li></ul>',
        nice_to_have: '', nice_to_haves: null,
        hm_name: 'Admin', hm_email: 'admin@example.com',
      },
    },
  }

  it('surfaces the HM intake and JD as prompt-ready plain text (previously hardcoded null)', () => {
    const hr = canonicalJobToHiringRequest(row)
    expect(hr.key_requirements).toBe('- At least a 2:1 degree\n- Experience in coding with SQL, Python, or R')
    expect(hr.team_context).toBe('- Leading core infrastructure projects')
    expect(hr.generated_jd).toBe('At RecruiterStack, Operations means problem-solving at scale.')
    expect(hr.level).toBe('Senior')
    expect(hr.location).toBe('Bangalore')
    expect(hr.remote_ok).toBe(false)
    expect(hr.headcount).toBe(2)
    expect(hr.budget_min).toBe(3000000)
    expect(hr.budget_max).toBe(6500000)
    expect(hr.target_companies).toBe('Google')
    expect(hr.nice_to_haves).toBeNull()
    expect(hr.hiring_manager_name).toBe('Admin')
    expect(hr.hiring_manager_email).toBe('admin@example.com')
    expect(hr.scoring_criteria).toEqual([{ id: 'a', name: 'A', weight: 100 }])
  })

  it('joins array-shaped target companies and honours work_model=remote', () => {
    const hr = canonicalJobToHiringRequest({
      ...row,
      custom_fields: { intake: { target_companies: ['Stripe', '', 'Razorpay'], work_model: 'remote' } },
    })
    expect(hr.target_companies).toBe('Stripe, Razorpay')
    expect(hr.remote_ok).toBe(true)
  })

  it('keeps sensible defaults when the job has no intake at all', () => {
    const hr = canonicalJobToHiringRequest({ id: 'j', org_id: 'o', title: 'T', status: 'draft', created_at: null, department: null, custom_fields: null })
    expect(hr.key_requirements).toBeNull()
    expect(hr.generated_jd).toBeNull()
    expect(hr.headcount).toBe(1)
    expect(hr.remote_ok).toBe(false)
    expect(hr.apply_link_token).toBeNull()
  })
})
