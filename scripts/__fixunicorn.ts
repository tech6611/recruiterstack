import fs from 'node:fs'
/**
 * Correct `is_unicorn` on rows already written, using only what is stored — no new Exa
 * requests, so it costs nothing. A unicorn is a venture-backed PRIVATE company over
 * $1B; without a venture stage the flag is wrong however valuable the company is.
 */
async function main() {
  const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,'')]}))
  const U=env.NEXT_PUBLIC_SUPABASE_URL, K=env.SUPABASE_SERVICE_ROLE_KEY
  const h={apikey:K,Authorization:`Bearer ${K}`,'Content-Type':'application/json'}
  const rows = await (await fetch(`${U}/rest/v1/company_facts?select=name_norm,display_name,latest_stage,is_unicorn&is_unicorn=is.true&limit=5000`,{headers:h})).json() as {name_norm:string;display_name:string|null;latest_stage:string|null}[]
  if (!Array.isArray(rows)) { console.log('company_facts not readable yet'); return }
  const VENTURE = /^(pre-seed|seed|angel|growth|series [a-k])$/i
  const wrong = rows.filter(r => !r.latest_stage || !VENTURE.test(r.latest_stage))
  console.log(`${rows.length} rows flagged unicorn; ${wrong.length} have no venture stage and are wrong:`)
  for (const r of wrong.slice(0, 25)) console.log(`   ${(r.display_name ?? r.name_norm).padEnd(38)} stage=${r.latest_stage ?? '—'}`)
  if (!process.argv.includes('--apply')) { console.log('\nDRY RUN — pass --apply'); return }
  for (const r of wrong) {
    const res = await fetch(`${U}/rest/v1/company_facts?name_norm=eq.${encodeURIComponent(r.name_norm)}`, { method:'PATCH', headers:h, body: JSON.stringify({ is_unicorn: false }) })
    if (!res.ok) { console.error(`failed on ${r.name_norm}: ${res.status}`); process.exit(1) }
  }
  console.log(`\ncorrected ${wrong.length} rows.`)
}
main().catch(e=>{console.error(e);process.exit(1)})
