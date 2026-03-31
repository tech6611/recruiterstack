import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const isPublic = createRouteMatcher([
  '/',
  // Marketing pages — publicly accessible
  '/features',
  '/agents',
  '/pricing',
  '/about',
  '/blog',
  '/contact',
  '/privacy',
  '/terms',
  // Auth flows
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/org-setup(.*)',
  // External-facing flows
  '/apply/(.*)',
  '/intake/(.*)',
  // Public APIs
  '/api/leads',
  '/api/apply/(.*)',
  '/api/intake/(.*)',
  '/api/parse-document(.*)',
  '/api/resume/parse(.*)',
  // Queue worker (protected by CRON_SECRET, not Clerk)
  '/api/queue(.*)',
])

export default clerkMiddleware((auth, req) => {
  if (!isPublic(req)) {
    const { userId } = auth()
    if (!userId) {
      const signInUrl = new URL('/sign-in', req.url)
      signInUrl.searchParams.set('redirect_url', req.nextUrl.pathname)
      return NextResponse.redirect(signInUrl)
    }
  }
})

export const config = {
  matcher: ['/((?!.*\\..*|_next).*)', '/', '/(api|trpc)(.*)'],
}
