/**
 * Read-only: dump the recent ICP versions for a job — version, status, when, the
 * location must-have, and the brief/reasoning market — to see whether a regenerate
 * picked up the new San Francisco location. Writes nothing.
 *   npx tsx scripts/dump-job-icps.ts
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

const JOB_ID = '4ad86347-12bd-4378-85c9-3ed1de7c8c0d'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('Missing Supabase env vars'); process.exit(1) }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase: any = createClient(SUPABASE_URL, SERVICE_KEY)

async function main() {
  const { data, error } = await supabase
    .from('icps')
    .select('id, version, status, created_at, must_haves, sourcing_map')
    .eq('job_id', JOB_ID)
    .order('version', { ascending: false })
    .limit(6)
  if (error) { console.error(error.message); process.exit(1) }
  for (const icp of data ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const loc = (icp.must_haves ?? []).find((g: any) => g.kind === 'location' || g.attribute === 'location')
    const brief = icp.sourcing_map?.recruiter_brief
    console.log(`\n── v${icp.version} · ${icp.status} · ${icp.created_at}`)
    console.log('   location must-have:', loc ? JSON.stringify({ kind: loc.kind, values: loc.values, label: loc.label }) : '(none)')
    console.log('   brief.market:', brief?.market ?? '(none)')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    console.log('   # must_haves:', (icp.must_haves ?? []).length, '| structured (kind set):', (icp.must_haves ?? []).filter((g: any) => g.kind).length)
  }
  console.log('')
}
main().catch((e) => { console.error(e); process.exit(1) })
