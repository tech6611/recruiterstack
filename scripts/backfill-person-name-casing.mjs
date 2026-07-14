// One-time backfill: tidy existing shouting / all-lowercase names in `people`
// into readable title case. Mirrors `normalizePersonName` in
// src/modules/core/domain/people.ts (kept in sync; that helper has unit tests).
//
// Updating `people.name` is enough: migration 062 installs an AFTER UPDATE
// trigger on `people` that propagates the change to every linked `candidates`
// row, so the denormalized copy stays consistent automatically.
//
// Usage:
//   node scripts/backfill-person-name-casing.mjs           # dry run (reads only)
//   node scripts/backfill-person-name-casing.mjs --apply   # write the changes

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

// ── Load .env.local (same approach as the other backfill scripts) ────────────
try {
  const envPath = resolve(process.cwd(), '.env.local')
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  }
} catch {}

const APPLY = process.argv.includes('--apply')
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

// ── Normalizer — mirror of src/modules/core/domain/people.ts ─────────────────
function normalizePersonName(raw) {
  const name = String(raw ?? '').trim().replace(/\s+/g, ' ')
  if (!name) return name
  const upper = name.toUpperCase()
  const lower = name.toLowerCase()
  const isAllUpper = name === upper && name !== lower
  const isAllLower = name === lower && name !== upper
  if (!isAllUpper && !isAllLower) return name // already mixed-case — trust it
  return lower.replace(/(^|[\s'’-])([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase())
}

async function main() {
  console.log(APPLY ? 'MODE: apply\n' : 'MODE: dry run (no changes will be written)\n')

  // Page through the whole table so we don't miss anyone past the 1000-row default.
  const PAGE = 1000
  const rows = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('people')
      .select('id, name')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) { console.error('Query failed:', error.message); process.exit(1) }
    if (!data?.length) break
    rows.push(...data)
    if (data.length < PAGE) break
  }

  const changes = []
  for (const row of rows) {
    const next = normalizePersonName(row.name)
    if (next && next !== row.name) changes.push({ id: row.id, before: row.name, after: next })
  }

  console.log(`Scanned ${rows.length} people row(s); ${changes.length} would change.\n`)
  if (!changes.length) { console.log('Nothing to do.'); return }

  const preview = changes.slice(0, 40)
  for (const c of preview) console.log(`  "${c.before}"  ->  "${c.after}"`)
  if (changes.length > preview.length) console.log(`  … and ${changes.length - preview.length} more`)

  if (!APPLY) {
    console.log('\nDry run only. Re-run with --apply to write these changes.')
    return
  }

  let updated = 0, failed = 0
  for (const c of changes) {
    const { error } = await supabase.from('people').update({ name: c.after }).eq('id', c.id)
    if (error) { console.warn(`  x ${c.id}: ${error.message}`); failed++; continue }
    updated++
  }
  console.log(`\nDone. updated=${updated} failed=${failed}`)
}

main().catch(err => { console.error(err); process.exit(1) })
