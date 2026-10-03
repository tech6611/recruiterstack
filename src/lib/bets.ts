// Which feeder pool — and so which pass of the search — each archetype ("bet") is
// drawn from. PURE. Shared by the bet cards and by the ideal profile, which names each
// bet row after its card.
import type { SourcingMap, RecruiterBrief } from '@/lib/types/icp'

export type Archetype = NonNullable<SourcingMap['archetypes']>[number]

/** A pool entry's company without its parenthetical: "Google (Area 120, X)" → "Google". */
function baseName(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\s*\([^)]*\)/g, '').trim()
}

/** Whole-word test, so "Meta" does not match "metadata". */
function mentions(text: string, name: string): boolean {
  if (!name) return false
  return new RegExp(`\\b${name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text)
}

/** Legal and fund suffixes people drop when they say the name out loud. */
const SUFFIX = /\s+(?:(?:&|and)\s+(?:company|co\.?)|inc\.?|ltd\.?|llc|limited|pvt\.?\s+ltd\.?|private\s+limited|corp\.?|corporation|capital|venture\s+partners|ventures|partners|group|holdings|technologies)$/i

/**
 * Every way a card's prose might name a pool company. A pool writes the formal name —
 * "McKinsey & Company", "Boston Consulting Group (BCG)", "Sequoia Capital" — and the
 * card writes what a recruiter says: "McKinsey, Bain, or BCG". Matching only the formal
 * name found nothing for the consulting bet, so it lost its pass number and sorted last
 * although its pool is searched first. So: the name, the name without its legal
 * suffix, and a short acronym given in brackets. A bracket that is a note about WHICH
 * part of the company ("Google (Area 120, X)") is not an acronym and is not used.
 */
export function nameVariants(raw: string | null | undefined): string[] {
  const base = baseName(raw)
  if (!base) return []
  const out = [base]
  const core = base.replace(SUFFIX, '').trim()
  if (core.length >= 3 && core !== base) out.push(core)
  for (const m of Array.from((raw ?? '').matchAll(/\(([^)]*)\)/g))) {
    const inner = m[1].trim()
    if (/^[A-Z][A-Z&]{1,5}$/.test(inner)) out.push(inner)
  }
  return out
}

const namedIn = (text: string, raw: string) => nameVariants(raw).some((v) => mentions(text, v))

/** Everything an archetype's prose says about where its people come from. */
const proseOf = (a: Archetype) => `${a.where_from ?? ''} ${a.thesis ?? ''}`.toLowerCase()

/** The brief's feeder pools, highest priority first — the order the search works through. */
export function sortedPools(brief: RecruiterBrief | null | undefined) {
  return [...(brief?.feeder_pools ?? [])]
    .filter((p) => p.companies?.length)
    .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99))
}

/**
 * Feeder-pool companies an archetype's text names — archetypes carry no company list of
 * their own, so the two have to be matched up.
 *
 * MATCH ON THE BASE NAME, NOT THE DECORATED ONE. A pool lists "Google (Area 120, X)"
 * and "Meta (NPE)"; the archetype that draws on them says "Google Area 120, Meta NPE".
 * Comparing the full strings finds nothing, which is why the Big-Tech bet showed no
 * logos at all while the others showed four. The parenthetical is a note about WHICH
 * part of the company, so it is dropped for both the match and the logo lookup —
 * "Google (Area 120, X)" resolves to no logo either.
 */
export function companiesFor(a: Archetype, brief: RecruiterBrief | null | undefined): string[] {
  const text = proseOf(a)
  const out: string[] = []
  for (const raw of (brief?.feeder_pools ?? []).flatMap((p) => p.companies)) {
    const base = baseName(raw)
    if (!base || out.includes(base)) continue
    if (namedIn(text, raw)) out.push(base)
    if (out.length === 4) break
  }
  return out
}

/**
 * Which pass of the search first reaches this bet.
 *
 * WHY THIS HAS TO BE SHOWN. The search does not sample all three bets evenly — it works
 * through the feeder pools in priority order, exhausting one before starting the next.
 * So a bet whose companies all sit in pool 3 is not looked for until the first two are
 * spent. Without saying so, three cards side by side promise an even split and the
 * recruiter wonders where their big-tech people are.
 *
 * Two bets CAN share a pass: the Aspiring Leader draws on Notion, which is in pool 1,
 * so it is reached alongside the Startup Scaler rather than after it. The number is
 * read off the pools, not assumed from the order the cards happen to be written in.
 *
 * Null means no pool names any of its companies — a bet with no lane of its own, which
 * is worth knowing.
 */
export function searchPassFor(
  a: Archetype,
  brief: RecruiterBrief | null | undefined,
): { pass: number; pool: string } | null {
  const pools = sortedPools(brief)
  // A bet written since the generator started naming its pool says so outright.
  const named = a.feeder_pool?.trim().toLowerCase()
  const own = named ? pools.findIndex((p) => (p.label ?? '').trim().toLowerCase() === named) : -1
  if (own >= 0) return { pass: own + 1, pool: pools[own].label ?? `Pool ${own + 1}` }
  // Older bets only name companies, so read the pool off those.
  const text = proseOf(a)
  for (let i = 0; i < pools.length; i++) {
    if ((pools[i].companies ?? []).some((raw) => namedIn(text, raw))) {
      return { pass: i + 1, pool: pools[i].label ?? `Pool ${i + 1}` }
    }
  }
  return null
}

// ── Titles that say only a level ─────────────────────────────────────────────────

/** Words that describe a level, not a job. Alone they match anything ("Senior" → Senior Account Executive). */
const GENERIC_TITLE_TOKENS = new Set([
  'senior', 'sr', 'staff', 'lead', 'head', 'manager', 'principal', 'director', 'junior', 'jr', 'associate',
  'chief', 'vp', 'vice president', 'executive', 'intern', 'consultant', 'specialist', 'analyst', 'officer', 'partner',
])

/** True when a title term would match by level alone. Such terms are never sent to a vendor. PURE. */
export function isGenericTitleTerm(term: string): boolean {
  return GENERIC_TITLE_TOKENS.has(term.trim().toLowerCase().replace(/[.]/g, ''))
}

export type PoolKind = 'consulting' | 'finance' | 'operator'
/**
 * What kind of employers a feeder pool names, by company name. Used ONLY by the two older
 * planners for profiles made before the ideal profile and bets; the bet ladder takes
 * every per-bet decision from the brief instead (title_exclusions, line_of_work). PURE.
 */
export function poolKind(pool: { label: string; companies: string[] }): PoolKind {
  const text = `${pool.label} ${pool.companies.join(' ')}`.toLowerCase()
  if (/consult|mckinsey|bain|bcg|boston consulting|kearney|oliver wyman|strategy&|accenture strategy|deloitte/.test(text)) return 'consulting'
  if (/bank|capital|ventures|partners|goldman|morgan|sequoia|accel|lightspeed|private equity|\bvc\b|\bib\b|\bpe\b/.test(text)) return 'finance'
  return 'operator'
}
