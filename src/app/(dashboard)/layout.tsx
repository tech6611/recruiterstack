import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'
import { OrgGate } from '@/components/OrgGate'
import { Copilot } from '@/components/Copilot'
import { AnalyticsIdentify } from '@/components/AnalyticsIdentify'
import { resolveUserIdFromClerk } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { userId: clerkUserId, orgId } = auth()

  if (!clerkUserId) redirect('/sign-in')

  // Gate dashboard on onboarding completion. If the user hasn't been synced
  // to our users table yet (new signup, webhook hasn't fired), send them to
  // onboarding — the layout there re-checks and handles the race.
  if (orgId) {
    const userId = await resolveUserIdFromClerk(clerkUserId).catch(() => null)
    if (!userId) redirect('/onboarding')

    const supabase = createAdminClient()
    const { data: member } = await supabase
      .from('org_members')
      .select('onboarded_at')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .maybeSingle()

    if (!(member as { onboarded_at: string | null } | null)?.onboarded_at) {
      redirect('/onboarding')
    }
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <OrgGate />
      <AnalyticsIdentify />
      <Sidebar />
      <main className="flex-1 overflow-auto">{children}</main>
      <Copilot />
    </div>
  )
}
