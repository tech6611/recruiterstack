/**
 * Fill `candidates.avatar_url` for candidates already unlocked from the pool.
 *
 *   npx tsx scripts/backfill-candidate-avatars.ts            # dry run
 *   npx tsx scripts/backfill-candidate-avatars.ts --apply
 *
 * The unlock path now carries a GitHub handle across, but candidates unlocked before
 * that lost the only photo we had of them. This walks `pool_unlocks`, finds the GitHub
 * identity on the source profile, and sets the avatar — after checking GitHub actually
 * serves it, so a deleted account never leaves a broken image on a profile.
 *
 * GitHub only. LinkedIn photos are behind their authentication and their terms forbid
 * taking them; nothing here should ever point at LinkedIn.
 */
import fs from 'node:fs'
import path from 'node:path'
import { githubAvatarUrl } from '../src/lib/ui/avatar'

const APPLY = process.argv.includes('--apply')
const root = process.cwd()
const env = Object.fromEntries(
  fs.readFileSync(path.join(root, '.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
)
const U = env.NEXT_PUBLIC_SUPABASE_URL
const K = env.SUPABASE_SERVICE_ROLE_KEY
if (!U || !K) { console.error('Missing Supabase credentials in .env.local'); process.exit(1) }
const h = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' }
const get = async (p: string) => (await fetch(`${U}/rest/v1/${p}`, { headers: h })).json()

async function main() {
  const unlocks = await get('pool_unlocks?select=profile_id,candidate_id,org_id&limit=2000') as
    { profile_id: string; candidate_id: string | null; org_id: string }[]
  const identities = await get('pool_identities?select=profile_id,external_id&source_key=eq.github&limit=5000') as
    { profile_id: string; external_id: string }[]
  const handleOf = new Map(identities.map((i) => [i.profile_id, i.external_id]))

  let set = 0, missing = 0, gone = 0
  for (const u of unlocks) {
    if (!u.candidate_id) continue
    const handle = handleOf.get(u.profile_id)
    if (!handle) { missing++; continue }
    const url = githubAvatarUrl(handle)
    if (!url) { missing++; continue }

    // Confirm GitHub still serves it — a deleted account would leave a broken image.
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' })
    if (!res.ok) { gone++; console.log(`  ${handle} — GitHub no longer serves this avatar (${res.status})`); continue }

    console.log(`  candidate ${u.candidate_id.slice(0, 8)} → ${url}`)
    set++
    if (!APPLY) continue
    const patch = await fetch(`${U}/rest/v1/candidates?id=eq.${u.candidate_id}&org_id=eq.${encodeURIComponent(u.org_id)}`, {
      method: 'PATCH', headers: h, body: JSON.stringify({ avatar_url: url }),
    })
    if (!patch.ok) { console.error(`    failed: ${patch.status} ${await patch.text()}`); process.exit(1) }
  }

  console.log(`\n${set} avatars ${APPLY ? 'set' : 'would be set'}; ${missing} unlocked candidates have no GitHub handle; ${gone} handles no longer resolve.`)
  if (!APPLY) console.log('DRY RUN — pass --apply to write.')
}

if (process.argv[1]?.endsWith('backfill-candidate-avatars.ts')) {
  main().catch((err) => { console.error(err); process.exit(1) })
}
