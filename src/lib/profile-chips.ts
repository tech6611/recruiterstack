/**
 * Profile CHIPS — the labels a recruiter reads before anything else on a profile, the
 * way Juicebox opens with "Early + Growth · Startup + Big Tech · High Avg. Tenure ·
 * AI / ML".
 *
 * NOBODY TYPES THESE. They are derived from the record: dated roles, the skills list,
 * the schools. That is what separates them from `candidate_tags`, which are notes a
 * recruiter writes by hand. A chip is a reading of the evidence, so it is recomputed
 * every time and never stored — a stored chip is a claim that silently goes stale when
 * the person's history is re-extracted.
 *
 * WHAT A CHIP HAS TO EARN. Each one answers a question a recruiter actually filters on
 * (Juicebox's own filter list is a fair proxy: tenure, career growth, skills, schools,
 * seniority, company background). A chip that is true of almost everybody tells you
 * nothing, so the thresholds below are deliberately conservative: "High avg. tenure"
 * means three years, not eighteen months.
 *
 * WHAT IS MISSING AND WHY. Juicebox's company chips — "Series A through Series G",
 * "Startup + Big Tech", industry verticals — need a database of employers with funding
 * stage, headcount and industry, dated so a tenure can be intersected with a company's
 * timeline. Those come from `company-facts.ts` once an employer has been enriched;
 * everything in this file needs nothing but the profile itself.
 *
 * PURE. `now` is injected; no clock, no I/O.
 */
import { deriveProfileTags, type TagExperience, type TagContext } from '@/lib/profile-tags'
import { buildSkillMap, FALLBACK_CATEGORY } from '@/lib/skills'
import { schoolTiersFor } from '@/modules/pool/search/school-tiers'
import { groupByEmployer, summarizeHistory, seniorityRank, type WorkRole } from '@/lib/ui/work-history'

export interface ProfileChip {
  label: string
  /** Why this chip is here, shown on hover. A label nobody can interrogate is noise. */
  hint: string
  kind: 'tenure' | 'trajectory' | 'domain' | 'education' | 'seniority' | 'breadth'
}

export interface ChipInput {
  experiences: WorkRole[]
  skills?: string[]
  education?: { degree?: string | null; field?: string | null; school?: string | null; year?: number | null }[]
  /** ISO country of the person, so school tiers are judged in the right market. */
  country?: string | null
  now?: Date
}

/** Three years at one employer is a real signal; eighteen months is just a job. */
const HIGH_TENURE_MONTHS = 36
const SHORT_TENURE_MONTHS = 18

/** Past six, a chip row stops being something you take in at a glance. */
const MAX_CHIPS = 6

/** Titles at or above this rank are management rather than senior individual work. */
const MANAGER_RANK = 5

function schoolChips(
  education: ChipInput['education'],
  country: string | null | undefined,
): ProfileChip[] {
  const tiers = schoolTiersFor(country ?? 'IN')
  if (!tiers) return []
  const schools = (education ?? []).map((e) => (e?.school ?? '').toLowerCase()).filter(Boolean)
  if (!schools.length) return []
  const matches = (terms: string[]) =>
    terms.some((t) => schools.some((s) => s.includes(t.toLowerCase())))
  if (matches(tiers.tier1)) {
    return [{ label: 'Top-tier school', hint: 'Studied at a tier-1 institution for this market', kind: 'education' }]
  }
  if (matches(tiers.tier2)) {
    return [{ label: 'Tier-2 school', hint: 'Studied at a tier-2 institution for this market', kind: 'education' }]
  }
  return []
}

/**
 * The one or two skill groups a person is actually concentrated in — "AI / ML",
 * "Back-End". Taken from the Skill Map, so a chip can never disagree with the grouping
 * shown further down the same profile.
 */
function domainChips(skills: string[] | undefined): ProfileChip[] {
  const groups = buildSkillMap(skills ?? []).filter((g) => g.category !== FALLBACK_CATEGORY && g.category !== 'Spoken Languages')
  if (!groups.length) return []
  const total = groups.reduce((n, g) => n + g.skills.length, 0)
  // A group has to hold a real share of the person to describe them. Below a fifth it
  // is a skill they listed once, not a domain they work in.
  return groups
    .filter((g) => g.skills.length >= 2 && g.skills.length / total >= 0.2)
    .slice(0, 2)
    .map((g) => ({
      label: g.category,
      hint: `${g.skills.length} of ${total} listed skills sit in ${g.category}`,
      kind: 'domain' as const,
    }))
}

function seniorityChip(experiences: WorkRole[], now: Date): ProfileChip | null {
  const stints = groupByEmployer(experiences, now)
  const currentRole = stints.find((s) => s.isCurrent)?.roles[0] ?? stints[0]?.roles[0]
  if (!currentRole?.title) return null
  const rank = seniorityRank(currentRole.title)
  if (rank >= 7) return { label: 'Executive', hint: `Current title: ${currentRole.title}`, kind: 'seniority' }
  if (rank >= MANAGER_RANK) return { label: 'People manager', hint: `Current title: ${currentRole.title}`, kind: 'seniority' }
  if (rank >= 4) return { label: 'Senior IC', hint: `Current title: ${currentRole.title}`, kind: 'seniority' }
  return null
}

function tenureChips(experiences: WorkRole[], now: Date): ProfileChip[] {
  const { averageTenureMonths } = summarizeHistory(experiences, now)
  if (averageTenureMonths == null) return []
  if (averageTenureMonths >= HIGH_TENURE_MONTHS) {
    return [{ label: 'High avg. tenure', hint: `Stays about ${Math.round(averageTenureMonths / 12)} years per employer`, kind: 'tenure' }]
  }
  if (averageTenureMonths < SHORT_TENURE_MONTHS) {
    return [{ label: 'Short stints', hint: `Averages ${averageTenureMonths} months per employer`, kind: 'tenure' }]
  }
  return []
}

/**
 * Every chip this profile earns, most telling first: what they do, how senior, how
 * they move, where they studied.
 */
export function deriveProfileChips(input: ChipInput): ProfileChip[] {
  const now = input.now ?? new Date()
  const experiences = input.experiences ?? []

  const trajectory: ProfileChip[] = deriveProfileTags(
    experiences as TagExperience[],
    {
      graduationYear: (input.education ?? []).reduce<number | null>(
        (latest, e) => (typeof e?.year === 'number' && (latest == null || e.year > latest) ? e.year : latest),
        null,
      ),
      now,
    } satisfies TagContext,
  ).map((label) => ({ label, hint: 'Derived from the dated work history', kind: 'trajectory' as const }))

  const seniority = seniorityChip(experiences, now)

  const chips = [
    ...domainChips(input.skills),
    ...(seniority ? [seniority] : []),
    ...trajectory,
    ...tenureChips(experiences, now),
    ...schoolChips(input.education, input.country),
  ]

  // De-duplicate: the trajectory rules already emit their own tenure verdicts, and two
  // chips saying the same thing in different words reads as padding.
  const seen = new Set<string>()
  const unique = chips.filter((c) => {
    const key = c.label.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  // Capped. A row of chips is read at a glance, and past half a dozen it stops being a
  // glance — the array is already ordered most-telling first, so the tail is the least
  // worth keeping.
  return unique.slice(0, MAX_CHIPS)
}
