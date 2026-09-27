import { notFound } from 'next/navigation'
import { PoolListPreview } from './PoolListPreview'

/** DEVELOPMENT ONLY. Review surface for the pool's card list and side pane. */
export const dynamic = 'force-dynamic'

export default function Page() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return <PoolListPreview />
}
