import { describe, it, expect } from 'vitest'
import { assembleHeadcountReport, lastMonths } from './headcount-reporting'

const now = new Date('2026-09-16T00:00:00Z')
const o = (p: Partial<Parameters<typeof assembleHeadcountReport>[0]['openings'][number]> & { id: string; status: string }) => ({
  title: p.id, number: null, department_id: null, created_at: '2026-06-01T00:00:00Z', opened_at: null, filled_at: null, closed_at: null, target_start_date: null, ...p,
})

describe('assembleHeadcountReport', () => {
  it('counts seats, monthly flow, and time-to-fill from approval to hire', () => {
    const r = assembleHeadcountReport({
      openings: [
        o({ id: 'a', status: 'filled', department_id: 'd1', opened_at: '2026-07-02T00:00:00Z', filled_at: '2026-08-10T00:00:00Z', target_start_date: '2026-09-01' }),
        o({ id: 'b', status: 'open',   department_id: 'd1', opened_at: '2026-06-20T00:00:00Z' }),
        o({ id: 'c', status: 'closed', closed_at: '2026-08-01T00:00:00Z' }),
        o({ id: 'd', status: 'archived' }),
        o({ id: 'e', status: 'draft' }),
      ],
      approvedAt: new Map([['a', '2026-07-01T00:00:00Z']]),
      departments: new Map([['d1', 'Engineering']]),
      jobs: [{ id: 'j1', title: 'EM', status: 'open', department: 'Engineering' }],
      links: [{ job_id: 'j1', opening_id: 'a' }, { job_id: 'j1', opening_id: 'b' }],
      months: lastMonths(3, now), now,
    })
    expect(r.seats).toMatchObject({ open: 1, filled: 1, closed: 1, draft: 1, total: 2 })
    expect(r.by_department[0]).toMatchObject({ department: 'Engineering', open: 1, filled: 1 })
    expect(r.monthly.find(m => m.month === '2026-08')).toMatchObject({ filled: 1, closed: 1 })
    expect(r.time_to_fill).toMatchObject({ median_days: 40, n: 1 })
    expect(r.time_to_start).toMatchObject({ median_days: 22, n: 1 })
    expect(r.open_jobs[0]).toMatchObject({ id: 'j1', filled: 1, total: 2, remaining: 1 })
    expect(r.stale_open_seats.map(s => s.id)).toEqual(['b'])   // open since June → > 60 days
  })
  it('lastMonths returns n keys ending this month', () => {
    expect(lastMonths(3, now)).toEqual(['2026-07', '2026-08', '2026-09'])
  })
})
