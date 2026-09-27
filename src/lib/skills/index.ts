/**
 * Turning a flat `skills[]` array into the grouped Skill Map a profile shows.
 *
 * Three jobs, in order, and the first matters most:
 *
 *  1. CANONICALISE. The stored data holds `JavaScript` (43) and `Javascript` (23) as
 *     separate strings, `React` / `ReactJS` / `React.js` as three, `Node.js` / `NodeJS`,
 *     `TypeScript` / `Typescript`, `Excel` / `Microsoft Excel`. A profile today can show
 *     the same skill three times. Normalising strips case and punctuation, which merges
 *     the spelling variants for free; the catalog's aliases handle the ones that are
 *     genuinely different words.
 *  2. SPLIT COMPOUNDS. `Jest / Playwright / Cypress` is three skills in one chip, and
 *     `Radix UI / Tailwind / Material UI` is three more. Split only when every side is a
 *     skill we recognise — otherwise `C/C++`, which is one idiom, becomes two wrong
 *     chips, and a phrase like `Search/ML Infra` gets shredded.
 *  3. GROUP AND ORDER. Categories are ordered by how many of THIS person's skills sit in
 *     each, so an ML engineer's map opens with AI / ML and a supply-chain lead's opens
 *     with Supply Chain & Logistics. The profile describes itself instead of following a
 *     fixed order that suits one kind of candidate.
 *
 * Matching is exact on the normalised string, never substring — substring matching is
 * how "Java" swallows "JavaScript".
 *
 * PURE. No I/O, no clock, no AI call.
 */
import {
  CATEGORY_ORDER,
  DROPPED_TOOLS,
  FALLBACK_CATEGORY,
  SKILL_CATALOG,
  type SkillCategory,
} from './catalog'

export { CATEGORY_ORDER, FALLBACK_CATEGORY, type SkillCategory }

export interface SkillGroup {
  category: SkillCategory
  skills: string[]
}

/**
 * Case and punctuation out; `+` and `#` kept, because they are the whole difference
 * between C, C++ and C#. "Node.js" and "NodeJS" both land on "nodejs".
 */
export function normalizeSkill(skill: string): string {
  return (skill ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9+#]/g, '')
}

/** normalised alias → canonical label. Built once from the catalog. */
const CANONICAL = new Map<string, string>()
/** canonical label → category. */
const CATEGORY_OF = new Map<string, SkillCategory>()
/** normalised alias of a workflow tool we drop entirely. */
const DROPPED = new Set<string>()

function register(entry: string, category: SkillCategory | null) {
  const [label, ...aliases] = entry.split('|').map((s) => s.trim()).filter(Boolean)
  if (!label) return
  for (const spelling of [label, ...aliases]) {
    const key = normalizeSkill(spelling)
    if (!key) continue
    if (category === null) DROPPED.add(key)
    // First writer wins: an earlier category owns a name two categories both claim.
    else if (!CANONICAL.has(key)) CANONICAL.set(key, label)
  }
  if (category !== null && !CATEGORY_OF.has(label)) CATEGORY_OF.set(label, category)
}

for (const category of CATEGORY_ORDER) {
  for (const entry of SKILL_CATALOG[category] ?? []) register(entry, category)
}
for (const entry of DROPPED_TOOLS) register(entry, null)

/** True when this is a workflow tool we deliberately do not show. */
export function isDroppedTool(skill: string): boolean {
  return DROPPED.has(normalizeSkill(skill))
}

/**
 * Words that describe DOING something rather than naming it. "Chatbot development" is
 * the chatbot skill; "Dashboard creation" is the dashboard skill. A CV writes the same
 * capability as a noun, a gerund or a noun-plus-activity, and the catalog can't hold
 * every phrasing of every entry — one list of activity words covers them all.
 *
 * Deliberately a CLOSED list of activity nouns, not "drop the last word". Trimming
 * blindly turns "Excel at communication" into Microsoft Excel and "Java certification"
 * into something we never checked. Each word here means an activity and nothing else.
 */
const ACTIVITY_SUFFIX = new Set([
  'development', 'creation', 'design', 'designing', 'management', 'analysis', 'analytics',
  'strategy', 'planning', 'engineering', 'modelling', 'modeling', 'pitching', 'building',
  'implementation', 'integration', 'optimization', 'optimisation', 'automation',
  'administration', 'operations', 'programming', 'architecture', 'research',
  'positioning', 'visualization', 'visualisation', 'testing', 'tuning', 'migration',
  'deployment', 'maintenance', 'configuration', 'monitoring', 'reporting', 'writing',
  // Wrappers that mean "the idea of X" rather than a different skill: "ML algorithms",
  // "Machine learning fundamentals", "Agile methodologies".
  'algorithms', 'algorithm', 'techniques', 'methods', 'methodologies', 'methodology',
  'fundamentals', 'basics', 'concepts', 'principles', 'practices',
])

/**
 * The canonical spelling of a skill, or null when the catalog has never seen it.
 *
 * Three tries, each narrower than the last:
 *  1. the string itself;
 *  2. without a trailing parenthetical — CVs write "Domain-Driven Design (DDD)" and
 *     "Value at Risk (VaR)", where the bracket restates the name rather than changing
 *     it;
 *  3. without a trailing activity word — "Chatbot development" is the chatbot skill.
 *     Only words in ACTIVITY_SUFFIX are dropped, and only while something is left.
 */
export function canonicalSkill(skill: string): string | null {
  const direct = CANONICAL.get(normalizeSkill(skill))
  if (direct) return direct

  const raw = (skill ?? '').trim()
  const stripped = raw.replace(/\s*\([^)]*\)\s*$/, '').trim()
  if (stripped && stripped !== raw) {
    const byBracket = CANONICAL.get(normalizeSkill(stripped))
    if (byBracket) return byBracket
  }

  // Peel activity words off the end, one at a time: "Financial risk modelling" tries
  // "Financial risk" before giving up.
  let head = (stripped || raw).split(/\s+/)
  while (head.length > 1 && ACTIVITY_SUFFIX.has(head[head.length - 1].toLowerCase())) {
    head = head.slice(0, -1)
    const hit = CANONICAL.get(normalizeSkill(head.join(' ')))
    if (hit) return hit
  }
  return null
}

/** Which group a skill belongs to. Unknown skills fall to "Additional Skills". */
export function categoryOf(skill: string): SkillCategory {
  const canonical = canonicalSkill(skill)
  return (canonical && CATEGORY_OF.get(canonical)) || FALLBACK_CATEGORY
}

/**
 * Break a multi-skill string into its parts — but only when every part is recognised.
 * A half-understood split is worse than none: it turns one honest chip into two wrong
 * ones and loses the original wording.
 */
export function splitCompound(skill: string): string[] {
  const raw = (skill ?? '').trim()
  if (!raw) return []
  if (canonicalSkill(raw) || isDroppedTool(raw)) return [raw] // e.g. "C/C++", "HTML/CSS"
  const parts = raw.split(/\s*[/,]\s*|\s+&\s+/).map((p) => p.trim()).filter(Boolean)
  if (parts.length < 2) return [raw]
  return parts.every((p) => canonicalSkill(p) || isDroppedTool(p)) ? parts : [raw]
}

/**
 * The Skill Map: canonicalised, de-duplicated, workflow tools removed, grouped, and
 * ordered by how much of this person sits in each group. "Additional Skills" and
 * "Spoken Languages" are pinned last however large they are — one is a catch-all and
 * the other is not a claim about capability.
 */
export function buildSkillMap(skills: string[]): SkillGroup[] {
  const seen = new Set<string>()
  const byCategory = new Map<SkillCategory, string[]>()

  for (const raw of skills ?? []) {
    for (const part of splitCompound(raw)) {
      if (isDroppedTool(part)) continue
      const label = canonicalSkill(part) ?? part.trim()
      if (!label) continue
      const key = normalizeSkill(label)
      if (!key || seen.has(key)) continue
      seen.add(key)
      const category = categoryOf(label)
      byCategory.set(category, [...(byCategory.get(category) ?? []), label])
    }
  }

  const PINNED_LAST: SkillCategory[] = ['Spoken Languages', FALLBACK_CATEGORY]
  const rank = (c: SkillCategory) => CATEGORY_ORDER.indexOf(c)

  return Array.from(byCategory.entries())
    .map(([category, list]) => ({ category, skills: list }))
    .sort((a, b) => {
      const aPinned = PINNED_LAST.indexOf(a.category)
      const bPinned = PINNED_LAST.indexOf(b.category)
      if (aPinned !== bPinned) {
        if (aPinned !== -1 && bPinned !== -1) return aPinned - bPinned
        return aPinned === -1 ? -1 : 1
      }
      // Most of this person's skills first; the catalog's own order breaks ties so the
      // grouping is stable between two candidates with the same counts.
      if (b.skills.length !== a.skills.length) return b.skills.length - a.skills.length
      return rank(a.category) - rank(b.category)
    })
}

/** Every canonical skill the catalog knows — for the coverage audit script. */
export function catalogSize(): { skills: number; aliases: number; categories: number } {
  return { skills: CATEGORY_OF.size, aliases: CANONICAL.size, categories: CATEGORY_ORDER.length }
}
