'use client'

import { useEffect } from 'react'
import { SignUp } from '@clerk/nextjs'
import { trackEvent } from '@/lib/analytics'

export default function SignUpPage() {
  useEffect(() => { trackEvent('sign_up_page_viewed', {}) }, [])
  return <SignUp />
}
