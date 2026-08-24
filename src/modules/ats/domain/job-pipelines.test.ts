import { describe, it, expect } from 'vitest'
import { getFirstLeadStage } from './job-pipelines'

// Minimal Supabase stub: every query for pipeline_stages resolves to `rows`.
// getFirstLeadStage and its getFirstJobStage fallback both end in
// .order('order_index'), which we resolve directly.
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

const NEW_LEAD = { id: 'lead-1', name: 'New lead', order_index: -3, zone: 'lead' }
const REACHED = { id: 'lead-2', name: 'Reached out', order_index: -2, zone: 'lead' }
const APPLIED = { id: 'act-1', name: 'Applied', order_index: 0, zone: 'active' }
const SCREEN = { id: 'act-2', name: 'CV Screening', order_index: 1, zone: 'active' }

describe('getFirstLeadStage', () => {
  it('routes a sourced candidacy to the first lead stage with lifecycle "lead"', async () => {
    const sb = mockSb([NEW_LEAD, REACHED, APPLIED, SCREEN])
    const res = await getFirstLeadStage(sb, 'org_1', 'job_1')
    expect(res.lifecycle).toBe('lead')
    expect(res.stage).toEqual({ id: 'lead-1', name: 'New lead' })
  })

  it('falls back to the first active stage (lifecycle "active") when the job has no lead zone', async () => {
    const sb = mockSb([APPLIED, SCREEN])
    const res = await getFirstLeadStage(sb, 'org_1', 'job_1')
    expect(res.lifecycle).toBe('active')
    expect(res.stage).toEqual({ id: 'act-1', name: 'Applied' })
  })

  it('returns a null stage (lifecycle "active") when the job has no stages at all', async () => {
    const sb = mockSb([])
    const res = await getFirstLeadStage(sb, 'org_1', 'job_1')
    expect(res.lifecycle).toBe('active')
    expect(res.stage).toBeNull()
  })
})
