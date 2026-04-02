'use client'

import { useEffect } from 'react'
import { SignIn } from '@clerk/nextjs'
import { trackEvent } from '@/lib/analytics'

export default function SignInPage() {
  useEffect(() => { trackEvent('sign_in_page_viewed', {}) }, [])
  return <SignIn />
}
