import { notFound } from 'next/navigation'
import { PoolPanelPreview } from './PoolPanelPreview'

/**
 * DEVELOPMENT ONLY. Review surface for <PoolProfilePanel> — the pool's drawer, which
 * renders the same components as the ATS profile. 404 everywhere else.
 */
export const dynamic = 'force-dynamic'

export default function Page() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return <PoolPanelPreview />
}
