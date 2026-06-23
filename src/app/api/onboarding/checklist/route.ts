import { NextRequest, NextResponse } from 'next/server'
import { requireOrgAndUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { getViewerScope } from '@/lib/rbac'
import { computeChecklist, syncOnboardingNotifications } from '@/lib/onboarding/checklist'

/**
 * GET /api/onboarding/checklist[?sync=1]
 *
 * Returns the first-run setup checklist for the current org + user, with each
 * step's done state computed live. Admins see org + personal steps; everyone
 * sees their personal steps. With ?sync=1 it also reconciles the per-step
 * notification nudges (the dashboard banner passes it once on load).
 */
export async function GET(req: NextRequest) {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth
  const { orgId, userId } = auth

  const supabase = createAdminClient()
  const scope = await getViewerScope(supabase, orgId, userId)
  const isAdmin = scope.isAdmin || scope.isOwner || scope.capabilities.has('settings:edit')

  const result = await computeChecklist(orgId, userId, isAdmin)

  if (new URL(req.url).searchParams.get('sync') === '1') {
    await syncOnboardingNotifications(orgId, userId, result.steps)
  }

  return NextResponse.json(result)
}
