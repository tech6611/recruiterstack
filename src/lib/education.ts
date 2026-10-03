/**
 * TIDY A PERSON'S EDUCATION. Vendors send it as they scraped it: Crustdata gave one
 * person "XLRI Jamshedpur · MBA · 2023" AND "XLRI - Xavier School of Management,
 * Jamshedpur · Master of Business Administration", "BIT Mesra · Bachelor of Architecture
 * · 2021" AND "BIT Mesra · Undergraduate · 2021", the same CBSE line twice — in no order.
 *
 * Merged: two entries are one when they name the same institution (one name's words
 * inside the other's — "XLRI Jamshedpur" ⊂ "XLRI - Xavier School of Management,
 * Jamshedpur"), the same level of qualification (MBA = Master of Business
 * Administration; "Undergraduate" fits any degree) and no conflicting years. The fuller
 * entry wins and borrows what it lacks from the other.
 * Ordered: most recent first, undated last — the way a CV reads. PURE.
 */

export interface EducationLike {
  degree?: string | null
  field?: string | null
  school?: string | null
  year?: number | null
}

/** Words that never tell two institutions apart. */
const NOISE = new Set(['the', 'of', 'and', 'at', 'in', 'for', 'india'])

function schoolWords(s: string | null | undefined): Set<string> {
  return new Set(
    String(s ?? '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/).filter((w) => w && !NOISE.has(w)),
  )
}

/** Same institution: every word of one name appears in the other. */
function sameSchool(a: string | null | undefined, b: string | null | undefined): boolean {
  const [x, y] = [schoolWords(a), schoolWords(b)]
  if (!x.size || !y.size) return false
  const [small, big] = x.size <= y.size ? [x, y] : [y, x]
  if (!Array.from(small).some((w) => w.length >= 3)) return false
  return Array.from(small).every((w) => big.has(w))
}

type Level = 'doctor' | 'master' | 'bachelor' | 'diploma' | 'school' | null

/** The level a qualification names; null when it names none ("Undergraduate" names a stage, not a degree). */
function level(degree: string | null | undefined): Level {
  const d = ` ${String(degree ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `
  if (/ (phd|ph d|doctor|doctorate|dphil) /.test(d)) return 'doctor'
  if (/ (master|masters|mba|pgdm|pgp|mtech|m tech|msc|m sc|ms|ma|mcom|mca|post graduate|postgraduate|pgdba) /.test(d)) return 'master'
  if (/ (bachelor|bachelors|btech|b tech|be|b e|bsc|b sc|ba|bcom|b com|bba|bca|barch|b arch|llb) /.test(d)) return 'bachelor'
  if (/ (diploma) /.test(d)) return 'diploma'
  if (/ (cbse|icse|isc|hsc|ssc|class|grade|high school|secondary|senior secondary|10th|12th|xii|x) /.test(d)) return 'school'
  return null
}

/** A word that only says a stage of study, so it fits any degree at that school. */
const GENERIC = /^\s*(undergraduate|under graduate|graduate|postgraduate|post graduate|degree|student|studies)?\s*$/i

function sameQualification(a: EducationLike, b: EducationLike): boolean {
  if (GENERIC.test(a.degree ?? '') || GENERIC.test(b.degree ?? '')) return true
  const [la, lb] = [level(a.degree), level(b.degree)]
  if (la && lb) return la === lb
  return String(a.degree).trim().toLowerCase() === String(b.degree).trim().toLowerCase()
}

function sameEntry(a: EducationLike, b: EducationLike): boolean {
  if (!sameSchool(a.school, b.school)) return false
  if (a.year != null && b.year != null && a.year !== b.year) return false
  if (!sameQualification(a, b)) return false
  // Two undated qualifications at one school are one entry only when one's wording sits
  // inside the other's ("Bachelor of Science and Arts" ⊂ "… - BSA") — Class X and
  // Class XII stay two.
  if (a.year == null && b.year == null && !GENERIC.test(a.degree ?? '') && !GENERIC.test(b.degree ?? '')) {
    const [x, y] = [schoolWords(a.degree), schoolWords(b.degree)]
    const [small, big] = x.size <= y.size ? [x, y] : [y, x]
    if (!Array.from(small).every((w) => big.has(w))) return false
  }
  return true
}

/** How much an entry says: a year, a specific degree, a field. */
const fullness = (e: EducationLike) => (e.year != null ? 4 : 0) + (e.degree && !GENERIC.test(e.degree) ? 2 : 0) + (e.field ? 1 : 0)

export function tidyEducation<T extends EducationLike>(entries: T[] | null | undefined): T[] {
  const kept: T[] = []
  for (const e of entries ?? []) {
    if (!e || !(e.school || e.degree || e.field)) continue
    const i = kept.findIndex((k) => sameEntry(k, e))
    if (i < 0) { kept.push(e); continue }
    const [base, other] = fullness(e) > fullness(kept[i]) ? [e, kept[i]] : [kept[i], e]
    kept[i] = {
      ...base,
      year: base.year ?? other.year ?? null,
      field: base.field ?? other.field ?? null,
      degree: base.degree && !GENERIC.test(base.degree) ? base.degree : (other.degree || base.degree || null),
    }
  }
  // Most recent first; undated last; otherwise as given.
  return kept
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (b.e.year ?? -Infinity) - (a.e.year ?? -Infinity) || a.i - b.i)
    .map(({ e }) => e)
}
