import { notFound } from 'next/navigation'
import { BetOptions } from './BetOptions'

/** DEVELOPMENT ONLY. Layout options for the bet cards and the unset profile fields. */
export const dynamic = 'force-dynamic'

export default function Page() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return <BetOptions />
}
