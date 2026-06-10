import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { parseBody, handleSupabaseError } from '@/lib/api/helpers'
import {
  getWhatsAppAccount,
  upsertWhatsAppAccount,
  disconnectWhatsAppAccount,
} from '@/modules/crm/domain/whatsapp'

const upsertSchema = z.object({
  phone_number_id: z.string().min(1),
  waba_id: z.string().min(1),
  display_phone: z.string().optional().nullable(),
  access_token: z.string().min(1),
  app_secret: z.string().optional().nullable(),
  outreach_template: z.string().optional().nullable(),
  template_language: z.string().min(2).max(10).optional(),
})

async function requireAdmin(): Promise<
  NextResponse | { orgId: string; userId: string; supabase: ReturnType<typeof createAdminClient> }
> {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  const { data: me } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle()

  if ((me as { role: string } | null)?.role !== 'admin') {
    return NextResponse.json({ error: 'Only admins can manage WhatsApp settings.' }, { status: 403 })
  }

  return { orgId, userId, supabase }
}

// GET /api/org-settings/whatsapp — connection status. Never returns secrets.
export async function GET() {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { orgId, supabase } = auth

  const account = await getWhatsAppAccount(supabase, orgId)
  return NextResponse.json({
    data: account
      ? {
          connected: account.status === 'connected',
          status: account.status,
          phone_number_id: account.phoneNumberId,
          waba_id: account.wabaId,
          display_phone: account.displayPhone,
          outreach_template: account.outreachTemplate,
          template_language: account.templateLanguage,
        }
      : { connected: false, status: 'disconnected' },
  })
}

// PUT /api/org-settings/whatsapp — connect / update credentials.
export async function PUT(request: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { orgId, supabase } = auth

  const parsed = await parseBody(request, upsertSchema)
  if (parsed instanceof NextResponse) return parsed

  try {
    await upsertWhatsAppAccount(supabase, orgId, {
      phoneNumberId: parsed.phone_number_id,
      wabaId: parsed.waba_id,
      displayPhone: parsed.display_phone ?? null,
      accessToken: parsed.access_token,
      appSecret: parsed.app_secret ?? null,
      outreachTemplate: parsed.outreach_template ?? null,
      templateLanguage: parsed.template_language ?? 'en',
    })
  } catch (err) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return handleSupabaseError(err as any)
  }

  return NextResponse.json({ data: { connected: true } })
}

// DELETE /api/org-settings/whatsapp — disconnect.
export async function DELETE() {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { orgId, supabase } = auth

  await disconnectWhatsAppAccount(supabase, orgId)
  return NextResponse.json({ data: { connected: false } })
}
