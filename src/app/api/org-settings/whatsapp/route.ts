import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { getViewerScope, assertCapability } from '@/lib/rbac'
import type { Capability } from '@/lib/permissions'
import { parseBody, handleSupabaseError } from '@/lib/api/helpers'
import {
  getWhatsAppAccount,
  upsertWhatsAppAccount,
  disconnectWhatsAppAccount,
} from '@/modules/crm/domain/whatsapp'

const upsertSchema = z
  .object({
    provider: z.enum(['meta', 'vobiz']).default('meta'),
    // meta: Meta phone number id · vobiz: channel_id
    phone_number_id: z.string().min(1),
    // meta: Graph API token · vobiz: X-Auth-Token
    access_token: z.string().min(1),
    waba_id: z.string().optional().nullable(),    // meta only
    app_secret: z.string().optional().nullable(), // meta only
    auth_id: z.string().optional().nullable(),    // vobiz only
    display_phone: z.string().optional().nullable(),
    outreach_template: z.string().optional().nullable(),
    template_language: z.string().min(2).max(10).optional(),
  })
  .refine((v) => v.provider !== 'meta' || !!v.waba_id, {
    message: 'waba_id is required for the Meta provider',
    path: ['waba_id'],
  })
  .refine((v) => v.provider !== 'vobiz' || !!v.auth_id, {
    message: 'auth_id is required for the Vobiz provider',
    path: ['auth_id'],
  })

async function requireWhatsAppAccess(capability: Capability): Promise<
  NextResponse | { orgId: string; userId: string; supabase: ReturnType<typeof createAdminClient> }
> {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  const scope = await getViewerScope(supabase, orgId, userId)
  const denied = assertCapability(scope, capability)
  if (denied) return denied

  return { orgId, userId, supabase }
}

// GET /api/org-settings/whatsapp — connection status. Never returns secrets.
export async function GET() {
  const auth = await requireWhatsAppAccess('settings:view')
  if (auth instanceof NextResponse) return auth
  const { orgId, supabase } = auth

  const account = await getWhatsAppAccount(supabase, orgId)
  return NextResponse.json({
    data: account
      ? {
          connected: account.status === 'connected',
          status: account.status,
          provider: account.provider,
          phone_number_id: account.phoneNumberId,
          waba_id: account.wabaId,
          auth_id: account.authId,
          display_phone: account.displayPhone,
          outreach_template: account.outreachTemplate,
          template_language: account.templateLanguage,
        }
      : { connected: false, status: 'disconnected' },
  })
}

// PUT /api/org-settings/whatsapp — connect / update credentials.
export async function PUT(request: NextRequest) {
  const auth = await requireWhatsAppAccess('settings:edit')
  if (auth instanceof NextResponse) return auth
  const { orgId, supabase } = auth

  const parsed = await parseBody(request, upsertSchema)
  if (parsed instanceof NextResponse) return parsed

  try {
    await upsertWhatsAppAccount(supabase, orgId, {
      provider: parsed.provider,
      phoneNumberId: parsed.phone_number_id,
      wabaId: parsed.waba_id ?? null,
      authId: parsed.auth_id ?? null,
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
  const auth = await requireWhatsAppAccess('settings:edit')
  if (auth instanceof NextResponse) return auth
  const { orgId, supabase } = auth

  await disconnectWhatsAppAccount(supabase, orgId)
  return NextResponse.json({ data: { connected: false } })
}
