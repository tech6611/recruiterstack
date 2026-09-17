import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getPublicPostingByToken } from '@/lib/postings/public'

/**
 * GET /api/postings/public/:token — candidate-safe view of one posting by its
 * public token. No org auth: the token is the credential. Only LIVE postings of
 * OPEN, non-confidential jobs resolve (unlisted ones included — that's what the
 * direct link is for); everything else is a 404.
 *
 * NB: src/middleware.ts does not currently list /api/postings/public in its
 * public matcher, so a logged-out browser is redirected to sign-in by Clerk.
 * The /apply/p/[token] page therefore resolves the posting server-side via
 * getPublicPostingByToken instead of calling this route. Add
 * '/api/postings/public(.*)' to the middleware's public list to expose it.
 */
export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const posting = await getPublicPostingByToken(createAdminClient(), params.token)
  if (!posting) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(
    { data: posting },
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=60' } },
  )
}
