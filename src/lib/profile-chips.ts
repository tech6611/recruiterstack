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
 * TWO SOURCES. Everything derived here needs nothing but the profile itself. The
 * company chips — "Startup + Big Tech", "Fintech", "Early employee" — need a database
 * of employers and so live in `company-facts.ts`; they are folded in when the caller
 * has one, and simply absent when it does not. See that file for what those chips
 * deliberately refuse to claim.
 *
 * PURE. `now` is injected; no clock, no I/O.
 */
import { deriveProfileTags, type TagExperience, type TagContext } from '@/lib/profile-tags'
import { buildSkillMap, FALLBACK_CATEGORY } from '@/lib/skills'
import { schoolTiersFor } from '@/modules/pool/search/school-tiers'
import { groupByEmployer, summarizeHistory, seniorityRank, type WorkRole } from '@/lib/ui/work-history'
import { companyChips, type CompanyFactsMap } from '@/lib/company-facts'

/**
 * The mark drawn beside a chip. A name, not a component — this file is pure and knows
 * nothing about React; the UI maps the name to an icon. Kept deliberately small and
 * literal (rocket, hourglass, graduation cap) so a chip is recognisable before it is
 * read, which is the entire point of a chip.
 */
export type ChipIcon =
  | 'rocket' | 'hourglass' | 'trending-up' | 'move' | 'graduation' | 'crown'
  | 'users' | 'code' | 'brain' | 'building' | 'gem' | 'landmark'

export interface ProfileChip {
  label: string
  /** Why this chip is here, shown on hover. A label nobody can interrogate is noise. */
  hint: string
  kind: 'tenure' | 'trajectory' | 'domain' | 'education' | 'seniority' | 'breadth' | 'company' | 'industry'
  icon: ChipIcon
}

/** Which mark a derived trajectory label gets. */
const TRAJECTORY_ICONS: [RegExp, ChipIcon][] = [
  [/fast career growth/i, 'trending-up'],
  [/recently moved|likely open/i, 'move'],
  [/long tenures/i, 'hourglass'],
  [/job hopper/i, 'move'],
  [/^(at|ex)-/i, 'building'],
]

/** A domain chip's mark, by what the group is about. */
function domainIcon(category: string): ChipIcon {
  if (/ai|ml|data science|statistics/i.test(category)) return 'brain'
  if (/front|back|mobile|devops|cloud|database|engineering|programming|qa|security|architecture/i.test(category)) return 'code'
  if (/finance|accounting|investment|treasury|tax/i.test(category)) return 'landmark'
  return 'building'
}

export interface ChipInput {
  experiences: WorkRole[]
  skills?: string[]
  education?: { degree?: string | null; field?: string | null; school?: string | null; year?: number | null }[]
  /** ISO country of the person, so school tiers are judged in the right market. */
  country?: string | null
  /** Employer facts, keyed by normalized name. Absent means no company chips. */
  companies?: CompanyFactsMap
  now?: Date
}

/** Three years at one employer is a real signal; eighteen months is just a job. */
const HIGH_TENURE_MONTHS = 36
const SHORT_TENURE_MONTHS = 18

/**
 * Past seven, a chip row stops being something you take in at a glance. It was six
 * before the company chips existed; they are among the most distinguishing things on a
 * profile, and squeezing them in would have silently dropped tenure and schooling.
 */
const MAX_CHIPS = 7

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
    return [{ label: 'Top-tier school', hint: 'Studied at a tier-1 institution for this market', kind: 'education', icon: 'graduation' }]
  }
  if (matches(tiers.tier2)) {
    return [{ label: 'Tier-2 school', hint: 'Studied at a tier-2 institution for this market', kind: 'education', icon: 'graduation' }]
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
      icon: domainIcon(g.category),
    }))
}

function seniorityChip(experiences: WorkRole[], now: Date): ProfileChip | null {
  const stints = groupByEmployer(experiences, now)
  const currentRole = stints.find((s) => s.isCurrent)?.roles[0] ?? stints[0]?.roles[0]
  if (!currentRole?.title) return null
  const rank = seniorityRank(currentRole.title)
  if (rank >= 7) return { label: 'Executive', hint: `Current title: ${currentRole.title}`, kind: 'seniority', icon: 'crown' }
  if (rank >= MANAGER_RANK) return { label: 'People manager', hint: `Current title: ${currentRole.title}`, kind: 'seniority', icon: 'users' }
  if (rank >= 4) return { label: 'Senior IC', hint: `Current title: ${currentRole.title}`, kind: 'seniority', icon: 'gem' }
  return null
}

function tenureChips(experiences: WorkRole[], now: Date): ProfileChip[] {
  const { averageTenureMonths } = summarizeHistory(experiences, now)
  if (averageTenureMonths == null) return []
  if (averageTenureMonths >= HIGH_TENURE_MONTHS) {
    return [{ label: 'High avg. tenure', hint: `Stays about ${Math.round(averageTenureMonths / 12)} years per employer`, kind: 'tenure', icon: 'hourglass' }]
  }
  if (averageTenureMonths < SHORT_TENURE_MONTHS) {
    return [{ label: 'Short stints', hint: `Averages ${averageTenureMonths} months per employer`, kind: 'tenure', icon: 'move' }]
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
  ).map((label) => ({
    label,
    hint: 'Derived from the dated work history',
    kind: 'trajectory' as const,
    icon: TRAJECTORY_ICONS.find(([re]) => re.test(label))?.[1] ?? 'rocket',
  }))

  const seniority = seniorityChip(experiences, now)

  const chips = [
    // Employers first, as Juicebox has them: "Startup + Big Tech" tells you more about
    // someone at a glance than any single thing on their own record.
    ...companyChips(experiences, input.companies, now),
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
