import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'
import { sanitizeCandidateFilter } from '@/modules/crm/domain/candidate-filter'

const TRIGGERS = ['tag_added', 'stage_moved', 'applied', 'status_changed']

// GET /api/automations — list auto-enrollment rules (optionally scoped to a
// single sequence via ?sequence_id=), with the target sequence name/status.
export const GET = withCapability('recruiting:view', async (req, orgId, supabase) => {
  const sequenceId = new URL(req.url).searchParams.get('sequence_id')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = ((supabase as any).from('sequence_enrollment_rules'))
    .select('*, sequences(name, status)')
    .eq('org_id', orgId)
  if (sequenceId) query = query.eq('sequence_id', sequenceId)
  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
})

// POST /api/automations — create a rule
export const POST = withCapability('recruiting:edit', async (req, orgId, supabase) => {
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const trigger_type = String(body.trigger_type ?? '')
  // 'applied' fires on every new application → no value needed; store a placeholder.
  const trigger_value = trigger_type === 'applied' ? 'any' : String(body.trigger_value ?? '').trim()
  const sequence_id = String(body.sequence_id ?? '')

  if (!TRIGGERS.includes(trigger_type)) {
    return NextResponse.json({ error: `trigger_type must be one of: ${TRIGGERS.join(', ')}` }, { status: 400 })
  }
  if (trigger_type !== 'applied' && !trigger_value) {
    return NextResponse.json({ error: 'trigger_value is required' }, { status: 400 })
  }
  if (!sequence_id) return NextResponse.json({ error: 'sequence_id is required' }, { status: 400 })

  // The target sequence must belong to this org.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: seq } = await (supabase.from('sequences') as any)
    .select('id').eq('id', sequence_id).eq('org_id', orgId).single()
  if (!seq) return NextResponse.json({ error: 'Sequence not found' }, { status: 404 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await ((supabase as any).from('sequence_enrollment_rules'))
    .insert({
      org_id: orgId,
      name: String(body.name ?? '').trim(),
      enabled: body.enabled === undefined ? true : Boolean(body.enabled),
      trigger_type,
      trigger_value,
      sequence_id,
      filters: sanitizeCandidateFilter(body.filters),
    })
    .select('*, sequences(name, status)')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
})
