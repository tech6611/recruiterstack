/**
 * Slice 2 gate: prove the Crustdata Acquire client → ingest spine works end to end
 * against the REAL API and the REAL pool, spending the minimum possible credit.
 *
 * Run:
 *   npx tsx scripts/crustdata-source-once.ts            # fetch ONE person, ingest, report
 *   npx tsx scripts/crustdata-source-once.ts --cleanup  # delete everything this created
 *
 * SPENDS REAL CREDITS. By design it fetches exactly ONE person (limit 1), so the cost
 * is a fraction of a credit. It writes one profile into the shared pool under source
 * 'vendor:crustdata'; --cleanup removes only rows reachable from a vendor:crustdata
 * identity created here.
 *
 * "never buy twice" is intentionally not wired yet (see domain/crustdata-acquire.ts),
 * so re-running this re-fetches and re-pays. Use --cleanup between runs if you care.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'

const envPath = resolve(process.cwd(), '.env.local')
try {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  }
} catch {
  /* rely on the ambient environment */
}

import { createClient } from '@supabase/supabase-js'
import { sourceFromCrustdata } from '../src/modules/pool/domain/crustdata-acquire'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
  process.exit(1)
}
if (!process.env.CRUSTDATA_API_KEY) {
  console.error('CRUSTDATA_API_KEY must be set')
  process.exit(1)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = createClient(URL, KEY, { auth: { persistSession: false } })
const SOURCE = 'vendor:crustdata'
const cleanup = process.argv.slice(2).includes('--cleanup')

const ok = (s: string) => console.log(`  \x1b[32m✔\x1b[0m ${s}`)
const info = (s: string) => console.log(`  · ${s}`)

// A minimal, real query: one Bengaluru backend engineer. Kept tiny on purpose.
const FILTERS = {
  op: 'and',
  conditions: [
    { field: 'experience.employment_details.current.title', type: '(.)', value: 'Backend Engineer' },
    {
      field: 'professional_network.location.raw',
      type: 'geo_distance',
      value: { location: 'Bengaluru, India', distance: 50, unit: 'km' },
    },
  ],
}

async function cleanUpVendorRows() {
  const { data: ids } = await sb.from('pool_identities').select('profile_id').eq('source_key', SOURCE)
  const profileIds = Array.from(new Set((ids ?? []).map((r: { profile_id: string }) => r.profile_id)))
  if (!profileIds.length) {
    info('nothing to clean up')
    return
  }
  for (const table of ['pool_profile_fields', 'pool_experiences', 'pool_contacts', 'pool_documents', 'pool_identities']) {
    await sb.from(table).delete().in('profile_id', profileIds)
  }
  await sb.from('pool_vendor_records').delete().eq('source_key', SOURCE)
  await sb.from('pool_profiles').delete().in('id', profileIds)
  ok(`cleaned up ${profileIds.length} vendor:crustdata profile(s)`)
}

async function main() {
  if (cleanup) {
    await cleanUpVendorRows()
    return
  }

  info('fetching ONE person from Crustdata (limit 1) …')
  const result = await sourceFromCrustdata(sb, {
    filters: FILTERS,
    perPage: 1,
    maxRecords: 1,
    allowDisabled: true, // vendor:crustdata is seeded disabled; this is a dev run
  })

  ok(`run ${result.runId}`)
  info(`vendor reports ${result.matched} total matches for this query`)
  info(`fetched ${result.fetched} profile(s); credits used: ${result.creditsUsed}`)
  info(
    `ingest → created ${result.ingest.created}, merged ${result.ingest.merged}, ` +
      `unusable ${result.ingest.unusable}, failed ${result.ingest.failed}`,
  )

  // Show the person that actually landed in the pool.
  const { data: ids } = await sb.from('pool_identities').select('profile_id').eq('source_key', SOURCE)
  const profileIds = Array.from(new Set((ids ?? []).map((r: { profile_id: string }) => r.profile_id)))
  const { data: profiles } = await sb
    .from('pool_profiles')
    .select('id, display_name, current_title, current_company, location_raw, experience_years, evidence_as_of, has_linkedin')
    .in('id', profileIds)
  console.log('\n  Landed in pool:')
  for (const p of profiles ?? []) {
    console.log(
      `    • ${p.display_name} — ${p.current_title} @ ${p.current_company} | ${p.location_raw} | ` +
        `evidence_as_of ${p.evidence_as_of} | linkedin ${p.has_linkedin}`,
    )
  }
  console.log('\n  Re-run with --cleanup to remove what this created.')
}

main().catch((err) => {
  console.error('\n  \x1b[31m✖\x1b[0m', err instanceof Error ? err.message : err)
  process.exit(1)
})
