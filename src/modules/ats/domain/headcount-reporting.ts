// Headcount reporting (Ashby parity, Phase 5): seats by state, monthly
// opened/filled/closed, time to fill and time to start, and jobs with seats
// remaining. Reads only what Phases 2–4 made true (opened_at / filled_at /
// closed_at on openings, approval timestamps, job links).

import type { SupabaseClient } from '@supabase/supabase-js'
import { summarizeSeats } from '@/lib/openings/seat-math'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any

export type HeadcountReport = {
  generated_at: string
  months: string[]                                  // 'YYYY-MM', oldest → newest
  seats: { total: number; approved: number; open: number; filled: number; closed: number; pending: number; draft: number }
  by_department: Array<{ department: string; approved: number; open: number; filled: number; closed: number }>
  monthly: Array<{ month: string; opened: number; filled: number; closed: number; approved: number }>
  time_to_fill: { median_days: number | null; avg_days: number | null; n: number; by_department: Array<{ department: string; median_days: number | null; n: number }> }
  time_to_start: { median_days: number | null; avg_days: number | null; n: number }
  open_jobs: Array<{ id: string; title: string; department: string | null; filled: number; total: number; remaining: number; oldest_open_days: number | null }>
  stale_open_seats: Array<{ id: string; title: string; number: number | null; department: string | null; open_days: number }>
}

const monthKey = (iso: string) => iso.slice(0, 7)
const days = (a: string, b: string) => Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000))
const median = (xs: number[]): number | null => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}
const avg = (xs: number[]): number | null => xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null

/** Last `n` month keys ending this month. */
export function lastMonths(n: number, now = new Date()): string[] {
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    out.push(d.toISOString().slice(0, 7))
  }
  return out
}

type OpeningRow = {
  id: string; title: string; status: string; number: number | null; department_id: string | null
  created_at: string; opened_at: string | null; filled_at: string | null; closed_at: string | null; target_start_date: string | null
}

/** Pure assembly so it can be unit-tested without a database. */
export function assembleHeadcountReport(input: {
  openings: OpeningRow[]
  approvedAt: Map<string, string>          // opening id → when it was approved
  departments: Map<string, string>         // department id → name
  jobs: Array<{ id: string; title: string; status: string; department: string | null }>
  links: Array<{ job_id: string; opening_id: string }>
  months: string[]
  now?: Date
}): HeadcountReport {
  const now = input.now ?? new Date()
  const nowIso = now.toISOString()
  const dept = (id: string | null) => (id && input.departments.get(id)) || 'No department'
  const live = input.openings.filter(o => o.status !== 'archived')

  const count = (s: string) => live.filter(o => o.status === s).length
  const seats = {
    total: live.filter(o => !['draft', 'pending_approval', 'closed'].includes(o.status)).length,
    approved: count('approved'), open: count('open'), filled: count('filled'), closed: count('closed'),
    pending: count('pending_approval'), draft: count('draft'),
  }

  const byDept = new Map<string, { approved: number; open: number; filled: number; closed: number }>()
  for (const o of live) {
    const d = dept(o.department_id)
    const row = byDept.get(d) ?? { approved: 0, open: 0, filled: 0, closed: 0 }
    if (o.status in row) (row as Record<string, number>)[o.status]++
    byDept.set(d, row)
  }
  const by_department = Array.from(byDept, ([department, r]) => ({ department, ...r }))
    .sort((a, b) => (b.open + b.approved + b.filled) - (a.open + a.approved + a.filled))

  const monthly = input.months.map(month => ({
    month,
    opened:   live.filter(o => o.opened_at && monthKey(o.opened_at) === month).length,
    filled:   live.filter(o => o.filled_at && monthKey(o.filled_at) === month).length,
    closed:   live.filter(o => o.closed_at && monthKey(o.closed_at) === month).length,
    approved: live.filter(o => { const a = input.approvedAt.get(o.id); return a && monthKey(a) === month }).length,
  }))

  // Time to fill = approval (else creation) → filled. Time to start = filled → target start.
  const ttfAll: number[] = []; const ttfByDept = new Map<string, number[]>(); const tts: number[] = []
  for (const o of live) {
    if (!o.filled_at) continue
    const start = input.approvedAt.get(o.id) ?? o.created_at
    const d = days(start, o.filled_at)
    ttfAll.push(d); ttfByDept.set(dept(o.department_id), [...(ttfByDept.get(dept(o.department_id)) ?? []), d])
    if (o.target_start_date) tts.push(days(o.filled_at, o.target_start_date))
  }
  const time_to_fill = {
    median_days: median(ttfAll), avg_days: avg(ttfAll), n: ttfAll.length,
    by_department: Array.from(ttfByDept, ([department, xs]) => ({ department, median_days: median(xs), n: xs.length })).sort((a, b) => b.n - a.n),
  }
  const time_to_start = { median_days: median(tts), avg_days: avg(tts), n: tts.length }

  const seatsByJob = new Map<string, OpeningRow[]>()
  const byId = new Map(input.openings.map(o => [o.id, o]))
  for (const l of input.links) { const o = byId.get(l.opening_id); if (o) seatsByJob.set(l.job_id, [...(seatsByJob.get(l.job_id) ?? []), o]) }
  const open_jobs = input.jobs
    .filter(j => j.status === 'open' || j.status === 'paused')
    .map(j => {
      const s = seatsByJob.get(j.id) ?? []
      const sum = summarizeSeats(s.map(o => o.status))
      const oldest = s.filter(o => o.status === 'open' && o.opened_at).map(o => days(o.opened_at!, nowIso))
      return { id: j.id, title: j.title, department: j.department, filled: sum.filled, total: sum.total, remaining: sum.remaining, oldest_open_days: oldest.length ? Math.max(...oldest) : null }
    })
    .sort((a, b) => (b.oldest_open_days ?? -1) - (a.oldest_open_days ?? -1))

  const stale_open_seats = live
    .filter(o => o.status === 'open' && o.opened_at && days(o.opened_at, nowIso) >= 60)
    .map(o => ({ id: o.id, title: o.title, number: o.number, department: dept(o.department_id), open_days: days(o.opened_at!, nowIso) }))
    .sort((a, b) => b.open_days - a.open_days)

  return { generated_at: nowIso, months: input.months, seats, by_department, monthly, time_to_fill, time_to_start, open_jobs, stale_open_seats }
}

export async function getHeadcountReport(supabase: SupabaseClient, orgId: string, monthsBack = 12): Promise<HeadcountReport> {
  const sb = supabase as unknown as Loose
  const primary = await sb.from('openings')
    .select('id, title, status, number, department_id, created_at, opened_at, filled_at, closed_at, target_start_date')
    .eq('org_id', orgId)
  // Pre-migration (141/143) databases lack some columns: degrade to the basics.
  const openingsRes = primary.error
    ? await sb.from('openings').select('id, title, status, department_id, created_at, target_start_date').eq('org_id', orgId)
    : primary
  const openings = ((openingsRes.data ?? []) as Array<Partial<OpeningRow>>).map(o => ({
    id: o.id!, title: o.title ?? '', status: o.status ?? 'draft', number: o.number ?? null, department_id: o.department_id ?? null,
    created_at: o.created_at ?? new Date().toISOString(), opened_at: o.opened_at ?? null, filled_at: o.filled_at ?? null,
    closed_at: o.closed_at ?? null, target_start_date: o.target_start_date ?? null,
  }))
  const ids = openings.map(o => o.id)

  const [{ data: appr }, { data: depts }, { data: jobs }, { data: links }] = await Promise.all([
    ids.length ? sb.from('approvals').select('target_id, completed_at').eq('org_id', orgId).eq('target_type', 'opening').eq('status', 'approved').in('target_id', ids) : { data: [] },
    sb.from('departments').select('id, name').eq('org_id', orgId),
    sb.from('jobs').select('id, title, status, department:departments(name)').eq('org_id', orgId).neq('status', 'archived'),
    ids.length ? sb.from('job_openings').select('job_id, opening_id').in('opening_id', ids) : { data: [] },
  ])
  const approvedAt = new Map<string, string>()
  for (const a of (appr ?? []) as Array<{ target_id: string; completed_at: string | null }>) if (a.completed_at) approvedAt.set(a.target_id, a.completed_at)
  const departments = new Map(((depts ?? []) as Array<{ id: string; name: string }>).map(d => [d.id, d.name]))

  return assembleHeadcountReport({
    openings, approvedAt, departments,
    jobs: ((jobs ?? []) as Array<{ id: string; title: string; status: string; department: { name: string } | null }>).map(j => ({ id: j.id, title: j.title, status: j.status, department: j.department?.name ?? null })),
    links: (links ?? []) as Array<{ job_id: string; opening_id: string }>,
    months: lastMonths(monthsBack),
  })
}
