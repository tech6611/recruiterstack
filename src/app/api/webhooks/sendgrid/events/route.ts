/**
 * SendGrid Event Webhook — receives engagement events (delivered / open / click /
 * bounce) for sequence emails and writes them back to `sequence_emails`. This is
 * what makes the Analytics tab show real open/click/bounce numbers, and what the
 * "if no open / no click" send conditions read.
 *
 * Auth: a shared token in the query string (`?token=…`) checked against
 * SENDGRID_WEBHOOK_TOKEN. Configure the FULL url (token included) as the event
 * webhook destination in the SendGrid dashboard. Bypasses Clerk (see middleware).
 *
 * Matching: at send time each message is stamped with custom args
 * `{ seq_enrollment_id, seq_stage_id }` (see the sequence_email job handler);
 * SendGrid echoes them on every event, so an event maps to exactly one row.
 *
 * (Replies are a separate mechanism — SendGrid Inbound Parse → the Django
 * webhook — and mark the enrollment 'replied'. They do not come through here.)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'

interface SendGridEvent {
  event: string
  email?: string
  timestamp?: number
  sg_message_id?: string
  seq_enrollment_id?: string
  seq_stage_id?: string
}

// Status precedence — an update may only RAISE a row's status, never lower it
// (a late 'delivered' event must not clobber an 'opened' row).
const STATUS_RANK: Record<string, number> = {
  queued: 0, sent: 1, failed: 1, skipped: 1, delivered: 2, opened: 3, clicked: 4, bounced: 5, replied: 6,
}

type Agg = {
  enrollmentId: string
  stageId: string
  openDelta: number
  clickDelta: number
  topStatus: string
  openedAt?: string
  clickedAt?: string
  bouncedAt?: string
}

export async function POST(req: NextRequest) {
  // Query-token guard. If the token is configured, it must match; if it isn't
  // configured yet, accept (so the endpoint works before it's locked down).
  const expected = process.env.SENDGRID_WEBHOOK_TOKEN
  if (expected && req.nextUrl.searchParams.get('token') !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let events: SendGridEvent[]
  try {
    const parsed = await req.json()
    events = Array.isArray(parsed) ? parsed : []
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (events.length === 0) return NextResponse.json({ received: true })

  // Collapse the batch by target row so we do one DB update per email even when
  // a batch carries several opens/clicks for the same message.
  const byRow = new Map<string, Agg>()
  const iso = (ts?: number) => new Date((ts && ts > 0 ? ts : Math.floor(Date.now() / 1000)) * 1000).toISOString()

  for (const ev of events) {
    const enrollmentId = ev.seq_enrollment_id
    const stageId = ev.seq_stage_id
    if (!enrollmentId || !stageId) continue // not a tracked sequence email

    const key = `${enrollmentId}::${stageId}`
    const agg = byRow.get(key) ?? { enrollmentId, stageId, openDelta: 0, clickDelta: 0, topStatus: 'sent' }

    let evStatus: string | null = null
    switch (ev.event) {
      case 'delivered':
        evStatus = 'delivered'; break
      case 'open':
        evStatus = 'opened'; agg.openDelta++; agg.openedAt ??= iso(ev.timestamp); break
      case 'click':
        evStatus = 'clicked'; agg.clickDelta++; agg.clickedAt ??= iso(ev.timestamp)
        agg.openedAt ??= iso(ev.timestamp) // a click implies an open
        break
      case 'bounce':
      case 'dropped':
        evStatus = 'bounced'; agg.bouncedAt ??= iso(ev.timestamp); break
      default:
        evStatus = null // processed / deferred / spamreport / unsubscribe — no status change
    }
    if (evStatus && (STATUS_RANK[evStatus] ?? 0) > (STATUS_RANK[agg.topStatus] ?? 0)) {
      agg.topStatus = evStatus
    }
    byRow.set(key, agg)
  }

  if (byRow.size === 0) return NextResponse.json({ received: true })

  const supabase = createAdminClient()
  let updated = 0

  for (const agg of Array.from(byRow.values())) {
    // Load the row so we can raise (never lower) status and add to counts.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row } = await (supabase.from('sequence_emails') as any)
      .select('id, status, open_count, click_count, opened_at, clicked_at, bounced_at')
      .eq('enrollment_id', agg.enrollmentId)
      .eq('stage_id', agg.stageId)
      .maybeSingle()
    if (!row) continue

    const update: Record<string, unknown> = {
      open_count:  (row.open_count ?? 0) + agg.openDelta,
      click_count: (row.click_count ?? 0) + agg.clickDelta,
    }
    if ((STATUS_RANK[agg.topStatus] ?? 0) > (STATUS_RANK[row.status] ?? 0)) update.status = agg.topStatus
    if (agg.openedAt  && !row.opened_at)  update.opened_at  = agg.openedAt
    if (agg.clickedAt && !row.clicked_at) update.clicked_at = agg.clickedAt
    if (agg.bouncedAt && !row.bounced_at) update.bounced_at = agg.bouncedAt

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('sequence_emails') as any).update(update).eq('id', row.id)
    updated++
  }

  logger.info('[sendgrid-webhook] processed events', { events: events.length, rows: byRow.size, updated })
  return NextResponse.json({ received: true, updated })
}
