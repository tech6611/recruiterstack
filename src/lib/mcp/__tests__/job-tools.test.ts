import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { McpContext } from '../guard'

// The security guard is tested in guard.test.ts — here it just hands us a context.
let ctx: McpContext
vi.mock('../guard', async (orig) => ({
  ...(await orig<typeof import('../guard')>()),
  authorizeCall: vi.fn(async () => ctx),
  recordAudit: vi.fn(async () => {}),
}))
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => ({}) }))

// Fake data layer: two workspaces, one confidential job.
type Job = { id: string; org: string; title: string; status: string; confidentiality: string | null; comp_min: number | null }
const JOBS: Job[] = [
  { id: '11111111-1111-4111-8111-111111111111', org: 'org_A', title: 'Backend Engineer', status: 'open', confidentiality: null, comp_min: 2500000 },
  { id: '22222222-2222-4222-8222-222222222222', org: 'org_A', title: 'Head of Finance', status: 'open', confidentiality: 'confidential', comp_min: 9000000 },
  { id: '33333333-3333-4333-8333-333333333333', org: 'org_B', title: 'Backend Engineer (other company)', status: 'open', confidentiality: null, comp_min: null },
]
const row = (j: Job) => ({ id: j.id, title: j.title, status: j.status, confidentiality: j.confidentiality, location: 'Bengaluru', department: null, description: 'x'.repeat(3000), comp_min: j.comp_min, comp_max: j.comp_min, comp_currency: 'INR', created_at: '2026-11-01' })

vi.mock('@/modules/ats/domain/agent-reads', () => ({
  listJobsForAgent: vi.fn(async (_s: unknown, org: string, o: { query?: string }) =>
    JOBS.filter((j) => j.org === org && (!o.query || j.title.toLowerCase().includes(o.query.toLowerCase()))).map(row)),
  getJobForAgent: vi.fn(async (_s: unknown, org: string, id: string) => {
    const j = JOBS.find((x) => x.id === id && x.org === org)
    return j ? row(j) : null
  }),
  countActiveApplicationsByJob: vi.fn(async () => new Map([[JOBS[0].id, 2]])),
  listStagesForAgent: vi.fn(async () => [
    { id: 's-lead', name: 'New lead', order_index: -3 },
    { id: 's0', name: 'Applied', order_index: 0 },
    { id: 's1', name: 'Screening', order_index: 1 },
  ]),
  listPipelineForAgent: vi.fn(async (_s: unknown, _o: string, _j: string, opts: { stageId?: string } = {}) =>
    Array.from({ length: 60 }, (_, i) => ({
      application_id: `a${i}`, candidate_id: `c${i}`, stage_id: i % 2 ? 's1' : 's0', name: `Person ${i}`,
      current_title: 'Engineer', current_company: 'Acme', location: 'Pune', ai_score: i, fit_bucket: null,
      applied_at: new Date(Date.now() - 3 * 86_400_000).toISOString(), source: 'applied',
    })).filter((p) => !opts.stageId || p.stage_id === opts.stageId)),
}))
vi.mock('@/modules/ats/domain/icp', () => ({
  getCurrentIcp: vi.fn(async () => ({ status: 'approved', must_haves: [{ label: '3+ years backend' }], competencies: [{ name: 'System design', weight: 30, description: 'd' }] })),
}))
// Confidential rule: only admins/owners (or the hiring team, not modelled here) see confidential jobs.
vi.mock('@/lib/jobs/confidential', () => ({
  confidentialFilter: vi.fn(async (_s: unknown, _o: string, v: { isAdmin: boolean; isOwner: boolean }) =>
    v.isAdmin || v.isOwner ? { all: true } : { all: false, allowed: new Set(), confidential: new Set([JOBS[1].id]) }),
  jobVisible: (f: { all: boolean; allowed?: Set<string> }, j: { id: string; confidentiality: string | null }) =>
    f.all || j.confidentiality !== 'confidential' || !!f.allowed?.has(j.id),
}))

import { searchJobs, getJob, getPipeline } from '../tools/jobs'

function makeCtx(orgId: string, viewer: Partial<McpContext['viewer']> = {}): McpContext {
  return {
    orgId, userId: 'u1', supabase: {} as never,
    caller: { userId: 'clerk_1', orgId, clientId: 'c', scopes: [] },
    viewer: { userId: 'u1', role: 'recruiter', isAdmin: false, isHiringManager: false, isOwner: false,
      capabilities: new Set(['recruiting:view']), employeeId: null, reportIds: new Set(), jobIds: new Set(), ...viewer } as McpContext['viewer'],
  }
}
const call = (fn: (a: never, c: never) => Promise<{ structuredContent?: Record<string, unknown>; isError?: boolean; content: Array<{ text: string }> }>, args: unknown) =>
  fn(args as never, { http: { authInfo: { token: 't', clientId: 'c', scopes: [] } } } as never)

beforeEach(() => { ctx = makeCtx('org_A') })

describe('search_jobs', () => {
  it('lists only the workspace\'s visible jobs, with a link and candidate count', async () => {
    const r = await call(searchJobs, { status: 'active', limit: 10 })
    const jobs = r.structuredContent!.jobs as Array<Record<string, unknown>>
    expect(jobs.map((j) => j.title)).toEqual(['Backend Engineer']) // confidential hidden, other org absent
    expect(jobs[0]).toMatchObject({ active_candidates: 2, url: expect.stringContaining(`/req-jobs/${JOBS[0].id}`) })
  })
  it('shows confidential jobs to admins', async () => {
    ctx = makeCtx('org_A', { isAdmin: true })
    const r = await call(searchJobs, { status: 'active', limit: 10 })
    expect((r.structuredContent!.jobs as unknown[]).length).toBe(2)
  })
  it('limited viewers (hiring managers) only see the jobs they are on', async () => {
    ctx = makeCtx('org_A', { capabilities: new Set(), jobIds: new Set() })
    const r = await call(searchJobs, { status: 'active', limit: 10 })
    expect(r.structuredContent!.jobs).toEqual([])
  })
})

describe('get_job', () => {
  it('returns profile, pipeline counts and a capped description; hides pay from non-admins', async () => {
    const r = await call(getJob, { job_id: JOBS[0].id })
    const d = r.structuredContent!
    expect(d.compensation).toBeUndefined()
    expect((d.description as string).length).toBeLessThanOrEqual(1501)
    expect(d.ideal_profile).toMatchObject({ must_haves: ['3+ years backend'] })
    expect(d.pipeline).toEqual([{ stage: 'Applied', candidates: 30 }, { stage: 'Screening', candidates: 30 }]) // empty lead stage omitted
  })
  it('shows pay to admins', async () => {
    ctx = makeCtx('org_A', { isAdmin: true })
    const r = await call(getJob, { job_id: JOBS[0].id })
    expect(r.structuredContent!.compensation).toMatchObject({ min: 2500000, currency: 'INR' })
  })
  it('reports another workspace\'s job and a hidden confidential job as "not found"', async () => {
    for (const id of [JOBS[2].id, JOBS[1].id]) {
      const r = await call(getJob, { job_id: id })
      expect(r.isError).toBe(true)
      expect(r.content[0].text).toMatch(/No job with that ID/)
    }
  })
})

describe('get_pipeline', () => {
  it('pages results (max 50), furthest stage first, with no contact details', async () => {
    const r = await call(getPipeline, { job_id: JOBS[0].id, limit: 50 })
    const d = r.structuredContent!
    const cands = d.candidates as Array<Record<string, unknown>>
    expect(cands).toHaveLength(50)
    expect(d.total_active).toBe(60)
    expect(d.next_cursor).toBe(50)
    expect(cands[0].stage).toBe('Screening')
    expect(cands[0]).not.toHaveProperty('email')
    expect(cands[0]).not.toHaveProperty('phone')
    expect(cands[0].days_since_applied).toBe(3)
  })
  it('filters by stage name and explains unknown stages', async () => {
    const ok = await call(getPipeline, { job_id: JOBS[0].id, stage: 'screening', limit: 25 })
    expect((ok.structuredContent!.candidates as Array<{ stage: string }>).every((c) => c.stage === 'Screening')).toBe(true)
    const bad = await call(getPipeline, { job_id: JOBS[0].id, stage: 'Onsite', limit: 25 })
    expect(bad.isError).toBe(true)
    expect(bad.content[0].text).toMatch(/Applied, Screening/)
  })
  it('cannot read another workspace\'s pipeline', async () => {
    const r = await call(getPipeline, { job_id: JOBS[2].id, limit: 25 })
    expect(r.isError).toBe(true)
  })
})
