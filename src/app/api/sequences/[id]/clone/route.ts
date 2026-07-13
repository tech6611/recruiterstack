import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'

// POST /api/sequences/[id]/clone — duplicate a sequence and all its stages into a
// fresh draft. Runtime state (enrollments, sent emails, auto-enroll rules) is
// deliberately NOT copied — a clone starts clean so it can be edited and
// activated on its own.
export const POST = withCapability('recruiting:edit', async (_req, orgId, supabase, { params }) => {
  // 1. Load the source sequence + its stages, scoped to this org.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: source, error: srcErr } = await (supabase.from('sequences') as any)
    .select('*, sequence_stages(*)')
    .eq('id', params.id)
    .eq('org_id', orgId)
    .maybeSingle()
  if (srcErr) return NextResponse.json({ error: srcErr.message }, { status: 500 })
  if (!source) return NextResponse.json({ error: 'Sequence not found' }, { status: 404 })

  // 2. Create the copy as a draft (never inherit "active" — the user opts in).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: clone, error: cloneErr } = await (supabase.from('sequences') as any)
    .insert({
      org_id:      orgId,
      name:        `${source.name} (Copy)`,
      description: source.description ?? null,
      status:      'draft',
      // Preserve the drip/event type so a cloned event sequence still fires
      // instantly rather than silently reverting to windowed drip sends.
      kind:        source.kind === 'event' ? 'event' : 'drip',
    })
    .select()
    .single()
  if (cloneErr) return NextResponse.json({ error: cloneErr.message }, { status: 500 })

  // 3. Copy every stage across, preserving order + timing + content + conditions.
  const stages = Array.isArray(source.sequence_stages) ? source.sequence_stages : []
  if (stages.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: stageErr } = await (supabase.from('sequence_stages') as any)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert(stages.map((s: any) => ({
        org_id:               orgId,
        sequence_id:          clone.id,
        order_index:          s.order_index,
        delay_days:           s.delay_days ?? 0,
        delay_minutes:        s.delay_minutes ?? 0,
        subject:              s.subject ?? '',
        body:                 s.body ?? '',
        send_on_behalf_of:    s.send_on_behalf_of ?? '',
        send_on_behalf_email: s.send_on_behalf_email ?? '',
        channel:              s.channel ?? 'email',
        send_at:              s.send_at ?? null,
        send_at_time:         s.send_at_time ?? null,
        send_timezone:        s.send_timezone ?? 'Asia/Kolkata',
        delay_business_days:  s.delay_business_days ?? false,
        condition:            s.condition ?? null,
      })))
    if (stageErr) {
      // Roll back the half-made clone so a stage failure doesn't leave an orphan.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('sequences') as any).delete().eq('id', clone.id).eq('org_id', orgId)
      return NextResponse.json({ error: stageErr.message }, { status: 500 })
    }
  }

  return NextResponse.json({ data: clone }, { status: 201 })
})
