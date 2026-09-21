/**
 * Structured must-haves audit (docs/structured-must-haves-plan.md).
 *
 *   npx tsx scripts/audit-gates.ts             # every approved ICP: gates → converted form → screening
 *   npx tsx scripts/audit-gates.ts --job <id>  # + evaluate the job's cached shortlist deterministically (no AI calls)
 *
 * Read-only. Shows exactly what the read-time conversion produces and what the
 * evaluator would say for real people, so a rule change can be checked against data
 * before it ships.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
try {
  for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  }
} catch {}
import { createClient } from '@supabase/supabase-js'
import type { Icp, IcpMustHave } from '../src/lib/types/icp'
import { withConvertedGates } from '../src/modules/ats/domain/icp'
import { getJobRoleContext } from '../src/modules/ats/domain/job-role-context'
import { evaluateMustHaves, isCriterion, toCriterion, criterionLabel, SCREENING_ATTRIBUTE } from '../src/lib/ai/gate-evaluator'
import { resolveSearchSpec } from '../src/modules/pool/search/spec-from-brief'
import { compileSpec } from '../src/modules/pool/vendors/crustdata/compile-spec'
import { loadAcquiredLevels } from '../src/modules/pool/domain/crustdata-acquire'

const args = process.argv.slice(2)
const jobArg = args.includes('--job') ? args[args.indexOf('--job') + 1] : null
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('Missing Supabase env vars'); process.exit(1) }
const sb = createClient(SUPABASE_URL, SERVICE_KEY)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anySb = sb as any

function describe(g: IcpMustHave): string {
  const c = toCriterion(g)
  if (c) return `[${c.kind}] ${criterionLabel(c)}`
  if (g.attribute === SCREENING_ATTRIBUTE) return `[screening] ${g.label}`
  return `[legacy${g.attribute ? ` ${g.attribute}` : ''}] ${g.label}`
}

async function main() {
  const { data: icps, error } = await sb.from('icps').select('*').eq('status', 'approved').order('updated_at', { ascending: false })
  if (error) throw error
  let total = 0, structured = 0, screening = 0, legacy = 0
  for (const row of (icps ?? []) as Icp[]) {
    const ctx = await getJobRoleContext(anySb, row.org_id, row.job_id).catch(() => null)
    const icp = withConvertedGates(row, ctx?.market ?? null)
    console.log(`\n═══ job ${row.job_id.slice(0, 8)} · ICP v${row.version} · market ${ctx?.market ? [ctx.market.city, ctx.market.state, ctx.market.country].filter(Boolean).join(', ') : '—'}`)
    for (const g of row.must_haves ?? []) {
      const after = icp.must_haves.filter((x) => x.id === g.id || x.id === `${g.id}-fn`)
      total++
      for (const a of after) { if (isCriterion(a)) structured++; else if (a.attribute === SCREENING_ATTRIBUTE) screening++; else legacy++ }
      console.log(`  ${g.label.slice(0, 90).padEnd(92)} → ${after.map(describe).join(' + ') || '(dropped)'}`)
    }
    const { spec } = resolveSearchSpec(icp, { roleContext: ctx ?? undefined })
    const compiled = compileSpec(spec)
    console.log(`  base line → Crustdata: ${compiled.common.map((c) => c.label).filter((v, i, a) => a.indexOf(v) === i).join(' · ') || '(none)'}`)
    if (compiled.unsupported.length) console.log(`  unsupported: ${compiled.unsupported.map((u) => `${u.requirement} (${u.reason})`).join(' · ')}`)
  }
  console.log(`\n${icps?.length ?? 0} approved ICPs · ${total} gates → structured ${structured} · screening ${screening} · still legacy ${legacy}`)

  if (!jobArg) return
  console.log(`\n═══ deterministic evaluation of the cached shortlist for job ${jobArg.slice(0, 8)} (no AI calls)`)
  const { data: snap } = await sb.from('pool_sourcing_matches').select('org_id, matches').eq('job_id', jobArg).maybeSingle()
  if (!snap) { console.log('  no cached shortlist'); return }
  const { data: row } = await sb.from('icps').select('*').eq('org_id', snap.org_id).eq('job_id', jobArg).eq('status', 'approved').maybeSingle()
  if (!row) { console.log('  no approved ICP'); return }
  const ctx = await getJobRoleContext(anySb, snap.org_id, jobArg).catch(() => null)
  const icp = withConvertedGates(row as Icp, ctx?.market ?? null)
  const gates = icp.must_haves.filter(isCriterion)
  // Vendor-verification comes from what each run actually sent, recorded per bought
  // person — never from today's plan (the New York run predates the record: 0 ids).
  const acquired = await loadAcquiredLevels(anySb, jobArg)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const matches = (snap.matches ?? []) as any[]
  const ids = matches.map((m) => m.profile_id)
  const [{ data: profiles }, { data: exps }, { data: edu }] = await Promise.all([
    sb.from('pool_profiles').select('id, display_name, experience_years, location_raw, current_title, current_company, skills').in('id', ids),
    sb.from('pool_experiences').select('profile_id, title, employer, is_current').in('profile_id', ids),
    sb.from('pool_profile_fields').select('profile_id, value').eq('field', 'education').in('profile_id', ids),
  ])
  console.log(`  gates: ${gates.map((g) => criterionLabel(toCriterion(g)!)).join(' · ')}`)
  const recorded = Object.values(acquired).filter((a) => a.vendorGateIds?.length).length
  console.log(`  bought people with a recorded vendor query: ${recorded} of ${Object.keys(acquired).length}\n`)
  for (const m of matches) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = (profiles ?? []).find((x: any) => x.id === m.profile_id)
    if (!p) continue
    const history = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      experiences: (exps ?? []).filter((e: any) => e.profile_id === p.id),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      education: ((edu ?? []).find((e: any) => e.profile_id === p.id)?.value ?? []) as { school?: string | null; year?: number | null }[],
    }
    const ids = acquired[p.id]?.vendorGateIds
    const verdicts = evaluateMustHaves(gates, { experience_years: p.experience_years, location: p.location_raw, current_title: p.current_title, current_company: p.current_company, skills: p.skills }, history, { vendorFilteredGateIds: ids?.length ? new Set(ids) : null })
    const cells = verdicts.map((v) => `${v.pass === true ? '✓' : v.pass === false ? '✗' : '?'}${v.verified_by === 'vendor' ? 'ᵛ' : ''}`).join(' ')
    const why = verdicts.filter((v) => v.pass !== true).map((v) => `${v.kind}: ${v.reason}`).join(' · ')
    console.log(`  ${String(p.display_name).padEnd(22)} ${m.acquired ? 'bought ' : 'pool   '} ${cells.padEnd(12)} ${why}`)
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
