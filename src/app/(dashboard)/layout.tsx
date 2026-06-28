import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'
import { OrgGate } from '@/components/OrgGate'
import { Copilot } from '@/components/Copilot'
import { AnalyticsIdentify } from '@/components/AnalyticsIdentify'
import { CapabilitiesProvider } from '@/components/providers/CapabilitiesProvider'
import { getOrgId, resolveUserIdFromClerk } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { userId: clerkUserId } = auth()
  if (!clerkUserId) redirect('/sign-in')
  // Use getOrgId() so we fall back to Clerk Management API when the JWT
  // cookie hasn't been refreshed with the active org yet.
  const orgId = await getOrgId()

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
    <CapabilitiesProvider>
      {/* App-shell: the outer frame is fixed to one screen and clips its own
          overflow, so the sidebar stays a full-height fixed panel and ONLY the
          <main> content pane scrolls (overflow-auto keeps both axes — e.g. the
          Kanban board's horizontal scroll). This is the Gmail/Linear/Notion
          pattern and prevents the sidebar from "cutting off" on long pages. */}
      <div className="flex h-screen overflow-hidden bg-slate-50">
        <OrgGate />
        <AnalyticsIdentify />
        <Sidebar />
        <main className="flex-1 overflow-auto">{children}</main>
        <Copilot />
      </div>
    </CapabilitiesProvider>
  )
}
