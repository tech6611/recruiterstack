import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { requireOrg } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { brandDomain, normalizeName, type BrandKind } from '@/lib/brand-icon'
import { logger } from '@/lib/logger'

/**
 * GET /api/brand-icon?name=Figma&kind=company — the one place a logo is fetched.
 *
 * WHY A PROXY AND NOT AN <img src="https://provider/…">:
 *  1. Privacy. Hotlinking would hand a third party every candidate's employer and
 *     school list, on every page view, tied to the recruiter's IP.
 *  2. The providers lie about misses. Google's favicon service answers 200 with a
 *     generic globe rather than 404 — byte-identical for iitm.ac.in and for a domain
 *     that doesn't exist. Only the server can see those bytes and turn them into the
 *     404 that lets <BrandIcon> draw its monogram instead of a meaningless globe.
 *  3. One cache, one provider order, one place to change when a provider dies —
 *     which is exactly how we got here (logo.clearbit.com no longer resolves).
 *
 * PROVIDER ORDER: logo.dev when LOGODEV_TOKEN is set (real square brand marks,
 * notably for the .ac.in institutions Google has no record of) → Google's favicon
 * service → 404 → monogram. Measured over our own data, the free tier alone returns a
 * real logo for ~79% of role and education rows by weight.
 *
 * NOT A TIER: fetching https://<domain>/favicon.ico directly. Tested against the
 * domains Google misses and it is worse than useless — 404 HTML, 403s, redirects and
 * TLS failures — so it would buy latency, not logos.
 */

export const runtime = 'nodejs'
// The upstream answer for a domain changes about never; let Vercel hold the route.
export const revalidate = 86400

/** Google's "I have nothing" PNG — one stable 726-byte image at every requested size. */
const GENERIC_GLOBE_MD5 = 'b8a0bf372c762e966cc99ede8682bc71'

const SIZE = 128
const TIMEOUT_MS = 4000
const MAX_BYTES = 256 * 1024

/** Per-process memo. Serverless gives us one per warm instance, which is plenty. */
const memo = new Map<string, { body: Buffer; type: string } | null>()
const MEMO_MAX = 500

/** Hand-corrections from the brand_domains table, loaded once per warm instance. */
let overrides: Map<string, string> | null = null
let overridesAt = 0
const OVERRIDES_TTL_MS = 10 * 60 * 1000

async function loadOverrides(): Promise<Map<string, string>> {
  if (overrides && Date.now() - overridesAt < OVERRIDES_TTL_MS) return overrides
  const next = new Map<string, string>()
  try {
    // brand_domains (migration 151) isn't in the generated Supabase types — the same
    // loose handle the pool and icp tables use until `npm run gen:types` catches up.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createAdminClient() as any
    const { data, error } = await sb
      .from('brand_domains')
      .select('name_norm,kind,domain')
      .limit(5000)
    if (error) throw error
    for (const row of (data ?? []) as { name_norm: string; kind: string; domain: string | null }[]) {
      if (row.domain) next.set(`${row.kind}:${row.name_norm}`, row.domain)
    }
  } catch {
    // The table is optional (migration 151). Without it the resolver's own tables
    // still answer; a missing override list must never break an icon.
  }
  overrides = next
  overridesAt = Date.now()
  return next
}

async function fetchImage(url: string): Promise<{ body: Buffer; type: string } | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow' })
    if (!res.ok) return null
    const type = res.headers.get('content-type') ?? ''
    if (!type.startsWith('image/')) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (!buf.length || buf.length > MAX_BYTES) return null
    return { body: buf, type }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function resolveIcon(domain: string): Promise<{ body: Buffer; type: string } | null> {
  const token = process.env.LOGODEV_TOKEN
  if (token) {
    // fallback=404 so a miss falls through to Google instead of returning logo.dev's
    // own monogram, which would override ours and break the visual system.
    const hit = await fetchImage(
      `https://img.logo.dev/${encodeURIComponent(domain)}?token=${encodeURIComponent(token)}&size=${SIZE}&format=png&fallback=404`,
    )
    if (hit) return hit
  }

  const google = await fetchImage(
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${SIZE}`,
  )
  if (!google) return null
  const md5 = crypto.createHash('md5').update(google.body).digest('hex')
  if (md5 === GENERIC_GLOBE_MD5) return null
  return google
}

export async function GET(req: NextRequest) {
  // Signed-in only: this is an outbound fetcher, and an open one would be someone
  // else's image proxy. The browser already carries the session cookie on <img>.
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult

  const { searchParams } = new URL(req.url)
  const name = (searchParams.get('name') ?? '').trim().slice(0, 200)
  const kind: BrandKind = searchParams.get('kind') === 'school' ? 'school' : 'company'
  if (!name) return new NextResponse(null, { status: 400 })

  const key = `${kind}:${normalizeName(name, kind)}`
  const domain = (await loadOverrides()).get(key) ?? brandDomain(name, kind)
  // No domain worth asking about — the caller draws its monogram.
  if (!domain) return new NextResponse(null, { status: 404 })

  if (!memo.has(domain)) {
    const icon = await resolveIcon(domain)
    if (memo.size >= MEMO_MAX) memo.clear()
    memo.set(domain, icon)
    if (!icon) logger.info('brand-icon: no logo', { domain, kind })
  }
  const icon = memo.get(domain) ?? null

  if (!icon) {
    return new NextResponse(null, {
      status: 404,
      // Cache the miss too: without this every render re-asks a provider that has
      // already said no, and a monogram-heavy page would make dozens of round-trips.
      headers: { 'Cache-Control': 'public, max-age=86400' },
    })
  }

  return new NextResponse(new Uint8Array(icon.body), {
    status: 200,
    headers: {
      'Content-Type': icon.type,
      'Cache-Control': 'public, max-age=2592000, stale-while-revalidate=86400',
    },
  })
}
