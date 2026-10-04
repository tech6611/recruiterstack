import { notFound } from 'next/navigation'
import { SourceOverhaulPreview } from './SourceOverhaulPreview'

/** DEVELOPMENT ONLY. Three takes on the Scoring overhaul: brief on top, bets + people below. */
export const dynamic = 'force-dynamic'

export default function Page() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return <SourceOverhaulPreview />
}
