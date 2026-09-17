import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/server'
import { getPublicPostingByToken } from '@/lib/postings/public'
import { ApplyExperience, ApplyLinkInvalid } from '../../ApplyPage'

// Per-posting apply link: /apply/p/<job_postings.public_token> (migration 144).
// The posting is resolved server-side (the token is the credential — no login),
// then the shared apply experience renders against the JOB's apply token with
// the posting's title / public JD / location / comp layered on top. Unlisted
// postings resolve here too: this link is the only way to reach them.
export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const posting = await getPublicPostingByToken(createAdminClient(), params.token)
  if (!posting) return { title: 'Apply', robots: { index: false } }
  const company = posting.company_name ? ` — ${posting.company_name}` : ''
  const description = posting.social_description
    ?? ([posting.location, posting.compensation].filter(Boolean).join(' · ') || undefined)
  return {
    title: `${posting.title}${company}`,
    description: description || undefined,
    openGraph: { title: `${posting.title}${company}`, description: description || undefined, type: 'website' },
    // Unlisted postings are reachable by link only — keep them out of search.
    robots: posting.visibility === 'unlisted' ? { index: false, follow: false } : undefined,
  }
}

export default async function PostingApplyPage({ params }: { params: { token: string } }) {
  const posting = await getPublicPostingByToken(createAdminClient(), params.token)
  if (!posting) return <ApplyLinkInvalid />
  return (
    <ApplyExperience
      token={posting.apply_token}
      overrides={{
        title: posting.title,
        description: posting.description,
        location: posting.location,
        salary: posting.salary,
      }}
    />
  )
}
