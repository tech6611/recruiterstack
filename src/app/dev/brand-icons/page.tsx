import { notFound } from 'next/navigation'
import { BrandIconPreview } from './BrandIconPreview'

/**
 * DEVELOPMENT ONLY. Review surface for <BrandIcon> — see BrandIconPreview for what it
 * is actually asking you to judge. 404 in every other environment; excluded from auth
 * only in development (see middleware.ts).
 */
export const dynamic = 'force-dynamic'

export default function Page() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return <BrandIconPreview />
}
