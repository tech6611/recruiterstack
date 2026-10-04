import { notFound } from 'next/navigation'
import { ProfileHeaderPreview } from './ProfileHeaderPreview'

/**
 * DEVELOPMENT ONLY. Review surface for <CandidateHeader> across the shapes that broke
 * its consistency. 404 in every other environment; excluded from auth only in
 * development (see middleware.ts).
 */
export const dynamic = 'force-dynamic'

export default function Page() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return <ProfileHeaderPreview />
}
