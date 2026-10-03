import { describe, it, expect, vi } from 'vitest'
import { nextBetSample, betFingerprint, BATCH, type SampleStore, type SearchRow, type PageResult } from './bet-sample'
import type { BetSamplePerson } from './bet-sample-fit'
import type { SearchCriterion } from '@/lib/types/search-spec'

const consulting = (companies: string[]): SearchCriterion[] => [
  { id: 'ip-bet-1-companies', kind: 'employer_current', values: companies, bet: 1 },
  { id: 'ip-bet-1-titles', kind: 'title_current', values: ['Business Analyst', 'Associate', 'Consultant'], bet: 1 },
  { id: 'ip-location', kind: 'location', values: ['Bengaluru, Karnataka, IN'], radius_km: 50 },
  { id: 'ip-years', kind: 'years_band', values: [], min: 2, max: 6 },
]
const person = (id: string, company = 'Boston Consulting Group'): BetSamplePerson => ({
  id, display_name: id, current_title: 'Associate', current_company: company, location_raw: 'Bengaluru', location_city: 'Bengaluru',
  location_region: 'Karnataka', location_country_code: 'IN', experience_years: 4, education: [], reachable: true,
})

/** An in-memory database, and a pretend market that serves `people` a page at a time. */
function harness(people: BetSamplePerson[], opts: { spent?: number; total?: number } = {}) {
  const searches = new Map<string, SearchRow>()
  const decided = new Map<string, 'yes' | 'no'>()
  let spent = opts.spent ?? 0
  const store: SampleStore = {
    async decided() { return { ids: new Set(decided.keys()), yes: Array.from(decided.values()).filter((d) => d === 'yes').length, no: Array.from(decided.values()).filter((d) => d === 'no').length } },
    async loadSearch(fp) { return searches.get(fp) ?? null },
    async saveSearch(row) { searches.set(row.fingerprint, row) },
    async spentLast24h() { return spent },
    async logSpend(c) { spent += c },
    async loadPeople(ids) { return people.filter((p) => ids.includes(p.id)) },
  }
  const fetchPage = vi.fn(async (_filters: unknown, cursor: string | null): Promise<PageResult> => {
    const start = cursor ? Number(cursor) : 0
    const page = people.slice(start, start + BATCH)
    const next = start + BATCH < people.length ? String(start + BATCH) : null
    return { profileIds: page.map((p) => p.id), nextCursor: next, total: opts.total ?? people.length, credits: page.length * 0.03 }
  })
  return { store, fetchPage, decided, searches, spent: () => spent }
}

describe('live sample person per bet', () => {
  it('searches the market with exactly this bet\'s lines — BCG only means BCG only', async () => {
    const h = harness([person('a'), person('b')])
    await nextBetSample(h.store, h.fetchPage, consulting(['BCG']))
    const filters = JSON.stringify(h.fetchPage.mock.calls[0][0])
    expect(filters).toContain('BCG')
    expect(filters).not.toContain('McKinsey')
    expect(filters).toContain('Bengaluru')
    expect(filters).toContain('years_of_experience_raw')
  })

  it('fetches one page, shows the first person, and says how many match and what it cost', async () => {
    const h = harness([person('a'), person('b'), person('c'), person('d')], { total: 37 })
    const r = await nextBetSample(h.store, h.fetchPage, consulting(['BCG']))
    expect(r.person?.id).toBe('a')
    expect(r.remaining).toBe(2)
    expect(r.total).toBe(37)
    expect(r.spent).toBeCloseTo(0.09)
    expect(h.fetchPage).toHaveBeenCalledTimes(1)
  })

  it('never pays twice for the same lines — a reload, or the same lines in another order', async () => {
    const h = harness([person('a'), person('b'), person('c'), person('d')])
    await nextBetSample(h.store, h.fetchPage, consulting(['BCG', 'Bain']))
    const again = await nextBetSample(h.store, h.fetchPage, [...consulting(['Bain', 'BCG'])].reverse().map((c) => ({ ...c, id: `${c.id}-x`, label: 'renamed' })))
    expect(again.person?.id).toBe('a')
    expect(h.fetchPage).toHaveBeenCalledTimes(1)
    expect(betFingerprint(consulting(['BCG', 'Bain']))).toBe(betFingerprint(consulting(['bain', 'BCG'])))
  })

  it('moves through the fetched page, then fetches the next page from where it stopped', async () => {
    const h = harness([person('a'), person('b'), person('c'), person('d')])
    const lines = consulting(['BCG'])
    await nextBetSample(h.store, h.fetchPage, lines)
    expect((await nextBetSample(h.store, h.fetchPage, lines, ['a'])).person?.id).toBe('b')
    h.decided.set('b', 'no')
    expect((await nextBetSample(h.store, h.fetchPage, lines, ['a'])).person?.id).toBe('c')
    expect(h.fetchPage).toHaveBeenCalledTimes(1)
    const next = await nextBetSample(h.store, h.fetchPage, lines, ['a', 'c'])
    expect(next.person?.id).toBe('d')
    expect(h.fetchPage).toHaveBeenCalledTimes(2)
    expect(h.fetchPage.mock.calls[1][1]).toBe('3')
  })

  it('changing a line is a new search', async () => {
    const h = harness([person('a')])
    await nextBetSample(h.store, h.fetchPage, consulting(['BCG']))
    await nextBetSample(h.store, h.fetchPage, consulting(['BCG', 'EY-Parthenon']))
    expect(h.fetchPage).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(h.fetchPage.mock.calls[1][0])).toContain('EY-Parthenon')
  })

  it('stops at the daily cap and spends nothing more', async () => {
    const h = harness([person('a')], { spent: 5 })
    const r = await nextBetSample(h.store, h.fetchPage, consulting(['BCG']))
    expect(r.reason).toBe('cap')
    expect(h.fetchPage).not.toHaveBeenCalled()
  })

  it('says when nobody matches, when everyone has been seen, and when the market is down', async () => {
    const none = harness([], { total: 0 })
    expect((await nextBetSample(none.store, none.fetchPage, consulting(['BCG']))).reason).toBe('none')
    const one = harness([person('a')])
    await nextBetSample(one.store, one.fetchPage, consulting(['BCG']))
    one.decided.set('a', 'yes')
    expect((await nextBetSample(one.store, one.fetchPage, consulting(['BCG']))).reason).toBe('all_seen')
    const down = harness([person('a')])
    down.fetchPage.mockRejectedValueOnce(new Error('Market sourcing is not enabled'))
    expect(await nextBetSample(down.store, down.fetchPage, consulting(['BCG']))).toMatchObject({ reason: 'unavailable', message: 'Market sourcing is not enabled' })
  })

  it('a bet with no companies is never searched', async () => {
    const h = harness([person('a')])
    expect((await nextBetSample(h.store, h.fetchPage, consulting([]).slice(1))).reason).toBe('no_companies')
    expect(h.fetchPage).not.toHaveBeenCalled()
  })
})
