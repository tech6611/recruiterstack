import { notFound } from 'next/navigation'
import { SourcingPreview } from './SourcingPreview'

/**
 * DEVELOPMENT ONLY. Renders the Source-tab and Scoring-tab sourcing components from a
 * fixture of a real job (no login, no network), so their layout can be reviewed at
 * localhost before deploying. 404 in every other environment; also excluded from
 * auth only in development (see middleware.ts).
 */
export const dynamic = 'force-dynamic'

export default function Page() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return <SourcingPreview />
}
