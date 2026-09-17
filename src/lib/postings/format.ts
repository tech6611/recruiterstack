// Small pure helpers shared by the careers page, the per-posting apply page and
// the XML job feed. No I/O here — keep this importable from anywhere.

/** Posting status trio derived from the boolean `is_live` + `visibility`
 *  (migration 144): draft = not live, live = live and listed, unlisted = live
 *  but reachable only via its direct link. */
export type PostingStatus = 'draft' | 'live' | 'unlisted'

export function postingStatus(p: { is_live: boolean; visibility?: string | null }): PostingStatus {
  if (!p.is_live) return 'draft'
  return p.visibility === 'unlisted' ? 'unlisted' : 'live'
}

/** Public compensation text, e.g. "USD 120,000–150,000", "From USD 120,000",
 *  "Up to USD 150,000". Null when neither bound is set. */
export function formatCompensation(
  min: number | string | null | undefined,
  max: number | string | null | undefined,
  currency: string | null | undefined,
): string | null {
  const lo = toNum(min)
  const hi = toNum(max)
  const cur = (currency ?? '').trim().toUpperCase() || 'USD'
  if (lo != null && hi != null) return `${cur} ${lo.toLocaleString('en-US')}–${hi.toLocaleString('en-US')}`
  if (lo != null) return `From ${cur} ${lo.toLocaleString('en-US')}`
  if (hi != null) return `Up to ${cur} ${hi.toLocaleString('en-US')}`
  return null
}

/** Postgres NUMERIC columns arrive as strings through PostgREST; coerce. */
export function toNum(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

/** Path of the public apply page for a posting: the per-posting link when the
 *  posting has a public token (migration 144), else the job-level apply link. */
export function applyPathFor(publicToken: string | null | undefined, jobApplyToken: string): string {
  return publicToken ? `/apply/p/${publicToken}` : `/apply/${jobApplyToken}`
}

/** Postgres "undefined_column" — raised when a migration hasn't been applied to
 *  the live DB yet. Callers retry without the new columns. */
export function isUndefinedColumn(err: { code?: string; message?: string } | null | undefined): boolean {
  return !!err && (err.code === '42703' || /column .* does not exist/i.test(err.message ?? ''))
}
