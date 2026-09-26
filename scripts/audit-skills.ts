/**
 * What the skill catalog still does not recognise.
 *
 *   npm run audit:skills      (or: npx tsx scripts/audit-skills.ts)
 *
 * The catalog cannot be finished, only kept up: 74% of the distinct skill strings in
 * the database appear exactly once. This prints the unrecognised ones by frequency so
 * topping up src/lib/skills/catalog.ts stays a ten-minute job. Run it after a big
 * import, or whenever the Skill Map starts looking thin.
 *
 * Read-only. Uses the service-role key, like the other scripts here.
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  buildSkillMap,
  canonicalSkill,
  catalogSize,
  isDroppedTool,
  splitCompound,
} from '../src/lib/skills'

const root = process.cwd()
const env = Object.fromEntries(
  fs.readFileSync(path.join(root, '.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    }),
)

const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const get = async (p: string) =>
  (await fetch(`${url}/rest/v1/${p}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })).json()

async function main() {
  const counts = new Map<string, number>()
  const profiles: string[][] = []
  const add = (s: string) => {
    const t = (s ?? '').trim()
    if (t) counts.set(t, (counts.get(t) ?? 0) + 1)
  }

  for (const r of (await get('candidates?select=skills&limit=1000')) as { skills: string[] | null }[]) {
    if ((r.skills ?? []).length) profiles.push(r.skills!)
    ;(r.skills ?? []).forEach(add)
  }
  for (let offset = 0; ; offset += 1000) {
    const rows = (await get(`pool_profiles?select=skills&limit=1000&offset=${offset}`)) as { skills: string[] | null }[]
    if (!rows.length) break
    for (const r of rows) {
      if ((r.skills ?? []).length) profiles.push(r.skills!)
      ;(r.skills ?? []).forEach(add)
    }
    if (rows.length < 1000) break
  }

  const size = catalogSize()
  let dropped = 0
  let knownMentions = 0
  let unknownMentions = 0
  const unknown: [string, number][] = []

  for (const [skill, count] of Array.from(counts)) {
    const parts = splitCompound(skill)
    if (parts.every((p) => isDroppedTool(p))) { dropped += count; continue }
    if (parts.every((p) => canonicalSkill(p) || isDroppedTool(p))) knownMentions += count
    else { unknown.push([skill, count]); unknownMentions += count }
  }

  // The number that matters: how much of ONE person's chip list gets a real heading.
  const pct = profiles
    .map((skills) => {
      const map = buildSkillMap(skills)
      const total = map.reduce((a, g) => a + g.skills.length, 0)
      const extra = map.find((g) => g.category === 'Additional Skills')?.skills.length ?? 0
      return total ? (total - extra) / total : 1
    })
    .sort((a, b) => a - b)

  console.log(`catalog     : ${size.skills} skills, ${size.aliases} spellings, ${size.categories} categories`)
  console.log(`vocabulary  : ${counts.size} distinct strings across ${profiles.length} profiles`)
  console.log(`mentions    : ${knownMentions} recognised, ${dropped} dropped as tools, ${unknownMentions} unknown`)
  console.log(`per profile : median ${(pct[Math.floor(pct.length / 2)] * 100).toFixed(0)}% of chips get a named category`)
  console.log('\nTop unrecognised — add the worthwhile ones to src/lib/skills/catalog.ts:\n')
  for (const [skill, count] of unknown.sort((a, b) => b[1] - a[1]).slice(0, 60)) {
    console.log(`  ${String(count).padStart(4)}  ${skill}`)
  }
}

main().catch((err) => { console.error(err); process.exit(1) })
