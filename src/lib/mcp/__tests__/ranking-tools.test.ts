import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { McpContext } from '../guard'

let ctx: McpContext
vi.mock('../guard', async (orig) => ({
  ...(await orig<typeof import('../guard')>()),
  authorizeCall: vi.fn(async () => ctx),
  recordAudit: vi.fn(async () => {}),
}))
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/jobs/confidential', () => ({
  confidentialFilter: vi.fn(async () => ({ all: true })),
  jobVisible: () => true,
}))

const JOB = '11111111-1111-4111-8111-111111111111'
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const row = (n: number, score: number | null, extra: Record<string, unknown> = {}) => ({
  application_id: `app${n}`, candidate_id: id(n), stage_id: 's1', name: `Person ${n}`, current_title: 'Engineer', current_company: 'Acme',
  ai_score: score, fit_bucket: score == null ? null : 'good', recommendation: score == null ? null : 'yes',
  strengths: ['a', 'b', 'c', 'd'], gaps: ['g'], red_flags: [], gate_failures: [], criterion_scores: [{ name: 'System design', rating: 3 }],
  icp_version: 2, scored_at: null, ...extra,
})
let ROWS = [row(1, 60), row(2, 85), row(3, null), row(4, 72, { icp_version: 1, gate_failures: [{ label: 'Based in Bengaluru' }] }), row(5, null)]
let usedToday = 0

vi.mock('@/modules/ats/domain/agent-reads', () => ({
  getJobForAgent: vi.fn(async (_s: unknown, org: string, jobId: string) => (org === 'org_A' && jobId === JOB ? { id: JOB, title: 'Backend Engineer', confidentiality: null } : null)),
  listFitForAgent: vi.fn(async () => ROWS),
  listStagesForAgent: vi.fn(async () => [{ id: 's1', name: 'Screening', order_index: 1 }]),
  countMcpScoredSince: vi.fn(async () => usedToday),
  averageFitScoringCostUsd: vi.fn(async () => 0.0014),
}))
vi.mock('@/modules/ats/domain/icp', () => ({ getCurrentIcp: vi.fn(async () => ({ status: 'approved', version: 2 })) }))
const scoreSpy = vi.fn(async (_s: unknown, _o: string, appId: string) =>
  appId === 'app5' ? { ok: false as const, status: 500 as const, error: 'boom' } : { ok: true as const, score: 70, recommendation: 'yes', extra: { fit_bucket: 'good' } })
vi.mock('@/lib/ai/score-application', () => ({ scoreOneApplication: (...a: unknown[]) => scoreSpy(...(a as [unknown, string, string])) }))

import { rankCandidates, scoreCandidates } from '../tools/ranking'

type R = { structuredContent?: Record<string, unknown>; isError?: boolean; content: Array<{ text: string }> }
const call = (fn: unknown, args: unknown) => (fn as (a: unknown, c: unknown) => Promise<R>)(args, { http: { authInfo: { token: 't', clientId: 'c', scopes: [] } } })

beforeEach(() => {
  process.env.GEMINI_API_KEY = 'test'
  usedToday = 0
  scoreSpy.mockClear()
  ROWS = [row(1, 60), row(2, 85), row(3, null), row(4, 72, { icp_version: 1, gate_failures: [{ label: 'Based in Bengaluru' }] }), row(5, null)]
  ctx = {
    orgId: 'org_A', userId: 'u1', supabase: {} as never, caller: { userId: 'c1', orgId: 'org_A', clientId: 'c', scopes: [] },
    viewer: { userId: 'u1', role: 'recruiter', isAdmin: false, isHiringManager: false, isOwner: false,
      capabilities: new Set(['recruiting:view', 'recruiting:edit']), employeeId: null, reportIds: new Set(), jobIds: new Set() } as McpContext['viewer'],
  }
})

describe('rank_candidates_for_job', () => {
  it('ranks by score, lists unscored people, flags out-of-date scores, frames as a suggestion', async () => {
    const r = await call(rankCandidates, { job_id: JOB, limit: 10 })
    const d = r.structuredContent!
    const ranked = d.ranked as Array<Record<string, unknown>>
    expect(ranked.map((c) => c.name)).toEqual(['Person 2', 'Person 4', 'Person 1'])
    expect(ranked[1]).toMatchObject({ score_is_out_of_date: true, missed_must_haves: ['Based in Bengaluru'] })
    expect((ranked[0].strengths as string[]).length).toBe(3)
    expect((d.not_yet_scored as unknown[]).length).toBe(2)
    expect(d.next_step).toMatch(/score_candidates_for_job/)
    expect(d.note).toMatch(/person reviews and makes every hiring decision/)
  })
  it('compares only the requested candidates and reports ones not in the job', async () => {
    const stranger = id(99)
    const r = await call(rankCandidates, { job_id: JOB, candidate_ids: [id(1), id(2), stranger], limit: 10 })
    expect((r.structuredContent!.ranked as Array<{ name: string }>).map((c) => c.name)).toEqual(['Person 2', 'Person 1'])
    expect(r.structuredContent!.not_in_this_job).toEqual([stranger])
  })
  it('another workspace\'s job reads as not found', async () => {
    ctx = { ...ctx, orgId: 'org_B' }
    expect((await call(rankCandidates, { job_id: JOB, limit: 10 })).isError).toBe(true)
  })
})

describe('score_candidates_for_job', () => {
  it('scores only unscored candidates, never overwriting existing scores; one failure does not stop the rest', async () => {
    const r = await call(scoreCandidates, { job_id: JOB, max_candidates: 25 })
    const d = r.structuredContent!
    expect(scoreSpy.mock.calls.map((c) => c[2]).sort()).toEqual(['app3', 'app5']) // never app1/app2/app4
    expect((d.scored as unknown[]).length).toBe(1)
    expect((d.failed as Array<{ name: string }>).map((f) => f.name)).toEqual(['Person 5'])
    expect(d).toMatchObject({ already_scored: 3, estimated_cost_usd: 0.0014 })
  })
  it('does nothing (and costs nothing) when everyone is already scored', async () => {
    ROWS = [row(1, 60), row(2, 85)]
    const r = await call(scoreCandidates, { job_id: JOB, max_candidates: 25 })
    expect(scoreSpy).not.toHaveBeenCalled()
    expect(r.structuredContent!.estimated_cost_usd).toBe(0)
  })
  it('respects the daily cap per workspace', async () => {
    usedToday = 200
    const r = await call(scoreCandidates, { job_id: JOB, max_candidates: 25 })
    expect(r.isError).toBe(true)
    expect(r.content[0].text).toMatch(/today's limit of 200/)
    expect(scoreSpy).not.toHaveBeenCalled()
    usedToday = 199
    const partial = await call(scoreCandidates, { job_id: JOB, max_candidates: 25 })
    expect(scoreSpy).toHaveBeenCalledTimes(1)
    expect(partial.structuredContent!.left_unscored_due_to_limits).toBe(1)
  })
})
