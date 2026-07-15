import { NextResponse } from 'next/server'
import { withCapability, handleSupabaseError } from '@/lib/api/helpers'

// DELETE /api/settings/api-keys/[id] — revoke a key. We soft-revoke (stamp
// revoked_at) rather than delete, so the row stays for audit/history and any
// request bearing the key is immediately rejected by withApiKey.
export const DELETE = withCapability('settings:edit', async (_req, orgId, supabase, { params }) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('org_id', orgId)

  if (error) return handleSupabaseError(error)
  return NextResponse.json({ data: { revoked: true } })
})
