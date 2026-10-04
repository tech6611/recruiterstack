import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'
import { logger } from '@/lib/logger'

/**
 * GET /api/candidates/[id]/links
 *
 * The public profiles a candidate is known by — GitHub, personal site, X — for the
 * link row under their name. Returned as raw `{ kind, value }` contact rows; the
 * client's `profileLinks()` decides the network from each URL's host and orders them.
 *
 * WHERE THEY COME FROM. The candidates row only carries `linkedin_url`. Anyone who
 * arrived through the Candidate Pool also has the pool's identities (a GitHub login,
 * the site they link from it) and contacts, joined through this org's own
 * `pool_unlocks` row — so an org only ever sees links for a profile it unlocked.
 * Email and phone are left out on purpose: they are in the contact list already.
 *
 * Lives in Next.js rather than beside `/api/candidates/:id` on Django because the
 * pool tables are only read from here.
 */
export const GET = withCapability('recruiting:view', async (_req, orgId, supabase, { params }) => {
  const { data: candidate } = await supabase
    .from('candidates')
    .select('id, linkedin_url')
    .eq('id', params.id)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!candidate) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // The candidate's own LinkedIn first: profileLinks() keeps the first link per
  // network, and what the recruiter has on the record outranks the pool's copy.
  const links: { kind: string; value: string }[] = []
  if (candidate.linkedin_url) links.push({ kind: 'linkedin', value: candidate.linkedin_url })

  // The pool tables are not in the generated Database type (same as pool-unlock.ts).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any
  try {
    const { data: unlock } = await sb
      .from('pool_unlocks')
      .select('profile_id')
      .eq('org_id', orgId)
      .eq('candidate_id', params.id)
      .limit(1)
      .maybeSingle()

    if (unlock?.profile_id) {
      const [{ data: identities }, { data: contacts }] = await Promise.all([
        sb.from('pool_identities').select('source_key, url').eq('profile_id', unlock.profile_id),
        sb.from('pool_contacts').select('kind, value').eq('profile_id', unlock.profile_id),
      ])
      // GitHub identities first: a `name.github.io` site also reads as GitHub by host,
      // and the profile itself should win that slot over the site.
      const ids = ((identities ?? []) as { source_key: string; url: string | null }[])
        .sort((a, b) => Number(b.source_key === 'github') - Number(a.source_key === 'github'))
      for (const i of ids) {
        // A résumé PDF is a document, not a profile — the Resume tab covers it.
        if (i.url && i.source_key !== 'web:resume') links.push({ kind: 'website', value: i.url })
      }
      for (const c of (contacts ?? []) as { kind: string; value: string }[]) {
        if (c.kind !== 'email' && c.kind !== 'phone') links.push({ kind: c.kind, value: c.value })
      }
    }
  } catch (err) {
    // The row degrades to LinkedIn-only; never fail the profile over a missing link.
    logger.error('[candidate links] pool lookup failed', err, { candidateId: params.id })
  }

  return NextResponse.json({ links })
})
