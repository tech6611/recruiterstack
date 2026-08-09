/**
 * Slack interaction handlers for candidate/application actions taken from a
 * lifecycle DM: "Move to next stage" and "Add note".
 *
 * These reuse the exact same domain facades the web app's PATCH route uses, so
 * a button click does precisely what the UI does — no divergent logic:
 *   - stage move  → updateApplicationStage + a 'stage_moved' event
 *   - add note    → a 'note_added' event
 * Both gate on the acting user's `recruiting:edit` capability, mirroring
 * withCapability('recruiting:edit') on /api/applications/[id].
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getPermissionSet, can } from '@/lib/rbac'
import { chatUpdate, viewsOpen, postToResponseUrl } from '@/lib/slack/client'
import {
  getApplicationStageProgression,
  updateApplicationStage,
  recordApplicationEventSafe,
} from '@/modules/ats/domain/applications'
import type { ApplicationEventInsert } from '@/lib/types/database'
import type { BlockActionContext, ViewSubmissionContext } from '@/lib/slack/actions'

/** Post a transient ephemeral reply that leaves the original message intact. */
async function ephemeral(responseUrl: string, text: string): Promise<void> {
  await postToResponseUrl(responseUrl, { response_type: 'ephemeral', replace_original: false, text })
}

// ── app:move_stage ────────────────────────────────────────────────────

export async function moveStage(ctx: BlockActionContext): Promise<NextResponse> {
  const applicationId = ctx.action.value
  if (!applicationId) return NextResponse.json({})

  const supabase = createAdminClient()
  const caps = await getPermissionSet(supabase, ctx.orgId, ctx.userId)
  if (!can(caps, 'recruiting:edit')) {
    await ephemeral(ctx.responseUrl, "🔒 You don't have permission to move candidates.")
    return NextResponse.json({})
  }

  const prog = await getApplicationStageProgression(supabase, ctx.orgId, applicationId)
  if (!prog) {
    await ephemeral(ctx.responseUrl, 'That application no longer exists.')
    return NextResponse.json({})
  }
  if (!prog.nextStageId) {
    const at = prog.currentStageName ? ` (${prog.currentStageName})` : ''
    await ephemeral(ctx.responseUrl, `This candidate is already at the final stage${at}.`)
    return NextResponse.json({})
  }

  const { error } = await updateApplicationStage(supabase, ctx.orgId, applicationId, prog.nextStageId)
  if (error) {
    await ephemeral(ctx.responseUrl, 'Sorry — moving the stage failed. Please try in the app.')
    return NextResponse.json({})
  }

  await recordApplicationEventSafe(supabase, {
    org_id: ctx.orgId,
    application_id: applicationId,
    event_type: 'stage_moved',
    from_stage: prog.currentStageName,
    to_stage: prog.nextStageName,
    created_by: ctx.email || 'Slack',
  } as ApplicationEventInsert)

  // Confirm on the original DM and drop the buttons (prevents double-moves).
  if (ctx.channelId && ctx.messageTs) {
    await chatUpdate(ctx.orgId, {
      channel: ctx.channelId,
      ts: ctx.messageTs,
      text: `✅ Moved to *${prog.nextStageName}* by <@${ctx.slackUserId}>`,
    })
  }
  return NextResponse.json({})
}

// ── app:add_note ──────────────────────────────────────────────────────

export async function addNote(ctx: BlockActionContext): Promise<NextResponse> {
  const applicationId = ctx.action.value
  if (!applicationId) return NextResponse.json({})

  const supabase = createAdminClient()
  const caps = await getPermissionSet(supabase, ctx.orgId, ctx.userId)
  if (!can(caps, 'recruiting:edit')) {
    await ephemeral(ctx.responseUrl, "🔒 You don't have permission to add notes.")
    return NextResponse.json({})
  }

  const meta = JSON.stringify({
    applicationId, channelId: ctx.channelId, messageTs: ctx.messageTs, orgId: ctx.orgId,
  })
  await viewsOpen(ctx.orgId, ctx.triggerId, {
    type: 'modal',
    callback_id: 'app:add_note_modal',
    private_metadata: meta,
    title: { type: 'plain_text', text: 'Add note' },
    submit: { type: 'plain_text', text: 'Save' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      {
        type: 'input',
        block_id: 'note_block',
        label: { type: 'plain_text', text: 'Note' },
        element: {
          type: 'plain_text_input',
          action_id: 'note_input',
          multiline: true,
          min_length: 1,
          max_length: 5000,
        },
      },
    ],
  })
  return NextResponse.json({})
}

export async function addNoteModalSubmit(ctx: ViewSubmissionContext): Promise<NextResponse> {
  let meta: { applicationId: string; orgId: string }
  try {
    meta = JSON.parse(ctx.privateMetadata)
  } catch {
    return NextResponse.json({ response_action: 'errors' })
  }

  const note = ctx.values?.note_block?.note_input?.value ?? ''
  if (!note.trim()) {
    return NextResponse.json({
      response_action: 'errors',
      errors: { note_block: 'Please enter a note.' },
    })
  }

  const supabase = createAdminClient()
  const caps = await getPermissionSet(supabase, meta.orgId, ctx.userId)
  if (!can(caps, 'recruiting:edit')) {
    return NextResponse.json({
      response_action: 'errors',
      errors: { note_block: "You don't have permission to add notes." },
    })
  }

  await recordApplicationEventSafe(supabase, {
    org_id: meta.orgId,
    application_id: meta.applicationId,
    event_type: 'note_added',
    note: note.trim(),
    created_by: ctx.email || 'Slack',
  } as ApplicationEventInsert)

  return NextResponse.json({ response_action: 'clear' })
}
