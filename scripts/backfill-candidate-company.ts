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
import { generateFromPdf } from '../src/lib/ai/llm'
const APPLY = process.argv.includes('--apply')
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('Missing Supabase env vars'); process.exit(1) }
const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
const BUCKET = 'resumes'
const PROMPT = 'From this resume, identify the candidate\'s CURRENT (most recent) employer. Return strict JSON {"current_company": "<name>"}. If unsure, {"current_company": null}.'
function storagePath(url: string): string {
  const marker = `/${BUCKET}/`
  const idx = url.indexOf(marker)
  const raw = idx >= 0 ? url.slice(idx + marker.length) : url
  return decodeURIComponent(raw.split('?')[0])
}
function parseCompany(text: string): string | null {
  try { const v = JSON.parse(text)?.current_company; if (typeof v === 'string' && v.trim()) return v.trim() } catch {}
  return null
}
async function main() {
  console.log(APPLY ? 'MODE: apply\n' : 'MODE: dry run\n')
  const { data: rows, error } = await supabase.from('candidates')
    .select('id, name, resume_url, current_company').is('current_company', null).not('resume_url', 'is', null)
  if (error) { console.error('Query failed:', error.message); process.exit(1) }
  if (!rows?.length) { console.log('No candidates need backfilling.'); return }
  console.log(`Found ${rows.length} candidate(s).\n`)
  let filled = 0, blank = 0, failed = 0
  for (const row of rows) {
    const label = `${row.name ?? '(no name)'} [${row.id}]`
    try {
      const path = storagePath(row.resume_url as string)
      const { data: file, error: dErr } = await supabase.storage.from(BUCKET).download(path)
      if (dErr || !file) { console.warn(`  x ${label}: download failed (${dErr?.message ?? 'no file'}) path=${path}`); failed++; continue }
      const pdfBase64 = Buffer.from(await file.arrayBuffer()).toString('base64')
      const { text } = await generateFromPdf(PROMPT, pdfBase64, { model: 'claude-sonnet-4-6', maxTokens: 128, json: true, temperature: 0 })
      const company = parseCompany(text)
      if (!company) { console.log(`  - ${label}: no company found`); blank++; continue }
      if (APPLY) {
        const { error: upErr } = await supabase.from('candidates').update({ current_company: company }).eq('id', row.id).is('current_company', null)
        if (upErr) { console.warn(`  x ${label}: ${upErr.message}`); failed++; continue }
        console.log(`  OK ${label}: set "${company}"`)
      } else { console.log(`  -> ${label}: would set "${company}"`) }
      filled++
    } catch (err) { console.warn(`  x ${label}: ${(err as Error).message}`); failed++ }
  }
  console.log(`\nDone. filled=${filled} blank=${blank} failed=${failed}`)
}
main().catch(err => { console.error(err); process.exit(1) })
