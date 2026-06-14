import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOwner } from '@/lib/auth-admin'
import { isCapability } from '@/lib/permissions'
import { setMemberOverride, clearMemberOverride } from '@/modules/core/domain/roles'

// PUT /api/admin/members/:userId/overrides — Owner-only. Sets a single per-member
// capability override (idempotent). Body: { capability, effect: 'allow'|'deny' }.
export async function PUT(req: NextRequest, { params }: { params: { userId: string } }) {
  const auth = await requireOwner()
  if (auth instanceof NextResponse) return auth

  let body: { capability?: unknown; effect?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { capability, effect } = body
  if (typeof capability !== 'string' || !isCapability(capability)) {
    return NextResponse.json({ error: 'A valid capability is required' }, { status: 400 })
  }
  if (effect !== 'allow' && effect !== 'deny') {
    return NextResponse.json({ error: "effect must be 'allow' or 'deny'" }, { status: 400 })
  }

  const supabase = createAdminClient()
  try {
    await setMemberOverride(supabase, auth.orgId, params.userId, capability, effect)
    return NextResponse.json({ data: { user_id: params.userId, capability, effect } })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

// DELETE /api/admin/members/:userId/overrides — Owner-only. Clears a per-member
// capability override (idempotent). capability from body { capability } or ?capability=.
export async function DELETE(req: NextRequest, { params }: { params: { userId: string } }) {
  const auth = await requireOwner()
  if (auth instanceof NextResponse) return auth

  let capability = req.nextUrl.searchParams.get('capability') ?? undefined
  if (!capability) {
    try {
      const body = (await req.json()) as { capability?: unknown }
      if (typeof body?.capability === 'string') capability = body.capability
    } catch {
      // No/invalid body — fall through to validation below.
    }
  }

  if (typeof capability !== 'string' || capability.length === 0) {
    return NextResponse.json({ error: 'capability is required' }, { status: 400 })
  }

  const supabase = createAdminClient()
  try {
    await clearMemberOverride(supabase, auth.orgId, params.userId, capability)
    return NextResponse.json({ data: { user_id: params.userId, capability } })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
