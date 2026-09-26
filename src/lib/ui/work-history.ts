/**
 * Turning a flat list of dated roles into the shape a recruiter reads — the Juicebox
 * presentation: roles grouped under one employer, promotions marked, every span given
 * a duration, and a one-line summary of the whole career.
 *
 * WHY GROUP BY EMPLOYER. A flat list makes three promotions at Airbnb look like three
 * jobs, which reads as job-hopping and is the opposite of what happened. The same
 * reasoning already drives the pool's tag rules (`modules/pool/domain/profile-tags.ts`),
 * which merge an employer's roles into one stint before judging tenure; this file is
 * the display-side counterpart and follows the same rule so the two can't disagree.
 *
 * WHY A SECOND AVERAGE. `deriveMovability` (lib/ai/candidate-enrichment.ts) divides
 * total experience by the number of ROLES, which is what the scoring brain wants.
 * "4 years average tenure" on a profile means something different — how long this
 * person stays at a COMPANY — and a promotion is not a move. Both numbers are correct
 * for their own question, so this computes its own rather than changing that one.
 *
 * PURE. `now` is always injected; nothing here reads the clock, so every span is
 * reproducible in a test.
 */

export interface WorkRole {
  title: string | null
  employer: string | null
  location?: string | null
  start_date: string | null
  end_date: string | null
  is_current: boolean
  summary?: string | null
}

/** One role inside a stint, with the promotion judgement already made. */
export interface StintRole extends WorkRole {
  months: number | null
  /** True when this role outranks the one held before it at the SAME employer. */
  isPromotion: boolean
}

/** Every role held at one employer, merged into a single span. */
export interface EmployerStint {
  employer: string | null
  /** Newest first, matching the order they are displayed in. */
  roles: StintRole[]
  startDate: string | null
  endDate: string | null
  isCurrent: boolean
  /** Span of the whole stint — not the sum of its roles, which would double-count. */
  months: number | null
}

export interface HistorySummary {
  /** Months actually employed; overlapping roles counted once, gaps excluded. */
  totalMonths: number | null
  /** Mean completed stint length, per EMPLOYER. Null until one stint has ended. */
  averageTenureMonths: number | null
  /** How long they have been at the CURRENT employer — promotions included. */
  currentTenureMonths: number | null
  employerCount: number
  roleCount: number
}

/**
 * Seniority ladder for promotion detection. Ranked, not merely different: a lateral
 * move inside a company is not a promotion, and labelling it one would overstate
 * someone's trajectory to a recruiter reading quickly.
 */
const LADDER: [RegExp, number][] = [
  [/\b(?:intern|internship|trainee|apprentice)\b/i, 0],
  [/\b(?:junior|jr|associate|analyst|assistant)\b/i, 1],
  [/\b(?:senior|sr|specialist)\b/i, 3],
  [/\b(?:staff|lead|principal|architect)\b/i, 4],
  [/\b(?:manager|head)\b/i, 5],
  [/\b(?:director)\b/i, 6],
  [/\b(?:vp|vice president)\b/i, 7],
  [/\b(?:chief|cto|ceo|cfo|coo|cpo|founder|partner)\b/i, 8],
]
const DEFAULT_RANK = 2

/** Where a title sits on the ladder. Highest match wins ("Senior Director" → 6). */
export function seniorityRank(title: string | null | undefined): number {
  const t = (title ?? '').trim()
  if (!t) return DEFAULT_RANK
  let rank: number | null = null
  for (const [re, value] of LADDER) if (re.test(t)) rank = rank == null ? value : Math.max(rank, value)
  return rank ?? DEFAULT_RANK
}

function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Whole months from `a` to `b`, never negative. Null when either end is unknown. */
export function monthsBetween(a: string | null | undefined, b: Date | string | null | undefined): number | null {
  const from = parse(a)
  const to = typeof b === 'string' ? parse(b) : (b ?? null)
  if (!from || !to) return null
  return Math.max(0, (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()))
}

/** "Jul 2024". Empty string when the date is missing or unparseable. */
export function formatMonthYear(iso: string | null | undefined): string {
  const d = parse(iso)
  return d ? d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : ''
}

/** "Jul 2024 – Present", "Sep 2022 – May 2024", "— – May 2024" when a side is unknown. */
export function formatRange(start: string | null | undefined, end: string | null | undefined, isCurrent: boolean): string {
  const from = formatMonthYear(start) || '—'
  const to = isCurrent ? 'Present' : formatMonthYear(end) || '—'
  return `${from} – ${to}`
}

/**
 * "2 yrs 2 mos". Deliberately spelled out rather than "2y 2mo": this sits next to a
 * date range in running text, where the abbreviations read as noise.
 */
export function formatDuration(months: number | null | undefined): string {
  if (months == null || months < 0) return ''
  const y = Math.floor(months / 12)
  const m = months % 12
  const parts: string[] = []
  if (y) parts.push(`${y} ${y === 1 ? 'yr' : 'yrs'}`)
  if (m || !y) parts.push(`${m} ${m === 1 ? 'mo' : 'mos'}`)
  return parts.join(' ')
}

/**
 * "10 years", for the section header. Counts WHOLE years only — it never rounds up.
 *
 * Two reasons. It must not overstate: rounding first turned a 9-month average tenure
 * into "1 year average tenure", and tenure is the number a recruiter reads for
 * stability. And it sits on the same screen as the precise tiles, where rounding 68
 * months to "6 years" beside a tile reading "5 yrs 8 mos" looks like a bug rather than
 * two roundings of one fact.
 */
export function formatYears(months: number | null | undefined): string {
  if (months == null) return ''
  if (months < 12) return formatDuration(months)
  const years = Math.floor(months / 12)
  return `${years} ${years === 1 ? 'year' : 'years'}`
}

/** How long a single role ran. An open-ended role runs to `now`. */
export function roleMonths(role: WorkRole, now: Date): number | null {
  return monthsBetween(role.start_date, role.is_current ? now : role.end_date)
}

/** Employer identity for grouping. Case and punctuation vary between CV lines. */
function employerKey(employer: string | null | undefined): string {
  return (employer ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Group roles into employer stints, newest first, marking promotions.
 *
 * Roles with no employer are each kept as their own stint rather than being lumped
 * into one nameless block — they are usually separate freelance engagements, and
 * merging them would invent a job that never existed.
 */
export function groupByEmployer(roles: WorkRole[], now: Date): EmployerStint[] {
  const groups = new Map<string, WorkRole[]>()
  const order: string[] = []
  roles.forEach((role, i) => {
    const key = employerKey(role.employer) || `__unnamed_${i}`
    if (!groups.has(key)) {
      groups.set(key, [])
      order.push(key)
    }
    groups.get(key)!.push(role)
  })

  const stints: EmployerStint[] = order.map((key) => {
    const group = groups.get(key)!
    // Oldest first to judge promotions, then reversed for display.
    const chronological = [...group].sort((a, b) => (a.start_date ?? '').localeCompare(b.start_date ?? ''))
    const marked: StintRole[] = chronological.map((role, i) => ({
      ...role,
      months: roleMonths(role, now),
      isPromotion: i > 0 && seniorityRank(role.title) > seniorityRank(chronological[i - 1].title),
    }))

    const isCurrent = group.some((r) => r.is_current)
    const startDate = chronological.find((r) => r.start_date)?.start_date ?? null
    const ends = chronological.map((r) => r.end_date).filter((d): d is string => !!d).sort()
    const endDate = isCurrent ? null : (ends[ends.length - 1] ?? null)

    return {
      employer: group.find((r) => r.employer)?.employer ?? null,
      roles: marked.reverse(),
      startDate,
      endDate,
      isCurrent,
      months: monthsBetween(startDate, isCurrent ? now : endDate),
    }
  })

  // Newest first. A current stint always outranks a finished one, whatever the dates
  // say — a CV with a missing end date shouldn't push the present job down the page.
  return stints.sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1
    return (b.startDate ?? '').localeCompare(a.startDate ?? '')
  })
}

/**
 * The line above the timeline: "10 years total · 4 years average tenure".
 *
 * `totalMonths` is the union of dated role intervals — overlaps merged, gaps excluded —
 * so two concurrent roles are not counted twice and a two-year gap is not counted at
 * all. The average deliberately ignores a stint still in progress: someone eight months
 * into a job has not yet "stayed eight months", and including it drags the number down.
 */
export function summarizeHistory(roles: WorkRole[], now: Date): HistorySummary {
  const stints = groupByEmployer(roles, now)

  const intervals = roles
    .map((r) => {
      const from = parse(r.start_date)
      if (!from) return null
      const to = r.is_current ? now : parse(r.end_date)
      return to && to >= from ? ([from, to] as const) : ([from, now] as const)
    })
    .filter((x): x is readonly [Date, Date] => x !== null)
    .sort((a, b) => a[0].getTime() - b[0].getTime())

  let totalMonths: number | null = null
  if (intervals.length) {
    const merged: [Date, Date][] = []
    for (const [from, to] of intervals) {
      const last = merged[merged.length - 1]
      if (last && from <= last[1]) last[1] = to > last[1] ? to : last[1]
      else merged.push([from, to])
    }
    totalMonths = merged.reduce((sum, [from, to]) => sum + (monthsBetween(from.toISOString(), to) ?? 0), 0)
  }

  const completed = stints.filter((s) => !s.isCurrent && s.months != null).map((s) => s.months as number)
  const averageTenureMonths = completed.length
    ? Math.round(completed.reduce((a, b) => a + b, 0) / completed.length)
    : null

  return {
    totalMonths,
    averageTenureMonths,
    // The current STINT, not the current role: someone promoted last year has been at
    // the company far longer than they have held the title.
    currentTenureMonths: stints.find((s) => s.isCurrent)?.months ?? null,
    employerCount: stints.length,
    roleCount: roles.length,
  }
}
