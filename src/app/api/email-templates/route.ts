import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'
import { auth } from '@clerk/nextjs/server'

// GET  /api/email-templates  — list all saved templates for the org
export const GET = withCapability('recruiting:view', async (_req, orgId, supabase) => {
  const { data, error } = await supabase
    .from('email_templates')
    .select('id, name, subject, body, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: true })

  // PGRST205 = table not found (migration not yet applied) → return empty list gracefully
  if (error) {
    if ((error as { code?: string }).code === 'PGRST205') return NextResponse.json({ data: [] })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ data })
})

// POST /api/email-templates  — create a new saved template
export const POST = withCapability('recruiting:edit', async (request, orgId, supabase) => {
  const { userId } = auth()

  let body: { name: string; subject: string; body: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.name?.trim() || !body.subject?.trim() || !body.body?.trim()) {
    return NextResponse.json({ error: 'name, subject and body are required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('email_templates')
    .insert({
      org_id:     orgId,
      name:       body.name.trim(),
      subject:    body.subject.trim(),
      body:       body.body.trim(),
      created_by: userId ?? null,
    })
    .select()
    .single()

  if (error) {
    if ((error as { code?: string }).code === 'PGRST205') {
      return NextResponse.json({ error: 'email_templates table not yet created. Run the migration in your Supabase dashboard.' }, { status: 503 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ data }, { status: 201 })
})
