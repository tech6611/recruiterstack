/* ─── GA4 Analytics Utility ─────────────────────────────────────────────────── */

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
  }
}

// ── Event definitions ──────────────────────────────────────────────────────────

type AnalyticsEvents = {
  // Public conversion events
  apply_page_viewed: { job_title: string }
  cv_uploaded: { file_size_kb: number }
  application_submitted: { job_title: string; has_cv: boolean; has_cover_letter: boolean }
  intake_page_viewed: { position_title: string }
  jd_generation_started: { source: 'intake' | 'dashboard' }
  jd_generated: { source: 'intake' | 'dashboard'; word_count: number }
  intake_submitted: { position_title: string; has_jd: boolean }
  schedule_page_viewed: { is_reschedule: boolean }
  slot_selected: { day_of_week: string }
  interview_scheduled: { duration_minutes: number; is_reschedule: boolean }

  // Auth & pricing
  sign_up_page_viewed: Record<string, never>
  sign_in_page_viewed: Record<string, never>
  pricing_page_viewed: { billing_period: string }
  pricing_cta_clicked: { plan: string; billing_period: string }

  // Dashboard
  job_created: { mode: string; position_title: string }
  job_published: { job_id: string }
  job_unpublished: { job_id: string }
  pipeline_viewed: Record<string, never>
  candidate_stage_changed: { from_status: string; to_status: string }
  candidates_searched: { query_length: number }
  candidates_filtered: { filter_type: string }
  hiring_request_viewed: { request_id: string }

  // AI features
  ai_score_triggered: { job_id: string }
  copilot_message_sent: Record<string, never>
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

function gtag(...args: unknown[]) {
  if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
    window.gtag(...args)
  }
}

export function trackEvent<T extends keyof AnalyticsEvents>(
  name: T,
  params: AnalyticsEvents[T],
) {
  if (process.env.NODE_ENV === 'development') {
    console.debug('[analytics]', name, params)
  }
  gtag('event', name, params)
}

export function setUserProperties(props: {
  org_id?: string
  user_role?: string
}) {
  if (process.env.NODE_ENV === 'development') {
    console.debug('[analytics] user_properties', props)
  }
  gtag('set', 'user_properties', props)
}
