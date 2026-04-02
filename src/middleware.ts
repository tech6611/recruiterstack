import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'

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
])

// Routes that bypass Clerk entirely (auth handled by the route itself)
function isClerkBypassed(req: NextRequest): boolean {
  return req.nextUrl.pathname.startsWith('/api/queue') || req.nextUrl.pathname.startsWith('/drag-test')
}

const clerk = clerkMiddleware((auth, req) => {
  if (!isPublic(req)) {
    const { userId } = auth()
    if (!userId) {
      const signInUrl = new URL('/sign-in', req.url)
      signInUrl.searchParams.set('redirect_url', req.nextUrl.pathname)
      return NextResponse.redirect(signInUrl)
    }
  }
})

export default function middleware(req: NextRequest) {
  // Let queue worker through without Clerk — it uses CRON_SECRET
  if (isClerkBypassed(req)) {
    return NextResponse.next()
  }
  return clerk(req, {} as never)
}

export const config = {
  matcher: ['/((?!.*\\..*|_next).*)', '/', '/(api|trpc)(.*)'],
}
