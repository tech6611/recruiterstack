import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { Zap } from 'lucide-react'
import Link from 'next/link'
import { resolveUserIdFromClerk } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const { userId: clerkUserId, orgId } = auth()
  if (!clerkUserId) redirect('/sign-in?redirect_url=/onboarding')
  if (!orgId)        redirect('/org-setup')

  const userId = await resolveUserIdFromClerk(clerkUserId).catch(() => null)
  if (!userId) redirect('/sign-in?redirect_url=/onboarding')

  // If the user is already onboarded, they don't belong here.
  const supabase = createAdminClient()
  const { data: member } = await supabase
    .from('org_members')
    .select('onboarded_at')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle()

  if ((member as { onboarded_at: string | null } | null)?.onboarded_at) {
    redirect('/dashboard')
  }

  // Child pages render their own <Stepper> (each knows its own slug).
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500 shadow-sm">
              <Zap className="h-3.5 w-3.5 text-emerald-950" />
            </div>
            <span className="text-sm font-bold tracking-tight text-slate-900">RecruiterStack</span>
          </Link>
          <span className="text-xs text-slate-500">Onboarding</span>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-6 py-10">{children}</main>
    </div>
  )
}
