/**
 * Seed a Crustdata ATLAS export (CSV) into the Candidate Pool through the normal
 * vendor spine — adapter → claims → resolve/fuse → pool_profiles — so the people are
 * indistinguishable from API-sourced ones (same source_key, ledger row, ingest run).
 *
 * Atlas exports are lighter than the Person Search API: name, title, company,
 * location, seniority, LinkedIn URL. No work history dates, no email. Each row is
 * mapped to the CrustdataPersonPayload shape the adapter already understands, with
 * the export date as the vendor's freshness stamp (never now()).
 *
 * Dry run by default. --apply writes.
 *   npx tsx scripts/seed-crustdata-atlas.ts <file.csv> [--apply] [--credits N] [--label "..."]
 */
import { readFileSync } from 'fs'
import { resolve, basename } from 'path'
const envPath = resolve(process.cwd(), '.env.local')
try {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  }
} catch {}
import { createClient } from '@supabase/supabase-js'
import { CrustdataAdapter } from '../src/modules/pool/vendors/crustdata/adapter'
import type { CrustdataPersonPayload } from '../src/modules/pool/vendors/crustdata/fixtures'
import { ingestVendorRecords } from '../src/modules/pool/domain/ingest'
import { embedPoolProfiles } from '../src/modules/pool/domain/pool-sourcing'
import { startIngestRun, finishIngestRun } from '../src/modules/pool/domain/vendor-ledger'

const args = process.argv.slice(2)
const file = args.find((a) => !a.startsWith('--'))
const APPLY = args.includes('--apply')
const flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
const CREDITS = Number(flag('--credits') ?? 0)
const LABEL = flag('--label') ?? null
if (!file) { console.error('Usage: npx tsx scripts/seed-crustdata-atlas.ts <file.csv> [--apply] [--credits N] [--label "..."]'); process.exit(1) }

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('Missing Supabase env vars'); process.exit(1) }
const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
const SOURCE = 'vendor:crustdata'

/** Minimal RFC-4180 CSV parser (quoted fields, embedded commas/newlines). */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = [], cell = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++ } else q = false }
      else cell += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = '' }
    else cell += c
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row) }
  const [header, ...body] = rows.filter((r) => r.some((x) => x.trim()))
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])))
}

/** The export date is the vendor's freshness stamp: "crustdata-atlas-2026-09-14.csv" → 2026-09-14. */
function exportDate(path: string): string {
  const m = basename(path).match(/(\d{4}-\d{2}-\d{2})/)
  if (!m) { console.error('File name must carry the export date (YYYY-MM-DD) — it becomes the evidence date.'); process.exit(1) }
  return m[1]
}

/** One Atlas row → the payload shape the Crustdata adapter maps. */
function toPayload(r: Record<string, string>, observedAt: string): CrustdataPersonPayload {
  const meta = [r.company_industry, r.company_headcount ? `${r.company_headcount} employees` : ''].filter(Boolean).join(' · ')
  return {
    crustdata_person_id: r.crustdata_person_id,
    basic_profile: {
      name: r.name || null,
      current_title: r.title || null,
      location: { raw: r.location || null, full_location: r.location || null },
    },
    experience: {
      employment_details: {
        current: r.company ? [{
          name: r.company, title: r.title || null, is_default: true,
          seniority_level: r.seniority || null, function_category: r.function || null,
          start_date: null, end_date: null,
          description: meta || null,
        }] : [],
        past: [],
      },
    },
    social_handles: { professional_network_identifier: { profile_url: r.profile_url || null } },
    metadata: { updated_at: observedAt },
  }
}

async function main() {
  console.log(APPLY ? 'MODE: apply\n' : 'MODE: dry run\n')
  const rows = parseCsv(readFileSync(resolve(file!), 'utf-8'))
  const observedAt = exportDate(file!)
  console.log(`${rows.length} row(s) in ${basename(file!)} · evidence date ${observedAt} · credits to record: ${CREDITS}\n`)

  const adapter = new CrustdataAdapter()
  const payloads: CrustdataPersonPayload[] = []
  let bad = 0
  for (const r of rows) {
    const p = toPayload(r, observedAt)
    try {
      const m = adapter.map(p)
      payloads.push(p)
      if (!APPLY) console.log(`  -> ${m.externalId.padEnd(8)} ${(r.name || '?').padEnd(24)} ${(r.title || '').slice(0, 34).padEnd(35)} ${(r.company || '').slice(0, 22).padEnd(23)} ${r.location}`)
    } catch (e) { bad++; console.warn(`  x  row ${r.crustdata_person_id || '?'} (${r.name || '?'}): ${(e as Error).message}`) }
  }
  console.log(`\nmappable=${payloads.length} unusable=${bad}`)
  if (!APPLY) { console.log('\nDry run — nothing written. Re-run with --apply.'); return }

  const runId = await startIngestRun(supabase, {
    sourceKey: SOURCE, orgId: null, jobId: null,
    query: { kind: 'atlas_export', file: basename(file!), exportDate: observedAt, label: LABEL, rows: rows.length, creditsKnown: CREDITS > 0 },
  })
  console.log(`\ningest run ${runId}`)
  try {
    const totals = await ingestVendorRecords(supabase, SOURCE, payloads, { runId, creditsPerRecord: payloads.length ? CREDITS / payloads.length : 0 })
    console.log(`ingested=${totals.ingested} created=${totals.created} merged=${totals.merged} unusable=${totals.unusable} failed=${totals.failed}`)
    const embedded = totals.needsReembed.length ? await embedPoolProfiles(supabase as never, totals.needsReembed) : 0
    console.log(`embedded ${embedded}/${totals.needsReembed.length} (needed for "Source from the market" recall)`)
    await finishIngestRun(supabase, runId, {
      ids_matched: rows.length, ids_bought: payloads.length,
      profiles_created: totals.created, profiles_merged: totals.merged, records_unusable: totals.unusable,
      credits_used: Math.ceil(CREDITS),
    })
    console.log('\nDone.')
  } catch (e) {
    await finishIngestRun(supabase, runId, { error: (e as Error).message }).catch(() => undefined)
    throw e
  }
}
main().catch((err) => { console.error(err); process.exit(1) })
