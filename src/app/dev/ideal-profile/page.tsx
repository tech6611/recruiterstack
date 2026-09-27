import { notFound } from 'next/navigation'
import { TilesPreview } from './TilesPreview'

/**
 * DEVELOPMENT ONLY. Review surface for the ideal-profile pill editors, which live
 * behind auth on a job's Scoring tab. 404 everywhere else.
 */
export const dynamic = 'force-dynamic'

export default function Page() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return <TilesPreview />
}
