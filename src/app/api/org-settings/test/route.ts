import { NextResponse } from 'next/server'
import { requireOrg } from '@/lib/auth'
import { notifySlack } from '@/lib/notifications'

// POST /api/org-settings/test — sends a test Slack message
export async function POST() {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  await notifySlack(orgId, '✅ RecruiterStack is connected!')
  return NextResponse.json({ ok: true })
}
