import { createAdminClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'

export type NotificationType =
  | 'candidate_applied'
  | 'interview_scheduled'
  | 'score_complete'
  | 'stage_moved'
  | 'offer_extended'
  | 'task_due'
  | 'system'

interface CreateNotificationParams {
  orgId: string
  userId?: string
  type: NotificationType
  title: string
  body?: string
  resourceType?: string  // e.g. 'candidate', 'application', 'job'
  resourceId?: string
}

/**
 * Insert an in-app notification record.
 * Non-throwing — errors are logged but never propagated.
 */
export async function createNotification(params: CreateNotificationParams): Promise<void> {
  try {
    const supabase = createAdminClient()
    const { error } = await supabase
      .from('notifications')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({
        org_id: params.orgId,
        user_id: params.userId ?? null,
        type: params.type,
        title: params.title,
        body: params.body ?? null,
        resource_type: params.resourceType ?? null,
        resource_id: params.resourceId ?? null,
        read: false,
      } as any)

    if (error) {
      logger.error('Failed to create notification', error, { type: params.type, orgId: params.orgId })
    }
  } catch (err) {
    logger.error('Notification insert exception', err, { type: params.type })
  }
}
