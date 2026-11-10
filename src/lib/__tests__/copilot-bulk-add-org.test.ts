import { describe, it, expect, vi, beforeEach } from 'vitest'

// bulk_add_to_pipeline runs on the admin client (RLS bypassed), so it must refuse
// jobs and candidates from other workspaces before writing anything.

const JOB_A = '11111111-1111-4111-8111-111111111111'
const JOB_B = '22222222-2222-4222-8222-222222222222'
const CAND_A1 = 'aaaaaaa1-0000-4000-8000-000000000001'
const CAND_A2 = 'aaaaaaa2-0000-4000-8000-000000000002'
const CAND_B = 'bbbbbbb1-0000-4000-8000-000000000001'

const { insertSpy } = vi.hoisted(() => ({
  insertSpy: vi.fn(async (_s: unknown, _o: string, input: { candidateId: string }) => ({ data: { id: `app-${input.candidateId}` }, error: null })),
}))

vi.mock('@/modules/ats/domain/job-pipelines', async (orig) => ({
  ...(await orig<typeof import('@/modules/ats/domain/job-pipelines')>()),
  getCanonicalJobById: vi.fn(async (_s: unknown, orgId: string, id: string) =>
    orgId === 'org_A' && id === JOB_A ? { id: JOB_A, org_id: 'org_A', title: 'Backend Engineer' } : null),
  getFirstLeadStage: vi.fn(async () => ({ stage: { id: 'stage-lead', name: 'New lead' }, lifecycle: 'lead' })),
}))
vi.mock('@/modules/ats/domain/candidates', async (orig) => ({
  ...(await orig<typeof import('@/modules/ats/domain/candidates')>()),
  filterCandidateIdsForOrg: vi.fn(async (_s: unknown, orgId: string, ids: string[]) =>
    new Set(ids.filter((id) => orgId === 'org_A' && id.startsWith('aaaaaaa')))),
}))
vi.mock('@/modules/ats/domain/applications', async (orig) => ({
  ...(await orig<typeof import('@/modules/ats/domain/applications')>()),
  listExistingApplicationCandidateIds: vi.fn(async () => []),
  insertPipelineApplication: insertSpy,
}))

import { executeTool } from '@/lib/copilot-tools'

// Chainable Supabase stub for the timeline insert.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const chain: any = new Proxy(() => {}, {
  get: (_t, prop) => (prop === 'then' ? (resolve: (v: unknown) => void) => resolve({ data: null, error: null }) : () => chain),
})
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = { from: () => chain } as any

const add = (orgId: string, job_id: string, candidate_ids: string[]) =>
  executeTool('bulk_add_to_pipeline', { job_id, candidate_ids }, orgId, supabase)

beforeEach(() => { insertSpy.mockClear() })

describe('bulk_add_to_pipeline workspace checks', () => {
  it('adds only candidates from this workspace and reports the rest as ignored', async () => {
    const r = await add('org_A', JOB_A, [CAND_A1, CAND_B, CAND_A2])
    expect(insertSpy).toHaveBeenCalledTimes(2)
    expect(insertSpy.mock.calls.map((c) => c[2].candidateId)).toEqual([CAND_A1, CAND_A2])
    expect(r).toMatch(/Added 2 application/)
    expect(r).toMatch(/1 ID\(s\) were not found in this workspace/)
  })

  it('refuses a job from another workspace without writing anything', async () => {
    const r = await add('org_A', JOB_B, [CAND_A1])
    expect(r).toMatch(/no job with that ID/)
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it('writes nothing when every candidate is from another workspace', async () => {
    const r = await add('org_A', JOB_A, [CAND_B])
    expect(r).toMatch(/none of the 1 candidate ID\(s\) were found/)
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it('a different workspace cannot use org A\'s job', async () => {
    const r = await add('org_B', JOB_A, [CAND_B])
    expect(r).toMatch(/no job with that ID/)
    expect(insertSpy).not.toHaveBeenCalled()
  })
})
