/**
 * One company, shown once. A brief writes "Boston Consulting Group (BCG)"; the ideal
 * profile splits it into two search terms, "Boston Consulting Group" and "BCG", because
 * a vendor may list the firm under either. Both terms must stay in the search — but
 * shown as two chips, one firm reads as two. PURE, display only.
 */

const SMALL_WORDS = new Set(['of', 'and', 'the', 'for', '&'])

/** "Boston Consulting Group" → "BCG". */
function initialsOf(name: string): string {
  return name
    .split(/[\s-]+/)
    .filter((w) => w && !SMALL_WORDS.has(w.toLowerCase()) && /^[A-Za-z]/.test(w))
    .map((w) => w[0].toUpperCase())
    .join('')
}

const isAcronym = (v: string) => /^[A-Z][A-Z&]{1,5}$/.test(v.trim())

export interface EmployerGroup {
  /** What to show: "Boston Consulting Group (BCG)", or the name alone. */
  display: string
  /** The search terms this chip stands for. */
  members: string[]
}

/**
 * Group search terms so a short name that is another's initials rides with it:
 * ["McKinsey", "Boston Consulting Group", "BCG"] →
 * McKinsey · Boston Consulting Group (BCG). Order follows the first appearance.
 */
export function groupEmployerAliases(values: string[]): EmployerGroup[] {
  const names = values.map((v) => v.trim()).filter(Boolean)
  const groups: EmployerGroup[] = []
  const absorbed = new Set<number>()
  names.forEach((name, i) => {
    if (absorbed.has(i)) return
    if (isAcronym(name) && names.some((other, j) => j !== i && !isAcronym(other) && initialsOf(other) === name)) return
    const aliases = names
      .map((other, j) => ({ other, j }))
      .filter(({ other, j }) => j !== i && isAcronym(other) && !isAcronym(name) && initialsOf(name) === other)
    aliases.forEach(({ j }) => absorbed.add(j))
    const short = aliases.map(({ other }) => other)
    groups.push({ display: short.length ? `${name} (${short.join(', ')})` : name, members: [name, ...short] })
  })
  return groups
}
