/**
 * Copilot approval lock — server-enforced, exact-action approval.
 *
 * Risky tools (anything that contacts a person outside the app or is hard to
 * undo) are NEVER executed inside the AI loop. When the model calls one, the
 * sub-agent records the exact call (tool + args) with a plain-English preview
 * and tells the model it is waiting for approval. At the end of the turn the
 * copilot route stores the batch in `copilot_pending_actions` and shows the
 * recruiter an approval card listing exactly what will happen. Only the
 * recruiter's "Approve" click (POST /api/copilot/approve) runs those stored
 * calls — once, within 30 minutes, as the same user.
 *
 * Because the gate lives in code, a prompt-injected instruction (from a
 * candidate profile, a link, an attached file) can at worst put an action on
 * the card for the recruiter to cancel — it can't send anything by itself.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface PendingAction {
  tool: string
  args: Record<string, unknown>
  /** What the approval card shows for this action. */
  preview: string
}

const ALWAYS_GATED = new Set([
  // Contacts someone outside the app
  'send_outreach_email',
  'send_whatsapp_message',
  // Bulk / hard to undo
  'bulk_reject_below_score',
  'bulk_move_to_stage',
  'update_offer_status',
  // People / HR
  'mark_employee_terminated',
  'record_employee_compensation',
  'start_onboarding',
  'request_time_off',
  'decide_time_off',
])

/** True when this exact call must wait for the recruiter's approval. */
export function needsApproval(tool: string, args: Record<string, unknown>): boolean {
  if (ALWAYS_GATED.has(tool)) return true
  // Emailing the availability link contacts someone; just making the link doesn't.
  if (tool === 'create_interviewer_availability_link') return args.send_email === true
  // Re-activating is harmless; rejecting / withdrawing / hiring is not.
  if (tool === 'update_application_status') {
    return ['rejected', 'withdrawn', 'hired'].includes(String(args.status ?? ''))
  }
  return false
}

/** Collects the gated calls made during one copilot request. */
export class ApprovalQueue {
  readonly actions: PendingAction[] = []
  add(action: PendingAction) { this.actions.push(action) }
  get size() { return this.actions.length }
}

/** What the model is told instead of the tool result. */
export function queuedMessage(preview: string): string {
  return `WAITING FOR APPROVAL — NOT DONE YET. The system has held this exact action and will show the recruiter an approval card:\n${preview}\nDo not call this tool again for the same action. In your reply, say it is ready for the recruiter to review and approve in the card below — never say it was sent or done.`
}

// ── Previews ──────────────────────────────────────────────────────────────────

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s)

async function applicationLabel(supabase: SupabaseClient, orgId: string, applicationId: unknown): Promise<string> {
  const id = str(applicationId)
  if (!id) return 'an unknown application'
  const { data } = await supabase
    .from('applications')
    .select('id, candidate:candidates(name), job:jobs(title)')
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = data as any
  if (!d) return `application ${id} (not found in your organization — this will fail)`
  return `${d.candidate?.name ?? 'Unknown candidate'}${d.job?.title ? ` (${d.job.title})` : ''}`
}

async function applicationNames(supabase: SupabaseClient, orgId: string, ids: unknown): Promise<string[]> {
  const list = Array.isArray(ids) ? ids.map(String).filter(Boolean) : []
  if (!list.length) return []
  const { data } = await supabase
    .from('applications')
    .select('id, candidate:candidates(name), job:jobs(title)')
    .in('id', list.slice(0, 200))
    .eq('org_id', orgId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map(a => `${a.candidate?.name ?? 'Unknown'}${a.job?.title ? ` (${a.job.title})` : ''}`)
}

function nameList(names: string[], total: number): string {
  const shown = names.slice(0, 15).map(n => `  • ${n}`).join('\n')
  const more = total > 15 ? `\n  …and ${total - 15} more` : ''
  return shown + more
}

async function emailRecipient(supabase: SupabaseClient, orgId: string, applicationId: unknown): Promise<string> {
  const id = str(applicationId)
  const { data } = await supabase
    .from('applications')
    .select('candidate:candidates(name, email)')
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = (data as any)?.candidate
  if (!c) return `application ${id} (not found — this will fail)`
  return `${c.name ?? 'Unknown'} <${c.email ?? 'no email on file — this will fail'}>`
}

function genericPreview(tool: string, args: Record<string, unknown>): string {
  const label = tool.replace(/_/g, ' ')
  const fields = Object.entries(args)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `  ${k.replace(/_/g, ' ')}: ${clip(typeof v === 'string' ? v : JSON.stringify(v), 200)}`)
    .join('\n')
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}${fields ? `\n${fields}` : ''}`
}

/** Plain-English description of exactly what the action will do. Never throws. */
export async function describeAction(
  tool: string,
  args: Record<string, unknown>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  try {
    switch (tool) {
      case 'send_outreach_email':
        return `📧 Email to ${await emailRecipient(supabase, orgId, args.application_id)}\n` +
          `Subject: ${str(args.subject) || '(no subject)'}\n` +
          `From name: ${str(args.recruiter_name) || 'The Recruiting Team'}\n\n` +
          clip(str(args.body), 2000)
      case 'send_whatsapp_message':
        return `💬 WhatsApp to ${await applicationLabel(supabase, orgId, args.application_id)}\n\n${clip(str(args.body), 1000)}\n\n` +
          '(If the 24-hour reply window has closed, WhatsApp only allows your approved template instead of this text.)'
      case 'create_interviewer_availability_link':
        return `📧 Email an availability link to ${str(args.interviewer_name) || 'the interviewer'} <${str(args.interviewer_email)}>`
      case 'bulk_reject_below_score': {
        const below = Number(args.below_score)
        const { data } = await supabase
          .from('applications')
          .select('id, ai_score, candidate:candidates(name)')
          .eq('job_id', str(args.job_id))
          .eq('org_id', orgId)
          .eq('status', 'active')
          .not('ai_score', 'is', null)
          .lt('ai_score', below)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rows = (data ?? []) as any[]
        const { data: job } = await supabase.from('jobs').select('title').eq('id', str(args.job_id)).eq('org_id', orgId).maybeSingle()
        return `🚫 Reject every active candidate scoring below ${below} on ${(job as { title?: string } | null)?.title ?? 'this job'} — ${rows.length} right now:\n` +
          nameList(rows.map(r => `${r.candidate?.name ?? 'Unknown'} (score ${r.ai_score})`), rows.length) +
          (str(args.reason) ? `\nReason logged: ${str(args.reason)}` : '')
      }
      case 'bulk_move_to_stage': {
        const ids = Array.isArray(args.application_ids) ? args.application_ids : []
        const names = await applicationNames(supabase, orgId, ids)
        const { data: stage } = await supabase.from('pipeline_stages').select('name').eq('id', str(args.stage_id)).eq('org_id', orgId).maybeSingle()
        return `➡️ Move ${ids.length} candidate(s) to "${(stage as { name?: string } | null)?.name ?? 'unknown stage'}":\n${nameList(names, ids.length)}`
      }
      case 'update_application_status': {
        const ids = Array.isArray(args.application_ids) ? args.application_ids : []
        const names = await applicationNames(supabase, orgId, ids)
        const verb = { rejected: '🚫 Reject', withdrawn: '↩️ Withdraw', hired: '🎉 Mark as hired' }[String(args.status)] ?? `Set status "${String(args.status)}" for`
        return `${verb} ${ids.length} application(s):\n${nameList(names, ids.length)}`
      }
      case 'update_offer_status': {
        const { data: offer } = await supabase
          .from('offers')
          .select('position_title, status, candidate:candidates(name)')
          .eq('id', str(args.offer_id))
          .eq('org_id', orgId)
          .maybeSingle()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const o = offer as any
        return `📄 Change offer for ${o?.candidate?.name ?? 'unknown candidate'}${o?.position_title ? ` (${o.position_title})` : ''} from "${o?.status ?? '?'}" to "${String(args.status)}"` +
          (str(args.notes) ? `\nNote: ${str(args.notes)}` : '')
      }
      default:
        return genericPreview(tool, args)
    }
  } catch {
    return genericPreview(tool, args)
  }
}

/** One-line card heading for a batch. */
export function batchSummary(actions: PendingAction[]): string {
  const count = (t: string) => actions.filter(a => a.tool === t).length
  const parts: string[] = []
  const emails = count('send_outreach_email') + count('create_interviewer_availability_link')
  if (emails) parts.push(`${emails} email${emails > 1 ? 's' : ''}`)
  const wa = count('send_whatsapp_message')
  if (wa) parts.push(`${wa} WhatsApp message${wa > 1 ? 's' : ''}`)
  const other = actions.length - emails - wa
  if (other) parts.push(`${other} other action${other > 1 ? 's' : ''}`)
  return `Ready to run: ${parts.join(', ')}. Nothing has happened yet.`
}

// ── Storage ───────────────────────────────────────────────────────────────────

export async function savePendingBatch(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  actions: PendingAction[],
): Promise<{ id: string } | { error: string }> {
  const { data, error } = await supabase
    .from('copilot_pending_actions')
    .insert({ org_id: orgId, user_id: userId, actions } as never)
    .select('id')
    .single()
  if (error || !data) return { error: error?.message ?? 'could not save' }
  return { id: (data as { id: string }).id }
}

/** Atomically move a batch from pending → executing for this user. Returns its
 *  actions, or a reason it can't run (already used, cancelled, expired, not yours). */
export async function claimPendingBatch(
  supabase: SupabaseClient,
  id: string,
  orgId: string,
  userId: string,
): Promise<{ actions: PendingAction[] } | { error: string }> {
  const { data, error } = await supabase
    .from('copilot_pending_actions')
    .update({ status: 'executing', decided_at: new Date().toISOString() } as never)
    .eq('id', id)
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .select('actions')
    .maybeSingle()
  if (error) return { error: error.message }
  if (!data) return { error: 'This approval has already been used, was cancelled, or has expired (they last 30 minutes). Ask the copilot to prepare it again.' }
  return { actions: (data as { actions: PendingAction[] }).actions ?? [] }
}

export async function finishPendingBatch(
  supabase: SupabaseClient,
  id: string,
  results: { preview: string; result: string }[],
): Promise<void> {
  await supabase
    .from('copilot_pending_actions')
    .update({ status: 'done', results } as never)
    .eq('id', id)
}

export async function cancelPendingBatch(
  supabase: SupabaseClient,
  id: string,
  orgId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('copilot_pending_actions')
    .update({ status: 'cancelled', decided_at: new Date().toISOString() } as never)
    .eq('id', id)
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()
  return !!data
}
