import { notFound } from 'next/navigation'
import { BetRowsPreview } from './BetRowsPreview'

/** DEVELOPMENT ONLY. The Scoring tab's stacked bets, each with its own ideal profile. */
export const dynamic = 'force-dynamic'

export default function Page() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return <BetRowsPreview />
}
