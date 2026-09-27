import fs from 'node:fs'
import { SKILL_CATALOG, CATEGORY_ORDER } from '@/lib/skills/catalog'
import { SECTOR_RULES, companySector } from '@/lib/industries/sectors'
import { categoryOf, splitCompound, isDroppedTool } from '@/lib/skills'
import { FALLBACK_CATEGORY } from '@/lib/skills/catalog'

/** Emit the whole skill + industry bucketing as JSON, for a browsable reference page. */
async function main() {
  const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,'')]}))
  const h={apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`}
  const get = async (p:string) => (await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${p}`,{headers:h})).json()

  // Skills: category -> [{label, aliases}]
  const skills: Record<string, { label: string; aliases: string[] }[]> = {}
  for (const [cat, entries] of Object.entries(SKILL_CATALOG as Record<string, string[]>)) {
    skills[cat] = entries.map((e) => { const [label, ...aliases] = e.split('|'); return { label, aliases } })
  }

  // How often each skill string actually appears in the pool, so the page can show
  // what is real rather than only what is possible.
  const profiles: { skills?: string[] }[] = await get('pool_profiles?select=skills&limit=2000')
  const poolSkills: string[] = profiles.flatMap((r) => r.skills ?? [])
  const skillUse = new Map<string, number>()
  for (const s of poolSkills) skillUse.set(s, (skillUse.get(s) ?? 0) + 1)

  // The number that actually matters: not how many DISTINCT strings we can name (most
  // appear once), but how much of a given PERSON's list gets grouped.
  const named = (s: string) => isDroppedTool(s) || splitCompound(s).some((p) => categoryOf(p) !== FALLBACK_CATEGORY)
  const shares = profiles.filter((p) => (p.skills ?? []).length >= 3)
    .map((p) => p.skills!.filter(named).length / p.skills!.length).sort((a, b) => a - b)
  const medianShare = shares.length ? shares[Math.floor(shares.length / 2)] : 0

  // Industries: sector -> the real strings that map to it, with company counts.
  const companies: { display_name: string | null; name_norm: string; industries: string[] }[] =
    await get('company_facts?select=display_name,name_norm,industries&limit=2000')
  const strings = new Map<string, number>()
  for (const c of companies) for (const i of (c.industries ?? [])) strings.set(i, (strings.get(i) ?? 0) + 1)

  const sectors: Record<string, { strings: { s: string; n: number }[]; companies: string[] }> = {}
  for (const r of SECTOR_RULES) sectors[r.sector] = { strings: [], companies: [] }
  const unmapped: { s: string; n: number }[] = []
  for (const [s, n] of strings) {
    const sec = companySector([s])
    if (sec) sectors[sec].strings.push({ s, n }); else unmapped.push({ s, n })
  }
  for (const c of companies) {
    const sec = companySector(c.industries)
    if (sec) sectors[sec].companies.push(c.display_name ?? c.name_norm)
  }
  for (const k of Object.keys(sectors)) {
    sectors[k].strings.sort((a, b) => b.n - a.n)
    sectors[k].companies.sort((a, b) => a.localeCompare(b))
  }

  const out = {
    generated: new Date().toISOString(),
    skills: {
      order: CATEGORY_ORDER,
      byCategory: skills,
      totals: {
        skills: Object.values(skills).reduce((n, v) => n + v.length, 0),
        spellings: Object.values(skills).reduce((n, v) => n + v.reduce((m, e) => m + 1 + e.aliases.length, 0), 0),
        categories: Object.keys(skills).length,
        poolStrings: skillUse.size,
        medianProfileShare: medianShare,
        profilesMeasured: shares.length,
      },
      use: Array.from(skillUse).sort((a, b) => b[1] - a[1]).map(([s, n]) => ({ s, n })),
      // The honest mirror of the industries' unmapped list: strings people actually
      // have that the catalog cannot name, so they land in "Additional Skills".
      ungrouped: Array.from(skillUse)
        .filter(([s]) => !isDroppedTool(s) && splitCompound(s).every((part) => categoryOf(part) === FALLBACK_CATEGORY))
        .sort((a, b) => b[1] - a[1]).map(([s, n]) => ({ s, n })),
    },
    industries: {
      tiers: SECTOR_RULES.map((r) => ({ sector: r.sector, tier: r.tier })),
      bySector: sectors,
      unmapped: unmapped.sort((a, b) => b.n - a.n),
      totals: { sectors: SECTOR_RULES.length, strings: strings.size, companies: companies.length,
                mapped: companies.filter((c) => companySector(c.industries)).length },
    },
  }
  fs.writeFileSync(process.argv[2], JSON.stringify(out))
  console.log(`skills: ${out.skills.totals.skills} in ${out.skills.totals.categories} categories`)
  console.log(`industries: ${out.industries.totals.mapped}/${out.industries.totals.companies} companies, ${out.industries.totals.strings} strings, ${unmapped.length} unmapped`)
}
main().catch(e=>{console.error(e);process.exit(1)})
