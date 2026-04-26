/**
 * webhook_delivery job handler.
 *
 * Loads the delivery row, fetches its subscription's URL + secret, signs
 * the body with HMAC-SHA256, POSTs, records response (status/body/error),
 * and updates the delivery + the parent subscription's last_success_at /
 * last_failure_at markers. Retries are managed by the job_queue's normal
 * exponential-backoff path — non-2xx responses throw so the queue retries.
 */

import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/server'
import { decryptSafe } from '@/lib/crypto'
import { logger } from '@/lib/logger'
import type { QueuedJob } from '@/lib/api/job-queue'

const TIMEOUT_MS = 10_000

export async function handleWebhookDelivery(job: QueuedJob): Promise<void> {
  const { delivery_id } = job.payload as { delivery_id: string }
  if (!delivery_id) throw new Error('Missing delivery_id')

  const supabase = createAdminClient()
  const { data: delivRaw } = await supabase
    .from('webhook_deliveries')
    .select('id, subscription_id, event_type, payload, attempt, status')
    .eq('id', delivery_id)
    .maybeSingle()
  const delivery = delivRaw as {
    id: string; subscription_id: string; event_type: string; payload: Record<string, unknown>;
    attempt: number; status: string;
  } | null
  if (!delivery) return                              // already deleted; nothing to do
  if (delivery.status === 'delivered') return        // race-condition: another worker won

  const { data: subRaw } = await supabase
    .from('webhook_subscriptions')
    .select('id, url, secret, is_active')
    .eq('id', delivery.subscription_id)
    .maybeSingle()
  const sub = subRaw as { id: string; url: string; secret: string; is_active: boolean } | null
  if (!sub || !sub.is_active) return

  const body = JSON.stringify(delivery.payload)
  const secret = decryptSafe(sub.secret) ?? sub.secret
  const signature = crypto.createHmac('sha256', secret).update(body).digest('hex')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  let response: { ok: boolean; status: number; bodyText: string } | null = null
  let errorMsg: string | null = null
  try {
    const res = await fetch(sub.url, {
      method: 'POST',
      headers: {
        'Content-Type':       'application/json',
        'X-RecruiterStack-Event':     delivery.event_type,
        'X-RecruiterStack-Signature': `sha256=${signature}`,
        'X-RecruiterStack-Delivery':  delivery.id,
      },
      body,
      signal: controller.signal,
    })
    response = { ok: res.ok, status: res.status, bodyText: (await res.text()).slice(0, 4000) }
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : String(err)
  } finally {
    clearTimeout(timer)
  }

  const now = new Date().toISOString()
  const newAttempt = delivery.attempt + 1

  if (response && response.ok) {
    await supabase
      .from('webhook_deliveries')
      .update({
        status: 'delivered',
        attempt: newAttempt,
        response_status: response.status,
        response_body:   response.bodyText,
        delivered_at:    now,
        error:           null,
      })
      .eq('id', delivery.id)
    await supabase
      .from('webhook_subscriptions')
      .update({ last_success_at: now })
      .eq('id', sub.id)
    return
  }

  // Failed — record and let job_queue retry.
  await supabase
    .from('webhook_deliveries')
    .update({
      attempt: newAttempt,
      response_status: response?.status ?? null,
      response_body:   response?.bodyText ?? null,
      error:           errorMsg ?? `non-2xx (${response?.status ?? '?'})`,
      status:          'pending',                     // worker decides if 'failed' on max_attempts
    })
    .eq('id', delivery.id)
  await supabase
    .from('webhook_subscriptions')
    .update({ last_failure_at: now })
    .eq('id', sub.id)

  logger.warn('[webhook-delivery] non-2xx, will retry', {
    deliveryId: delivery.id, status: response?.status, error: errorMsg,
  })
  // Throw so job_queue records the failure & schedules backoff retry.
  throw new Error(errorMsg ?? `Webhook returned ${response?.status ?? '?'}`)
}
