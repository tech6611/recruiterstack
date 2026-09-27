import { notFound } from 'next/navigation'
import { CardsPreview } from './CardsPreview'

/**
 * DEVELOPMENT ONLY. Review surface for <CandidateResultCard>. 404 everywhere else;
 * excluded from auth only in development (see middleware.ts).
 */
export const dynamic = 'force-dynamic'

export default function Page() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return <CardsPreview />
}
