/**
 * Profile TAGS — the one-glance labels a recruiter reads before the score
 * ("Fast career growth", "Ex-McKinsey", "Job hopper", "Recently moved"). Derived
 * deterministically from the stored role history and the job's search plan; no AI.
 * PURE + tested.
 *
 * Lives in lib/, not modules/pool, because the ATS candidate profile shows the same
 * chips. One set of rules, so the pool and the profile can never say different things
 * about the same person — and modules may not import each other sideways anyway.
 */
export interface TagExperience { title?: string | null; employer?: string | null; start_date?: string | null; end_date?: string | null; is_current?: boolean | null }

export interface TagContext {
  /** Employer terms from the search plan's feeder pools (already normalised, e.g. "McKinsey"). */
  feederEmployers?: string[]
  /** Year of the highest degree — roles that ended before it are campus/student roles, not employment. */
  graduationYear?: number | null
  now?: Date
}

/** Student-society / campus roles: not employment for tagging purposes. */
const CAMPUS_RE = /\b(?:iit|nit|iim|institute|university|college|campus|club|society|fellows?|e-?cell|shaastra|centre for innovation|summit|student|youth|hostel|chapter)\b/i
const CAMPUS_TITLE_RE = /\b(?:coordinator|core team|delegate|secretary|volunteer|member|ambassador|representative|organi[sz]er|convenor|mentor(?:ship)?|head of (?:mentorship|hospitality|publicity|sponsorship)|producer|podcast)\b/i

const PROMOTION_WORDS = /\b(senior|lead|principal|head|director|vp|vice president|manager|chief|staff|partner)\b/i
const INTERN_RE = /\b(?:intern(?:ship)?|trainee|apprentice)\b/i

function months(a: string | null | undefined, b: Date): number | null {
  if (!a) return null
  const d = new Date(a)
  if (Number.isNaN(d.getTime())) return null
  return (b.getFullYear() - d.getFullYear()) * 12 + (b.getMonth() - d.getMonth())
}

export function deriveProfileTags(experiences: TagExperience[], ctx: TagContext = {}): string[] {
  const now = ctx.now ?? new Date()
  const tags: string[] = []
  const gradCutoff = ctx.graduationYear ? new Date(`${ctx.graduationYear}-07-01`) : null
  const real = experiences.filter((e) => {
    if (!e.start_date || INTERN_RE.test(e.title ?? '')) return false
    if (CAMPUS_RE.test(e.employer ?? '') || CAMPUS_TITLE_RE.test(e.title ?? '')) return false
    // Ended before graduation → a student-era role.
    if (gradCutoff && !e.is_current && e.end_date && new Date(e.end_date) < gradCutoff) return false
    return true
  })
  if (!real.length) return tags

  // Ex-<feeder>: worked at any employer the plan searches for (current or past).
  const feeders = (ctx.feederEmployers ?? []).map((f) => f.toLowerCase()).filter((f) => f.length >= 3)
  const hit = feeders.find((f) => real.some((e) => (e.employer ?? '').toLowerCase().includes(f)))
  if (hit) {
    const current = real.some((e) => e.is_current && (e.employer ?? '').toLowerCase().includes(hit))
    const pretty = (ctx.feederEmployers ?? []).find((f) => f.toLowerCase() === hit) ?? hit
    tags.push(current ? `At ${pretty}` : `Ex-${pretty}`)
  }

  // Fast career growth: two or more title steps up at the same employer.
  const byEmployer = new Map<string, TagExperience[]>()
  for (const e of real) { const k = (e.employer ?? '').toLowerCase(); if (!k) continue; byEmployer.set(k, [...(byEmployer.get(k) ?? []), e]) }
  for (const roles of Array.from(byEmployer.values())) {
    if (roles.length >= 3 || (roles.length === 2 && roles.some((r: TagExperience) => PROMOTION_WORDS.test(r.title ?? '')))) { tags.push('Fast career growth'); break }
  }

  // Tenure pattern per EMPLOYER (promotions inside one company are not "hops"): merge
  // each employer's roles into one stint, then look at the completed stints.
  const stints: { start: string; end: string | null; current: boolean }[] = []
  for (const roles of Array.from(byEmployer.values())) {
    const sorted = [...roles].sort((a, b) => (a.start_date! < b.start_date! ? -1 : 1))
    const current = sorted.some((r) => r.is_current)
    const ends = sorted.map((r) => r.end_date).filter((d): d is string => !!d).sort()
    stints.push({ start: sorted[0].start_date!, end: current ? null : ends[ends.length - 1] ?? null, current })
  }
  const spans = stints.filter((st) => !st.current && st.end).map((st) => months(st.start, new Date(st.end!)) ?? 0).filter((m) => m > 0)
  if (spans.length >= 3) {
    const avg = spans.reduce((a, b) => a + b, 0) / spans.length
    if (avg < 15) tags.push('Job hopper')
    else if (avg >= 36) tags.push('Long tenures')
  }

  // Current role recency.
  const cur = real.find((e) => e.is_current) ?? real.sort((a, b) => (b.start_date! > a.start_date! ? 1 : -1))[0]
  const tenure = cur ? months(cur.start_date, now) : null
  if (tenure != null && tenure <= 6) tags.push('Recently moved')
  else if (tenure != null && tenure >= 30 && spans.length >= 2 && (spans.reduce((a, b) => a + b, 0) / spans.length) < tenure) tags.push('Likely open to move')

  return Array.from(new Set(tags)).slice(0, 4)
}
