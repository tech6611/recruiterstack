/**
 * Slack interaction dispatcher.
 *
 * The interactions endpoint (/api/slack/interactions) used to be hard-wired to
 * the approvals Approve/Reject buttons. This module turns that into a small
 * registry keyed by Slack `action_id` (button clicks) and `callback_id` (modal
 * submits), so new interactive features add a handler here instead of editing
 * the route.
 *
 * The route resolves the acting user ONCE (via the cached identity resolver)
 * and passes a typed context to the handler. Unknown action/callback ids are
 * not in the maps → the route ignores them (e.g. the "Open in app" link button),
 * exactly as before.
 */

import type { NextResponse } from 'next/server'

/** Resolved acting user + Slack coordinates for a button click. */
export interface BlockActionContext {
  orgId: string
  userId: string
  email: string
  /** The Slack user id of the clicker (for <@mention> in acks). */
  slackUserId: string
  /** The clicked button. */
  action: { action_id: string; value: string }
  /** Present for opening modals. */
  triggerId: string
  /** The message the button lives on (for chat.update acks). */
  channelId: string
  messageTs: string
  /** Slack-provided URL for posting an ephemeral reply to this interaction. */
  responseUrl: string
}

/** Resolved acting user + payload for a modal submission. */
export interface ViewSubmissionContext {
  orgId: string
  userId: string
  email: string
  slackUserId: string
  callbackId: string
  /** Opaque JSON string set when the modal was opened. */
  privateMetadata: string
  /** Slack modal state: block_id → action_id → { value }. */
  values: Record<string, Record<string, { value?: string }>>
}

export type BlockActionHandler = (ctx: BlockActionContext) => Promise<NextResponse>
export type ViewSubmissionHandler = (ctx: ViewSubmissionContext) => Promise<NextResponse>

import {
  approvalApprove,
  approvalReject,
  approvalRejectModalSubmit,
} from './handlers/approvals'
import {
  moveStage,
  addNote,
  addNoteModalSubmit,
} from './handlers/applications'

// action_id → handler for button clicks (block_actions).
const blockActionHandlers: Record<string, BlockActionHandler> = {
  approval_approve: approvalApprove,
  approval_reject: approvalReject,
  'app:move_stage': moveStage,
  'app:add_note': addNote,
  // Link buttons ('approval_open', 'app:open') just open a URL — intentionally
  // unregistered, so the dispatcher ignores their interaction payloads.
}

// callback_id → handler for modal submits (view_submission).
const viewSubmissionHandlers: Record<string, ViewSubmissionHandler> = {
  approval_reject_modal: approvalRejectModalSubmit,
  'app:add_note_modal': addNoteModalSubmit,
}

/** Handler for a button's action_id, or null if we don't handle it. */
export function getBlockActionHandler(actionId: string): BlockActionHandler | null {
  return blockActionHandlers[actionId] ?? null
}

/** Handler for a modal's callback_id, or null if we don't handle it. */
export function getViewSubmissionHandler(callbackId: string): ViewSubmissionHandler | null {
  return viewSubmissionHandlers[callbackId] ?? null
}
