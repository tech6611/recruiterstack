/**
 * Backfill pool_profiles.location_{city,region,country,country_code} from location_raw
 * for every profile already in the pool (migration 147 added the columns empty).
 *
 * Dry run by default — prints what it would write. Pass --apply to write.
 *   npx tsx scripts/backfill-pool-locations.ts
 *   npx tsx scripts/backfill-pool-locations.ts --apply
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
const envPath = resolve(process.cwd(), '.env.local')
try {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  }
} catch {}
import { createClient } from '@supabase/supabase-js'
import { resolveLocationParts } from '../src/modules/pool/domain/normalize'

const APPLY = process.argv.includes('--apply')
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('Missing Supabase env vars'); process.exit(1) }
const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

type Row = { id: string; location_raw: string | null; location_city: string | null; location_region: string | null; location_country: string | null; location_country_code: string | null }

async function main() {
  console.log(APPLY ? 'MODE: apply\n' : 'MODE: dry run\n')
  const { data, error } = await supabase
    .from('pool_profiles')
    .select('id, location_raw, location_city, location_region, location_country, location_country_code')
    .not('location_raw', 'is', null)
    .limit(5000)
  if (error) { console.error('Query failed:', error.message); process.exit(1) }
  const rows = (data ?? []) as Row[]
  console.log(`${rows.length} profile(s) with a raw location.\n`)

  let changed = 0, same = 0, unresolved = 0, failed = 0
  const byCountry = new Map<string, number>()
  for (const r of rows) {
    const parts = resolveLocationParts(r.location_raw)
    const next = {
      location_city: parts?.city ?? null,
      location_region: parts?.region ?? null,
      location_country: parts?.country ?? null,
      location_country_code: parts?.country_code ?? null,
    }
    if (!parts) { unresolved++; console.log(`  ?  ${JSON.stringify(r.location_raw)} → nothing recognised`); continue }
    byCountry.set(next.location_country ?? '—', (byCountry.get(next.location_country ?? '—') ?? 0) + 1)
    const isSame = (['location_city', 'location_region', 'location_country', 'location_country_code'] as const)
      .every((k) => (r[k] ?? null) === next[k])
    if (isSame) { same++; continue }
    const label = `${JSON.stringify(r.location_raw)} → ${[next.location_city, next.location_region, next.location_country].map((x) => x ?? '·').join(' / ')}`
    if (APPLY) {
      const { error: upErr } = await supabase.from('pool_profiles').update(next).eq('id', r.id)
      if (upErr) { console.warn(`  x  ${label}: ${upErr.message}`); failed++; continue }
      console.log(`  OK ${label}`)
    } else {
      console.log(`  -> ${label}`)
    }
    changed++
  }
  console.log(`\nBy country: ${Array.from(byCountry.entries()).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`).join(' · ')}`)
  console.log(`Done. ${APPLY ? 'updated' : 'would update'}=${changed} unchanged=${same} unresolved=${unresolved} failed=${failed}`)
}
main().catch((err) => { console.error(err); process.exit(1) })
