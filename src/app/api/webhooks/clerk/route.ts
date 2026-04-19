import { NextResponse } from 'next/server'
import { Webhook } from 'svix'
import { logger } from '@/lib/logger'
import {
  syncUserFromClerk,
  syncMembershipFromClerk,
  deactivateUser,
  deactivateMembership,
  type ClerkUserPayload,
  type ClerkMembershipPayload,
} from '@/lib/clerk/sync'

// Clerk sends events as POST with svix-* headers and a JSON body.
// svix's verify() needs the raw body string to reproduce the signature.

type ClerkEvent =
  | { type: 'user.created'; data: ClerkUserPayload }
  | { type: 'user.updated'; data: ClerkUserPayload }
  | { type: 'user.deleted'; data: { id: string } }
  | { type: 'organizationMembership.created'; data: ClerkMembershipPayload }
  | { type: 'organizationMembership.updated'; data: ClerkMembershipPayload }
  | { type: 'organizationMembership.deleted'; data: ClerkMembershipPayload }
  | { type: string; data: unknown }           // catch-all for future event types

export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SIGNING_SECRET
  if (!secret) {
    logger.error('CLERK_WEBHOOK_SIGNING_SECRET not set; rejecting webhook', null)
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  const svixId        = req.headers.get('svix-id')
  const svixTimestamp = req.headers.get('svix-timestamp')
  const svixSignature = req.headers.get('svix-signature')

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing svix headers' }, { status: 400 })
  }

  const rawBody = await req.text()

  let event: ClerkEvent
  try {
    const wh = new Webhook(secret)
    event = wh.verify(rawBody, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ClerkEvent
  } catch (err) {
    logger.warn('Clerk webhook signature verification failed', { err: String(err) })
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  try {
    switch (event.type) {
      case 'user.created':
      case 'user.updated':
        await syncUserFromClerk(event.data as ClerkUserPayload)
        break

      case 'user.deleted':
        await deactivateUser((event.data as { id: string }).id)
        break

      case 'organizationMembership.created':
      case 'organizationMembership.updated':
        await syncMembershipFromClerk(event.data as ClerkMembershipPayload)
        break

      case 'organizationMembership.deleted': {
        const m = event.data as ClerkMembershipPayload
        await deactivateMembership(m.organization.id, m.public_user_data.user_id)
        break
      }

      default:
        // Unknown event type — log and acknowledge. Do not 5xx; Clerk retries on 5xx.
        logger.info('Clerk webhook: unhandled event type', { type: event.type })
    }

    return NextResponse.json({ received: true })
  } catch (err) {
    // Return 500 so Clerk retries (e.g., if a membership event arrives before
    // its user.created event, sync throws — retry will succeed once user exists).
    logger.error('Clerk webhook handler failed', err, { eventType: event.type })
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 })
  }
}
