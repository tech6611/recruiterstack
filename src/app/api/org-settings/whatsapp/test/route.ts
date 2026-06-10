import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { parseBody } from '@/lib/api/helpers'
import { sendWhatsApp } from '@/lib/whatsapp/send'

const testSchema = z.object({
  to_phone: z.string().min(8),
})

// POST /api/org-settings/whatsapp/test — send a test message to verify the
// connection (admin enters their own number). Business-initiated, so this
// exercises the template path unless the admin has messaged the number first.
export async function POST(request: NextRequest) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const parsed = await parseBody(request, testSchema)
  if (parsed instanceof NextResponse) return parsed

  const supabase = createAdminClient()
  const result = await sendWhatsApp({
    supabase,
    orgId,
    toPhone: parsed.to_phone,
    body: 'Test message from RecruiterStack — your WhatsApp integration is working.',
    sender: userId,
  })

  return NextResponse.json(
    { data: { ok: result.ok, message: result.message } },
    { status: result.ok ? 200 : 422 },
  )
}
