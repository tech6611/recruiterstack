import { NextResponse } from 'next/server'
import { withCapability, parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { emailTemplateUpdateSchema } from '@/lib/validations/email-templates'

// PATCH /api/email-templates/[id] — rename / update a saved template
export const PATCH = withCapability('recruiting:edit', async (request, orgId, supabase, { params }) => {
  const parsed = await parseBody(request, emailTemplateUpdateSchema)
  if (parsed instanceof NextResponse) return parsed

  // Build update payload from validated fields
  const updates: import('@/lib/types/database').EmailTemplateUpdate = {}
  if (parsed.name)    updates.name    = parsed.name.trim()
  if (parsed.subject) updates.subject = parsed.subject.trim()
  if (parsed.body)    updates.body    = parsed.body.trim()

  if (Object.keys(updates).length === 0)
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const { data, error } = await supabase
    .from('email_templates')
    .update(updates)
    .eq('id', params.id)
    .eq('org_id', orgId)
    .select()
    .single()

  if (error) return handleSupabaseError(error)
  return NextResponse.json({ data })
})

// DELETE /api/email-templates/[id] — delete a saved template
export const DELETE = withCapability('recruiting:edit', async (_request, orgId, supabase, { params }) => {
  const { error } = await supabase
    .from('email_templates')
    .delete()
    .eq('id', params.id)
    .eq('org_id', orgId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
})
