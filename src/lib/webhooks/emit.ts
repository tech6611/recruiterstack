/**
 * Outbound webhook emitter.
 *
 * Lookup active subscriptions whose event_types contain `event`, materialize
 * a delivery row per subscription, and enqueue a job to deliver each. The
 * delivery handler (lib/webhooks/delivery.ts) signs the body with HMAC-SHA256
 * using the per-subscription secret, POSTs to the URL, records the response,
 * and lets the job_queue handle retries on transient failure.
 *
 * Best-effort throughout — emit() never throws into the calling business code.
 */

import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/server'
import { enqueue } from '@/lib/api/job-queue'
import { logger } from '@/lib/logger'

export type WebhookEvent =
  | 'opening.submitted'
  | 'opening.approved'
  | 'opening.rejected'
  | 'opening.cancelled'
  | 'job.submitted'
  | 'job.approved'
  | 'job.published'
  | 'approval.step.pending'
  | 'approval.step.decided'
  | 'approval.completed'

export async function emitWebhook(
  orgId:   string,
  event:   WebhookEvent,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const supabase = createAdminClient()
    const { data: subs, error } = await supabase
      .from('webhook_subscriptions')
      .select('id, url, secret, event_types')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .contains('event_types', [event])
    if (error) {
      logger.error('[webhooks] subscription query failed', error, { orgId, event })
      return
    }
    const list = (subs ?? []) as Array<{ id: string; url: string; secret: string; event_types: string[] }>
    if (list.length === 0) return

    const eventId = crypto.randomUUID()
    const body = {
      event,
      event_id: eventId,
      created_at: new Date().toISOString(),
      org_id: orgId,
      data: payload,
    }

    for (const sub of list) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: delivery, error: insErr } = await supabase
        .from('webhook_deliveries')
        .insert({
          org_id: orgId,
          subscription_id: sub.id,
          event_type: event,
          event_id: eventId,
          payload: body,
        } as any)
        .select('id')
        .single()
      if (insErr || !delivery) {
        logger.error('[webhooks] delivery insert failed', insErr, { event, subId: sub.id })
        continue
      }
      const deliveryId = (delivery as { id: string }).id
      enqueue({
        orgId,
        jobType: 'webhook_delivery' as never,        // expanded in JobType below
        payload: { delivery_id: deliveryId },
      }).catch(e => logger.error('[webhooks] enqueue failed', e))
    }
  } catch (err) {
    logger.error('[webhooks] emit threw', err, { event })
  }
}
