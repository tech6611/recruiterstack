import { describe, it, expect, vi, beforeEach } from 'vitest'
// ── Reusing cached Fit-Engine scores after a fast Crustdata run ────────────────
vi.mock('@/lib/ai/llm', () => ({ embedText: vi.fn(async () => [0.1]), embedTexts: vi.fn(async () => []) }))
vi.mock('@/lib/ai/embeddings', () => ({ icpEmbeddingText: () => 'icp', candidateEmbeddingText: () => 'x' }))
vi.mock('@/modules/pool/domain/pool', () => ({ getPoolAccess: vi.fn(async () => ({ hasAccess: true })) }))
vi.mock('@/lib/ai/fit-engine', () => ({
  scoreAgainstIcp: vi.fn(async () => ({ score: 77, fit_bucket: 'good', rationale: 'fresh', gate_failures: [], gate_unknown: [], competencies: [], red_flags: [], gate_results: [] })),
}))

import { scoreAgainstIcp } from '@/lib/ai/fit-engine'
import { sourcePoolForIcp, pendingPoolMatches, type PoolMatch } from './pool-sourcing'
import type { Icp } from '@/lib/types/icp'

/** A chainable Supabase stand-in: every query on a table resolves to that table's rows. */
function fakeSb(tables: Record<string, unknown>) {
  const builder = (table: string) => {
    const b: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'in', 'order']) b[m] = () => b
    b.maybeSingle = async () => ({ data: tables[table] ?? null })
    b.then = (res: (v: unknown) => unknown) => res({ data: tables[table] ?? [] })
    return b
  }
  return { from: builder, rpc: async () => ({ data: [], error: null }) } as unknown as Parameters<typeof sourcePoolForIcp>[0]
}

const profile = (id: string) => ({ id, display_name: id.toUpperCase(), current_title: 'EM', current_company: 'Acme', location_raw: null, skills: [], experience_years: 8, reachable: true })
const cached = (id: string, score: number) => ({ profile_id: id, name: id, score, fit_bucket: 'great', rationale: 'cached', gate_failures: [], competencies: [], red_flags: [] }) as unknown as PoolMatch
const icp = { version: 3, must_haves: [], competencies: [] } as unknown as Icp

describe('sourcePoolForIcp reuseFrom', () => {
  beforeEach(() => vi.mocked(scoreAgainstIcp).mockClear())

  it('keeps cached scores and only judges the new (or re-ingested) people', async () => {
    const sb = fakeSb({
      pool_profiles: [profile('old'), profile('new'), profile('merged')],
      pool_sourcing_matches: { icp_version: 3, matches: [cached('old', 91), cached('merged', 40)] },
    })
    const out = await sourcePoolForIcp(sb, 'org', icp, {}, {
      includeIds: ['old', 'new', 'merged'],
      reuseFrom: { jobId: 'job', icpVersion: 3, rescoreIds: ['new', 'merged'] },
    })
    expect(scoreAgainstIcp).toHaveBeenCalledTimes(2)
    const byId = Object.fromEntries(out.matches.map((m) => [m.profile_id, m]))
    expect(byId.old.score).toBe(91)
    expect(byId.old.rationale).toBe('cached')
    expect(byId.new.score).toBe(77)
    expect(byId.merged.score).toBe(77)
  })

  it('re-judges everyone when the cache was scored under another ICP version', async () => {
    const sb = fakeSb({
      pool_profiles: [profile('old')],
      pool_sourcing_matches: { icp_version: 2, matches: [cached('old', 91)] },
    })
    const out = await sourcePoolForIcp(sb, 'org', icp, {}, { includeIds: ['old'], reuseFrom: { jobId: 'job', icpVersion: 3 } })
    expect(scoreAgainstIcp).toHaveBeenCalledTimes(1)
    expect(out.matches[0].score).toBe(77)
  })

  it('re-judges everyone without reuseFrom (the Re-rank button)', async () => {
    const sb = fakeSb({
      pool_profiles: [profile('old')],
      pool_sourcing_matches: { icp_version: 3, matches: [cached('old', 91)] },
    })
    await sourcePoolForIcp(sb, 'org', icp, {}, { includeIds: ['old'] })
    expect(scoreAgainstIcp).toHaveBeenCalledTimes(1)
  })
})

describe('pendingPoolMatches', () => {
  it('returns unscored rows marked pending, lowest ladder level first', async () => {
    const sb = fakeSb({ pool_profiles: [profile('b'), profile('a')], pool_identities: [{ profile_id: 'a', source_key: 'vendor:crustdata' }] })
    const out = await pendingPoolMatches(sb, ['a', 'b'], { a: { level: 1, label: 'L1' }, b: { level: 2, label: 'L2' } })
    expect(out.map((m) => m.profile_id)).toEqual(['a', 'b'])
    expect(out.every((m) => m.pending)).toBe(true)
    expect(out[0].sources).toEqual(['vendor:crustdata'])
  })
})
