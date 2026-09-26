import { notFound } from 'next/navigation'
import { CandidateHistoryPreview } from './CandidateHistoryPreview'

/**
 * DEVELOPMENT ONLY. Review surface for <ExperienceTimeline> / <EducationList>. 404 in
 * every other environment; excluded from auth only in development (see middleware.ts).
 */
export const dynamic = 'force-dynamic'

export default function Page() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return <CandidateHistoryPreview />
}
