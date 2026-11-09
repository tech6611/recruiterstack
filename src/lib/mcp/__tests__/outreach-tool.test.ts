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
  confidentialFilter: vi.fn(async () => ({ all: false, allowed: new Set(), confidential: new Set() })),
  jobVisible: (_f: unknown, j: { confidentiality: string | null }) => j.confidentiality !== 'confidential',
}))

const JOB = '11111111-1111-4111-8111-111111111111'
const SECRET = '22222222-2222-4222-8222-222222222222'
const CAND = '44444444-4444-4444-8444-444444444444'
vi.mock('@/modules/ats/domain/agent-reads', () => ({
  getJobForAgent: vi.fn(async (_s: unknown, org: string, id: string) =>
    org !== 'org_A' ? null : id === JOB ? { id: JOB, title: 'Backend Engineer', confidentiality: null } : id === SECRET ? { id: SECRET, title: 'Head of Finance', confidentiality: 'confidential' } : null),
  getCandidateDetailForMcp: vi.fn(async (_s: unknown, _o: string, id: string) => (id !== CAND ? null : {
    id: CAND, name: 'Aarav Mehta', current_title: 'Senior Backend Engineer', current_company: 'Kestrel',
    applications: [{ job_id: JOB, job_confidentiality: null }],
  })),
  listFitForAgent: vi.fn(async () => [{ candidate_id: CAND, strengths: ['Owns a 40k req/min payouts API'], criterion_scores: [{ evidence: 'Led monolith → Go services' }] }]),
  getOutreachNames: vi.fn(async () => ({ companyName: 'Northwind Labs', recruiterName: 'Tech Team' })),
}))
const draftSpy = vi.fn(async () => ({ subject: 'Backend role at Northwind', body: 'Hi Aarav, …' }))
vi.mock('@/lib/ai/outreach-draft', () => ({ draftOutreachIntro: (...a: unknown[]) => (draftSpy as (...x: unknown[]) => unknown)(...a) }))

import { draftCandidateOutreach } from '../tools/outreach'

type R = { structuredContent?: Record<string, unknown>; isError?: boolean; content: Array<{ text: string }> }
const call = (args: unknown) => (draftCandidateOutreach as unknown as (a: unknown, c: unknown) => Promise<R>)(args, { http: { authInfo: { token: 't', clientId: 'c', scopes: [] } } })

beforeEach(() => {
  process.env.GEMINI_API_KEY = 'test'
  draftSpy.mockClear()
  ctx = {
    orgId: 'org_A', userId: 'u1', supabase: {} as never, caller: { userId: 'c1', orgId: 'org_A', clientId: 'c', scopes: [] },
    viewer: { userId: 'u1', role: 'recruiter', isAdmin: false, isHiringManager: false, isOwner: false,
      capabilities: new Set(['recruiting:view']), employeeId: null, reportIds: new Set(), jobIds: new Set() } as McpContext['viewer'],
  }
})

describe('draft_candidate_outreach', () => {
  it('returns a draft personalised from the fit assessment, and says nothing was sent', async () => {
    const r = await call({ candidate_id: CAND, job_id: JOB, channel: 'email', tone: 'warm' })
    expect(r.structuredContent).toMatchObject({ subject: 'Backend role at Northwind', note: expect.stringMatching(/nothing was sent or saved/) })
    expect(draftSpy).toHaveBeenCalledWith(
      expect.objectContaining({ first_name: 'Aarav', company_name: 'Northwind Labs', recruiter_name: 'Tech Team',
        evidence: ['Owns a 40k req/min payouts API', 'Led monolith → Go services'], channel: 'email' }),
      expect.anything(),
    )
  })
  it('LinkedIn drafts have no subject line', async () => {
    const r = await call({ candidate_id: CAND, job_id: JOB, channel: 'linkedin', tone: 'direct' })
    expect(r.structuredContent!.subject).toBeNull()
  })
  it('refuses hidden confidential jobs, other workspaces and unknown candidates — without calling the AI', async () => {
    expect((await call({ candidate_id: CAND, job_id: SECRET, channel: 'email', tone: 'warm' })).isError).toBe(true)
    expect((await call({ candidate_id: '55555555-5555-4555-8555-555555555555', job_id: JOB, channel: 'email', tone: 'warm' })).isError).toBe(true)
    ctx = { ...ctx, orgId: 'org_B' }
    expect((await call({ candidate_id: CAND, job_id: JOB, channel: 'email', tone: 'warm' })).isError).toBe(true)
    expect(draftSpy).not.toHaveBeenCalled()
  })
})
