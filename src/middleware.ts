import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const isPublic = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/org-setup(.*)',
  '/apply/(.*)',
  '/intake/(.*)',
  '/api/apply/(.*)',
  '/api/intake/(.*)',
  '/api/parse-document(.*)',
  '/api/resume/parse(.*)',
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
