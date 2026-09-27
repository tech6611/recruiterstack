/**
 * COMPANY CHIPS — what a person's EMPLOYERS say about them, as opposed to what their
 * own record says. "Fintech", "Startup + Big Tech", "Early employee".
 *
 * This is the half of Juicebox's chip row that a résumé cannot answer. A CV names an
 * employer and nothing else; whether that employer is a forty-person seed company or a
 * three-hundred-thousand-person consultancy has to come from a company database, which
 * is what `company_facts` is.
 *
 * WHAT WE DELIBERATELY DO NOT CLAIM
 *
 * *No "Unicorn", and no valuation.* The enrichment produced both, and checking them
 * against the pool showed the flag is wrong about half the time in both directions —
 * Stripe and Notion missing it, EY, Accenture, PayPal, Adani and a student engineering
 * team carrying it — because the "valuation" is often market capitalisation or annual
 * revenue instead. A chip is a factual claim about someone's employer shown to a paying
 * recruiter; being wrong half the time is worse than staying quiet.
 *
 * *No "Series C experience".* `latest_stage` is the company's stage TODAY, not its stage
 * while this person worked there. Someone who left Razorpay in 2016 did not experience
 * its Series F. The one sound inference runs the other way: if a company is STILL at
 * seed or Series A, then whenever they were there it was at most that — so "Early-stage"
 * can be said honestly and "Series C" cannot.
 *
 * *Size is read with the founding year beside it.* Headcount is also a today number.
 * Someone who joined Flipkart in 2008 did not join a 22,000-person company. A stint is
 * only read as "big company" when it began well after founding, and a start close to
 * founding is read as "early" however large the company later became.
 *
 * PURE. The facts are passed in; this file does no I/O.
 */
import { companySector } from '@/lib/industries/sectors'
import { normalizeName } from '@/lib/brand-icon'
import { groupByEmployer, type WorkRole } from '@/lib/ui/work-history'

export interface CompanyFacts {
  name_norm: string
  display_name: string | null
  industries: string[]
  employees: number | null
  founded_year: number | null
  latest_stage: string | null
}

/** Keyed by `normalizeName(employer, 'company')` — the key brand_domains uses too. */
export type CompanyFactsMap = Record<string, CompanyFacts>

/** Ten thousand people is unambiguously a big company in any market. */
const LARGE_MIN = 10_000
/** A company that reached this size is one it was worth being early at. */
const SCALED_MIN = 1_000
/** Two hundred or fewer is a startup by any recruiter's reckoning. */
const STARTUP_MAX = 200
/** Join within four years of founding and you were there before it settled. */
const EARLY_YEARS = 4
/** Stages a company can still be at, which bound what its alumni can have seen. */
const EARLY_STAGE = /^(pre-seed|seed|angel|series a)$/i
/** A sector has to cover this much of a career to describe it. */
const SECTOR_SHARE = 0.3

export interface CompanyChip {
  label: string
  hint: string
  kind: 'company' | 'industry'
  icon: 'building' | 'rocket' | 'landmark' | 'gem'
}

export function factsFor(map: CompanyFactsMap | undefined, employer: string | null | undefined): CompanyFacts | null {
  if (!map || !employer) return null
  return map[normalizeName(employer, 'company')] ?? null
}

/** The year a stint began, or null when it is undated. */
function startYear(iso: string | null | undefined): number | null {
  if (!iso) return null
  const y = Number(String(iso).slice(0, 4))
  return Number.isFinite(y) && y > 1900 ? y : null
}

/**
 * Every chip this person's employers earn: one about the SHAPE of the companies, one
 * about the sector they work in. Two at most — the profile's other chips describe the
 * person, and a row is read at a glance.
 */
export function companyChips(roles: WorkRole[], facts: CompanyFactsMap | undefined, now = new Date()): CompanyChip[] {
  if (!facts) return []
  const stints = groupByEmployer(roles, now)

  let startup: string | null = null
  let large: string | null = null
  let earlyAt: { name: string; year: number } | null = null
  let earlyStage: string | null = null
  const monthsBySector = new Map<string, number>()
  let knownSectorMonths = 0

  for (const stint of stints) {
    const f = factsFor(facts, stint.employer)
    if (!f) continue
    const name = f.display_name ?? stint.employer ?? 'this employer'
    const began = startYear(stint.startDate)
    const joinedEarly = began != null && f.founded_year != null && began - f.founded_year <= EARLY_YEARS

    if (joinedEarly && (f.employees ?? 0) >= SCALED_MIN && earlyAt == null) {
      earlyAt = { name, year: began as number }
    }
    if (f.employees != null && f.employees <= STARTUP_MAX) startup ??= name
    else if (joinedEarly) startup ??= name
    if (f.employees != null && f.employees >= LARGE_MIN && !joinedEarly) large ??= name
    if (f.latest_stage && EARLY_STAGE.test(f.latest_stage)) earlyStage ??= name

    const sector = companySector(f.industries)
    if (sector && stint.months != null) {
      monthsBySector.set(sector, (monthsBySector.get(sector) ?? 0) + stint.months)
      knownSectorMonths += stint.months
    }
  }

  // The shape chip, strongest claim first. Only one — "Startup" and "Big Tech" said
  // separately is the same sentence twice.
  let shape: CompanyChip | null = null
  if (startup && large) {
    shape = { label: 'Startup + Big Tech', hint: `Worked at ${startup} and at ${large}`, kind: 'company', icon: 'building' }
  } else if (earlyAt) {
    shape = { label: 'Early employee', hint: `Joined ${earlyAt.name} in ${earlyAt.year}, within a few years of it being founded`, kind: 'company', icon: 'rocket' }
  } else if (earlyStage) {
    shape = { label: 'Early-stage', hint: `${earlyStage} is still at seed or Series A, so it was at most that while they were there`, kind: 'company', icon: 'rocket' }
  } else if (large) {
    shape = { label: 'Big Tech', hint: `Worked at ${large}, a company of over ${LARGE_MIN.toLocaleString()} people`, kind: 'company', icon: 'landmark' }
  } else if (startup) {
    shape = { label: 'Startup', hint: `Worked at ${startup}, a company under ${STARTUP_MAX} people`, kind: 'company', icon: 'rocket' }
  }

  // The sector chip. A sector under a third of a career is somewhere they passed
  // through, not the industry they work in.
  let industry: CompanyChip | null = null
  const top = Array.from(monthsBySector.entries()).sort((a, b) => b[1] - a[1])[0]
  if (top && knownSectorMonths > 0 && top[1] / knownSectorMonths >= SECTOR_SHARE) {
    const years = Math.floor(top[1] / 12)
    industry = {
      label: top[0],
      hint: years >= 1 ? `About ${years} year${years === 1 ? '' : 's'} at ${top[0]} companies` : `Their most recent work is at ${top[0]} companies`,
      kind: 'industry',
      icon: 'gem',
    }
  }

  return [shape, industry].filter((c): c is CompanyChip => c != null)
}
