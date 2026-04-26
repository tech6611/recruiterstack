import { createAdminClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import type { ApprovalTargetType, AuditAction } from '@/lib/types/approvals'

export interface AuditEntry {
  org_id:        string
  approval_id?:  string | null
  target_type?:  ApprovalTargetType | null
  target_id?:    string | null
  actor_user_id?: string | null
  action:        AuditAction | string
  from_state?:   string | null
  to_state?:     string | null
  metadata?:     Record<string, unknown>
}

/**
 * Fire-and-forget audit log writer. Errors are logged but never propagate —
 * we don't want a failed audit insert to abort the user's action.
 */
export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    const supabase = createAdminClient()
    const { error } = await supabase.from('approval_audit_log').insert({
      org_id:        entry.org_id,
      approval_id:   entry.approval_id ?? null,
      target_type:   entry.target_type ?? null,
      target_id:     entry.target_id ?? null,
      actor_user_id: entry.actor_user_id ?? null,
      action:        entry.action,
      from_state:    entry.from_state ?? null,
      to_state:      entry.to_state ?? null,
      metadata:      entry.metadata ?? {},
    })
    if (error) logger.error('audit write failed', error, { action: entry.action })
  } catch (err) {
    logger.error('audit write threw', err, { action: entry.action })
  }
}
