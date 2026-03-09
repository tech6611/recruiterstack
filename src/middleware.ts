import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

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
    auth().protect()
  }
})

export const config = {
  matcher: ['/((?!.*\\..*|_next).*)', '/', '/(api|trpc)(.*)'],
}
