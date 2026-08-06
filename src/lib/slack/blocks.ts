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

// Escape Slack mrkdwn control chars in user-supplied text.
function esc(s: string): string {
  return s.replace(/[*_`>]/g, c => `\\${c}`)
}

export interface SearchResultRow {
  candidateId: string
  name: string
  title: string | null
  status: string
  jobs: string[]
}

const SEARCH_RESULT_LIMIT = 10

/**
 * Block Kit for a `/recruiterstack search` result: a count header then one
 * section per candidate (name + title · active jobs · status) with an "Open"
 * link button. Caps the list at SEARCH_RESULT_LIMIT with an overflow note so the
 * message stays within Slack's block limits.
 */
export function buildSearchResultsBlocks(query: string, rows: SearchResultRow[]): unknown[] {
  if (rows.length === 0) {
    return [{ type: 'section', text: { type: 'mrkdwn', text: `No candidates matching *${esc(query)}*.` } }]
  }

  const blocks: unknown[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${rows.length}* candidate${rows.length === 1 ? '' : 's'} matching *${esc(query)}*`,
      },
    },
    { type: 'divider' },
  ]

  for (const r of rows.slice(0, SEARCH_RESULT_LIMIT)) {
    const meta = [
      r.title,
      r.jobs.length ? `active: ${r.jobs.join(', ')}` : null,
      `status: ${r.status}`,
    ].filter(Boolean).join(' · ')
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*${esc(r.name)}*${meta ? `\n${esc(meta)}` : ''}` },
      accessory: {
        type: 'button',
        text: { type: 'plain_text', text: 'Open' },
        url: `${APP_URL()}/candidates/${r.candidateId}`,
        action_id: 'app:open',
      },
    })
  }

  if (rows.length > SEARCH_RESULT_LIMIT) {
    blocks.push({
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: `…and ${rows.length - SEARCH_RESULT_LIMIT} more. Refine your search to narrow it down.`,
      }],
    })
  }
  return blocks
}
