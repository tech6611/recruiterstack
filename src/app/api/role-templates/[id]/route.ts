import { NextResponse } from 'next/server'
import { withCapability, handleSupabaseError } from '@/lib/api/helpers'
import { deleteRoleTemplate } from '@/modules/ats/domain/role-templates'

/** DELETE — remove a saved role template. */
export const DELETE = withCapability('recruiting:edit', async (_req, orgId, supabase, { params }) => {
  try {
    await deleteRoleTemplate(supabase, orgId, params.id)
    return NextResponse.json({ data: { deleted: true } })
  } catch (e) {
    return handleSupabaseError(e as { code: string; message: string })
  }
})
