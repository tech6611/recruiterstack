import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'

const isPublic = createRouteMatcher([
  '/',
  // Marketing pages — publicly accessible
  '/craigslist',
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
  '/careers/(.*)',
  '/schedule/(.*)',
  '/phone-screen/(.*)',
  '/interviewer/(.*)',
  '/unsubscribe/(.*)',
  // Public APIs
  '/api/leads',
  // NB: no trailing slash before (.*) — must match the bare `/api/apply`
  // (job load + submission), not just `/api/apply/upload`.
  '/api/apply(.*)',
  '/api/intake(.*)',
  '/api/schedule(.*)',
  '/api/phone-screen(.*)',
  '/api/interviewer(.*)',
  '/api/parse-document(.*)',
  '/api/resume/parse(.*)',
  // No-login email-approval links (token-authenticated in the route itself).
  '/api/approvals/act(.*)',
])

// Routes that bypass Clerk entirely (auth handled by the route itself)
function isClerkBypassed(req: NextRequest): boolean {
  return (
    req.nextUrl.pathname.startsWith('/api/queue') ||
    req.nextUrl.pathname.startsWith('/api/sequences/process') ||
    req.nextUrl.pathname.startsWith('/api/webhooks/clerk') ||
    req.nextUrl.pathname.startsWith('/api/webhooks/whatsapp') ||
    req.nextUrl.pathname.startsWith('/api/webhooks/sendgrid') ||
    req.nextUrl.pathname.startsWith('/api/slack/interactions')
  )
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
