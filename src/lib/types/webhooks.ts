// Webhook subscription + delivery types — matches migration 038.

export type WebhookDeliveryStatus = 'pending' | 'delivered' | 'failed'

export type WebhookEventType =
  // Opening lifecycle
  | 'opening.submitted'
  | 'opening.approved'
  | 'opening.rejected'
  | 'opening.cancelled'
  // Job lifecycle
  | 'job.submitted'
  | 'job.approved'
  | 'job.published'
  // Approval lifecycle (generic)
  | 'approval.step.pending'
  | 'approval.step.decided'
  | 'approval.completed'

export interface WebhookSubscription {
  id: string
  org_id: string
  name: string
  url: string
  event_types: WebhookEventType[]
  secret: string
  is_active: boolean
  last_success_at: string | null
  last_failure_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface WebhookSubscriptionInsert extends Omit<WebhookSubscription,
  'id' | 'created_at' | 'updated_at' | 'is_active' | 'last_success_at' | 'last_failure_at' | 'created_by'> {
  id?: string
  is_active?: boolean
  last_success_at?: string | null
  last_failure_at?: string | null
  created_by?: string | null
  created_at?: string
  updated_at?: string
}

export interface WebhookSubscriptionUpdate extends Partial<WebhookSubscriptionInsert> {}

export interface WebhookDelivery {
  id: string
  org_id: string
  subscription_id: string
  event_type: WebhookEventType | string
  event_id: string
  payload: Record<string, unknown>
  status: WebhookDeliveryStatus
  attempt: number
  response_status: number | null
  response_body: string | null
  error: string | null
  scheduled_at: string
  delivered_at: string | null
  created_at: string
}

export interface WebhookDeliveryInsert extends Omit<WebhookDelivery,
  'id' | 'created_at' | 'status' | 'attempt' | 'response_status' | 'response_body' | 'error' | 'delivered_at'> {
  id?: string
  status?: WebhookDeliveryStatus
  attempt?: number
  response_status?: number | null
  response_body?: string | null
  error?: string | null
  delivered_at?: string | null
  created_at?: string
}
