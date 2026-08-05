/**
 * Block Kit builders for the lifecycle-event DMs (candidate_applied,
 * stage_moved, candidate_hired). Pure and server-free (like routing.ts) so they
 * can be unit-tested without a Slack connection.
 *
 * The interactive buttons are handled by /api/slack/interactions via the action
 * ids below (see lib/slack/handlers/applications.ts):
 *   - `app:move_stage` → advance the candidate to the next pipeline stage
 *   - `app:add_note`   → open a modal to add a note
 *   - `app:open`       → a link button (opens the candidate in the web app);
 *                        intentionally unregistered, so the dispatcher ignores it.
 */

import type { SlackEventKey } from '@/lib/types/database'

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL ?? 'https://recruiterstack.in'

export interface LifecycleBlockInput {
  event: SlackEventKey
  /** The mrkdwn summary line already built by the caller (candidate/stage/job). */
  text: string
  /** Enables the Move-stage / Add-note buttons. */
  applicationId?: string
  /** Enables the "Open in RecruiterStack" link button. */
  candidateId?: string | null
}

/**
 * Build the blocks for a lifecycle DM: a summary section plus, when we have an
 * application, an actions row. "Move to next stage" is omitted for hired
 * candidates (they're at the end of the pipeline).
 */
export function buildLifecycleBlocks(input: LifecycleBlockInput): unknown[] {
  const blocks: unknown[] = [
    { type: 'section', text: { type: 'mrkdwn', text: input.text } },
  ]

  const elements: unknown[] = []
  if (input.applicationId) {
    if (input.event !== 'candidate_hired') {
      elements.push({
        type: 'button',
        text: { type: 'plain_text', text: '➡️ Move to next stage' },
        style: 'primary',
        action_id: 'app:move_stage',
        value: input.applicationId,
      })
    }
    elements.push({
      type: 'button',
      text: { type: 'plain_text', text: '📝 Add note' },
      action_id: 'app:add_note',
      value: input.applicationId,
    })
  }
  if (input.candidateId) {
    elements.push({
      type: 'button',
      text: { type: 'plain_text', text: 'Open in RecruiterStack' },
      url: `${APP_URL()}/candidates/${input.candidateId}`,
      action_id: 'app:open',
    })
  }

  if (elements.length) blocks.push({ type: 'actions', elements })
  return blocks
}
