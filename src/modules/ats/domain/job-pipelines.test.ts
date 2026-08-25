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
