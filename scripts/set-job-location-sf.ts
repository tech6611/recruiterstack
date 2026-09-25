/**
 * Point ONE job at a San Francisco location (fixes the ideal-profile / brief
 * location drift for job 4ad86347… "Founding Engineering Manager").
 *
 * Does NOT rename the shared location record — it finds-or-creates a San Francisco
 * location for the job's org and repoints jobs.location_id at it. Every other job
 * keeps its own location. After this, REGENERATE the ICP in the app so the ideal
 * profile rebuilds from the new location.
 *
 * Dry run by default — prints the current state + the plan, writes nothing.
 *   npx tsx scripts/set-job-location-sf.ts
 *   npx tsx scripts/set-job-location-sf.ts --apply
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

const APPLY = process.argv.includes('--apply')
const JOB_ID = '4ad86347-12bd-4378-85c9-3ed1de7c8c0d'
const SF = { name: 'San Francisco', city: 'San Francisco', state: 'California', country: 'United States' }

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('Missing Supabase env vars'); process.exit(1) }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase: any = createClient(SUPABASE_URL, SERVICE_KEY)

const isSF = (l: { name?: string | null; city?: string | null }) =>
  /san francisco/i.test(l.city ?? '') || /san francisco/i.test(l.name ?? '')

async function main() {
  console.log(APPLY ? '\nMODE: APPLY (will write)\n' : '\nMODE: dry run (no writes)\n')

  // 1. The job + its current location.
  const { data: job, error: jErr } = await supabase
    .from('jobs')
    .select('id, title, org_id, location_id, location:locations(id, name, city, state, country)')
    .eq('id', JOB_ID)
    .maybeSingle()
  if (jErr) { console.error('Job read failed:', jErr.message); process.exit(1) }
  if (!job) { console.error('Job not found:', JOB_ID); process.exit(1) }
  console.log('Job:', job.title)
  console.log('  org_id:', job.org_id)
  console.log('  current location_id:', job.location_id)
  console.log('  current location:', job.location ? `${job.location.name ?? '—'} (city=${job.location.city ?? '—'}, ${job.location.state ?? '—'}, ${job.location.country ?? '—'})` : '(none)')

  // 2. The org's existing locations — is there already a San Francisco?
  const { data: locs, error: lErr } = await supabase
    .from('locations')
    .select('id, name, city, state, country')
    .eq('org_id', job.org_id)
  if (lErr) { console.error('Locations read failed:', lErr.message); process.exit(1) }
  console.log(`\nOrg has ${locs?.length ?? 0} location(s):`)
  for (const l of locs ?? []) console.log(`  - ${l.name ?? '—'} (city=${l.city ?? '—'})  ${isSF(l) ? '  ← San Francisco' : ''}  [${l.id}]`)
  const existingSF = (locs ?? []).find(isSF)

  console.log('\nPlan:')
  if (existingSF) console.log(`  • Point this job at the existing San Francisco location [${existingSF.id}].`)
  else console.log(`  • Create a San Francisco location for this org, then point this job at it.`)
  console.log('  • The shared "New York" record is left untouched (other jobs keep it).')
  console.log('  • You then Regenerate the ICP in the app to rebuild the ideal profile.\n')

  if (!APPLY) { console.log('Dry run — nothing written. Re-run with --apply to make the change.\n'); return }

  // 3. Find-or-create the SF location.
  let sfId = existingSF?.id
  if (!sfId) {
    const { data: created, error: cErr } = await supabase
      .from('locations')
      .insert({ org_id: job.org_id, ...SF })
      .select('id')
      .single()
    if (cErr) { console.error('Create SF location failed:', cErr.message); process.exit(1) }
    sfId = created.id
    console.log('Created San Francisco location:', sfId)
  }

  // 4. Repoint the job.
  const { error: uErr } = await supabase.from('jobs').update({ location_id: sfId }).eq('id', JOB_ID)
  if (uErr) { console.error('Job update failed:', uErr.message); process.exit(1) }

  const { data: after } = await supabase
    .from('jobs')
    .select('location:locations(name, city, state)')
    .eq('id', JOB_ID)
    .maybeSingle()
  console.log('\n✅ Done. Job location is now:', after?.location ? `${after.location.name} (city=${after.location.city})` : '(?)')
  console.log('   Next: open the job → Scoring tab → Regenerate the ICP to rebuild the ideal profile.\n')
}

main().catch((e) => { console.error(e); process.exit(1) })
