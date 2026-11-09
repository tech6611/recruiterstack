import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { McpContext } from '../guard'

// ── Part 1: domain safety rules (agent-writes.ts) against a tiny fake database ──
vi.mock('@/modules/ats/domain/job-pipelines', () => ({
  getFirstLeadStage: vi.fn(async () => ({ stage: { id: 'lead1', name: 'New lead' }, lifecycle: 'lead' })),
}))
vi.mock('@/modules/ats/domain/applications', () => ({
  insertPipelineApplication: vi.fn(async (_s: unknown, _o: string, i: { candidateId: string }) => ({ data: { id: `app-${i.candidateId}` }, error: null })),
  listExistingApplicationCandidateIds: vi.fn(async (_s: unknown, _o: string, _j: string, ids: string[]) => ({ data: ids.filter((i) => i === 'c-dup').map((i) => ({ candidate_id: i })) }).data),
}))

type Rows = Record<string, Array<Record<string, unknown>>>
function fakeDb(rows: Rows) {
  const writes: Array<{ table: string; op: string; value: unknown }> = []
  const from = (table: string) => {
    const filters: Array<[string, unknown, 'eq' | 'in']> = []
    const q: Record<string, unknown> = {}
    const run = () => (rows[table] ?? []).filter((r) => filters.every(([k, v, op]) => (op === 'in' ? (v as unknown[]).includes(r[k]) : r[k] === v)))
    q.select = () => q
    q.order = () => q
    q.eq = (k: string, v: unknown) => { filters.push([k, v, 'eq']); return q }
    q.in = (k: string, v: unknown[]) => { filters.push([k, v, 'in']); return q }
    q.maybeSingle = async () => ({ data: run()[0] ?? null, error: null })
    q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: run(), error: null }).then(res)
    q.insert = async (value: unknown) => { writes.push({ table, op: 'insert', value }); return { error: null } }
    q.update = (value: unknown) => { writes.push({ table, op: 'update', value }); return { eq: () => ({ eq: async () => ({ error: null }) }) } }
    return q
  }
  return { client: { from } as never, writes }
}

import { resolveAgentTargetStage, addCandidatesToJobForAgent, moveApplicationForAgent, addNoteForAgent } from '@/modules/ats/domain/agent-writes'

const STAGES = [
  { id: 'lead1', org_id: 'org_A', job_id: 'J', name: 'New lead', zone: 'lead', order_index: -3 },
  { id: 's0', org_id: 'org_A', job_id: 'J', name: 'Applied', zone: 'application_review', order_index: 0 },
  { id: 's1', org_id: 'org_A', job_id: 'J', name: 'Screening', zone: 'active', order_index: 1 },
  { id: 's2', org_id: 'org_A', job_id: 'J', name: 'Phone Screen', zone: 'active', order_index: 2 },
  { id: 's4', org_id: 'org_A', job_id: 'J', name: 'Offer', zone: 'offer', order_index: 4 },
  { id: 's5', org_id: 'org_A', job_id: 'J', name: 'Hired', zone: 'completed', order_index: 5 },
  { id: 's6', org_id: 'org_A', job_id: 'J', name: 'Archived', zone: 'completed', order_index: 6 },
]
const actor = { label: 'AI assistant (Claude)' }

describe('agent-writes safety rules', () => {
  it('refuses Offer, Hired and Archived as hiring decisions', async () => {
    const { client } = fakeDb({ pipeline_stages: STAGES })
    for (const name of ['Offer', 'hired', 'Archived']) {
      const r = await resolveAgentTargetStage(client, 'org_A', 'J', name)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toMatch(/hiring decision.*Applied, Screening, Phone Screen/)
    }
  })
  it('refuses a stage with an AUTOMATIC rule, but allows suggest-only rules', async () => {
    const auto = fakeDb({ pipeline_stages: STAGES, pipeline_automations: [{ org_id: 'org_A', stage_id: 's2', enabled: true, mode: 'auto', action_type: 'ai_call' }] })
    const r = await resolveAgentTargetStage(auto.client, 'org_A', 'J', 'Phone Screen')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/places an AI phone call.*surprise/)
    const suggest = fakeDb({ pipeline_stages: STAGES, pipeline_automations: [{ org_id: 'org_A', stage_id: 's2', enabled: true, mode: 'suggest', action_type: 'ai_call' }] })
    expect((await resolveAgentTargetStage(suggest.client, 'org_A', 'J', 'phone screen')).ok).toBe(true)
  })
  it('add: rejects candidates from other workspaces, skips duplicates, labels the timeline', async () => {
    const { client, writes } = fakeDb({ candidates: [{ id: 'c1', org_id: 'org_A' }, { id: 'c-dup', org_id: 'org_A' }, { id: 'c-other', org_id: 'org_B' }] })
    const r = await addCandidatesToJobForAgent(client, 'org_A', 'J', ['c1', 'c-dup', 'c-other'], actor)
    expect(r.added.map((a) => a.candidate_id)).toEqual(['c1'])
    expect(r.already_on_job).toEqual(['c-dup'])
    expect(r.not_found).toEqual(['c-other'])
    expect(writes.find((w) => w.table === 'application_events')?.value).toMatchObject({ created_by: 'AI assistant (Claude)' })
  })
  it('add: refused when the entry stage has an automatic rule (e.g. auto-enrol in emails)', async () => {
    const { client, writes } = fakeDb({ candidates: [{ id: 'c1', org_id: 'org_A' }], pipeline_automations: [{ org_id: 'org_A', stage_id: 'lead1', enabled: true, mode: 'auto', action_type: 'enrol_outreach' }] })
    const r = await addCandidatesToJobForAgent(client, 'org_A', 'J', ['c1'], actor)
    expect(r.blocked_by_automation).toMatch(/email sequence/)
    expect(writes).toHaveLength(0)
  })
  it('move: only applications on that job, in the org, and active', async () => {
    const { client } = fakeDb({ applications: [
      { id: 'a1', org_id: 'org_A', job_id: 'J', status: 'active', stage_id: 's0', lifecycle: 'active', stage: { name: 'Applied' }, candidate: { name: 'Priya' } },
      { id: 'a2', org_id: 'org_A', job_id: 'OTHER', status: 'active', stage_id: 's0' },
      { id: 'a3', org_id: 'org_A', job_id: 'J', status: 'rejected', stage_id: 's0' },
      { id: 'a4', org_id: 'org_B', job_id: 'J', status: 'active', stage_id: 's0' },
    ] })
    const stage = { id: 's1', name: 'Screening', zone: 'active' }
    expect(await moveApplicationForAgent(client, 'org_A', 'J', 'a1', stage, null, actor)).toMatchObject({ ok: true, from: 'Applied', to: 'Screening' })
    for (const id of ['a2', 'a3', 'a4']) expect((await moveApplicationForAgent(client, 'org_A', 'J', id, stage, null, actor)).ok).toBe(false)
  })
  it('note: only for applications in the org, labelled with the AI app', async () => {
    const { client, writes } = fakeDb({ applications: [{ id: 'a1', org_id: 'org_A', candidate: { name: 'Priya' }, job: { title: 'BE' } }] })
    expect(await addNoteForAgent(client, 'org_B', 'a1', 'hi', actor)).toBeNull()
    expect(await addNoteForAgent(client, 'org_A', 'a1', 'Strong Go background', actor)).toMatchObject({ candidate: 'Priya' })
    expect(writes[0].value).toMatchObject({ event_type: 'note_added', note: expect.stringContaining('— added by AI assistant (Claude)') })
  })
})

// ── Part 2: tool behaviour (find_new_candidates_for_job budget + gating) ──
let ctx: McpContext
vi.mock('../guard', async (orig) => ({ ...(await orig<typeof import('../guard')>()), authorizeCall: vi.fn(async () => ctx), recordAudit: vi.fn(async () => {}) }))
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/jobs/confidential', () => ({ confidentialFilter: vi.fn(async () => ({ all: true })), jobVisible: () => true }))
vi.mock('@/modules/ats/domain/agent-reads', () => ({
  getJobForAgent: vi.fn(async (_s: unknown, org: string) => (org === 'org_A' ? { id: '11111111-1111-4111-8111-111111111111', title: 'Backend Engineer', confidentiality: null } : null)),
}))
let icpStatus = 'approved'
vi.mock('@/modules/ats/domain/icp', () => ({ getCurrentIcp: vi.fn(async () => ({ status: icpStatus, version: 1, must_haves: [] })) }))
const findSpy = vi.fn(async (_s: unknown, _o: string, _u: string, _j: unknown, _i: unknown, count: number) => ({
  ok: true as const, creditsUsed: count * 0.03, fetched: count, unmapped: [],
  matches: [{ profile_id: 'p1', name: 'A', current_title: 'BE', current_company: 'X', location: 'Blr', experience_years: 4, score: 55, fit_bucket: 'okay', rationale: 'r', gate_failures: [], reachable: true },
            { profile_id: 'p2', name: 'B', current_title: 'SBE', current_company: 'Y', location: 'Blr', experience_years: 7, score: 80, fit_bucket: 'great', rationale: 'r', gate_failures: [], reachable: true }],
}))
vi.mock('../sourcing', () => ({ findNewCandidates: (...a: unknown[]) => findSpy(...(a as Parameters<typeof findSpy>)), unlockProfiles: vi.fn() }))
let creditsUsedToday = 0
vi.mock('@/modules/ats/domain/agent-writes', async (orig) => ({ ...(await orig<typeof import('@/modules/ats/domain/agent-writes')>()), sourcingCreditsSince: vi.fn(async () => creditsUsedToday) }))

import { findNewCandidatesForJob, actorFor } from '../tools/actions'

type R = { structuredContent?: Record<string, unknown>; isError?: boolean; content: Array<{ text: string }> }
const call = (args: unknown) => (findNewCandidatesForJob as unknown as (a: unknown, c: unknown) => Promise<R>)(args, { http: { authInfo: { token: 't', clientId: 'c', scopes: [] } } })
const JOB = '11111111-1111-4111-8111-111111111111'

describe('find_new_candidates_for_job', () => {
  beforeEach(() => {
    findSpy.mockClear(); creditsUsedToday = 0; icpStatus = 'approved'
    ctx = { orgId: 'org_A', userId: 'u1', supabase: {} as never, caller: { userId: 'c1', orgId: 'org_A', clientId: 'https://claude.ai/oauth/x', scopes: [] },
      viewer: { role: 'recruiter', isAdmin: false, isOwner: false, capabilities: new Set(['recruiting:view', 'recruiting:edit']), jobIds: new Set() } as unknown as McpContext['viewer'] }
  })
  it('returns proposals best-first with credits used and left; nobody is added', async () => {
    const r = await call({ job_id: JOB, count: 5 })
    const d = r.structuredContent!
    expect((d.proposals as Array<{ profile_id: string }>).map((p) => p.profile_id)).toEqual(['p2', 'p1'])
    expect(d).toMatchObject({ credits_used: 0.15, credits_left_today: 1.85, next_step: expect.stringMatching(/proposals only/) })
  })
  it('needs an approved ideal profile and spends nothing otherwise', async () => {
    icpStatus = 'draft'
    expect((await call({ job_id: JOB, count: 5 })).isError).toBe(true)
    expect(findSpy).not.toHaveBeenCalled()
  })
  it('enforces the daily credit allowance: shrinks the request, then refuses', async () => {
    creditsUsedToday = 1.95 // 0.05 left → 1 person
    const r = await call({ job_id: JOB, count: 5 })
    expect(findSpy.mock.calls[0][5]).toBe(1)
    expect(r.structuredContent).toMatchObject({ reduced_to: 1 })
    creditsUsedToday = 2
    findSpy.mockClear()
    const none = await call({ job_id: JOB, count: 5 })
    expect(none.isError).toBe(true)
    expect(findSpy).not.toHaveBeenCalled()
  })
  it('labels the acting AI app from its client id', () => {
    expect(actorFor(ctx).label).toBe('AI assistant (Claude)')
    expect(actorFor({ ...ctx, caller: { ...ctx.caller, clientId: 'https://chatgpt.com/oauth/client.json' } }).label).toBe('AI assistant (ChatGPT)')
  })
})

describe('sourcingCreditsSince (exact spend, not the rounded-up column)', () => {
  it('sums per-step fractional credits, falling back to credits_used', async () => {
    const { sourcingCreditsSince } = await vi.importActual<typeof import('@/modules/ats/domain/agent-writes')>('@/modules/ats/domain/agent-writes')
    const rows = [{ credits_used: 1, query: { results: [{ creditsUsed: 0.03 }, { creditsUsed: 0.06 }] } }, { credits_used: 2, query: null }]
    const q: Record<string, unknown> = {}
    q.select = () => q; q.eq = () => q; q.gte = async () => ({ data: rows, error: null })
    expect(await sourcingCreditsSince({ from: () => q } as never, 'org_A', '2026-01-01')).toBe(2.09)
  })
})
