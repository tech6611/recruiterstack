import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

type Supabase = SupabaseClient<Database>

export async function fetchLegacyAnalyticsInputs(
  supabase: Supabase,
  orgId: string,
) {
  const [jobsRes, appsRes, stagesRes, candsRes] = await Promise.all([
    supabase
      .from('hiring_requests')
      .select('id, position_title, department, status')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false }),
    supabase
      .from('applications')
      .select('id, status, source, stage_id, applied_at, hiring_request_id, candidate_id')
      .eq('org_id', orgId),
    supabase
      .from('pipeline_stages')
      .select('id, name, color, order_index, hiring_request_id')
      .eq('org_id', orgId)
      .order('order_index'),
    supabase
      .from('candidates')
      .select('id, status')
      .eq('org_id', orgId),
  ])

  if (jobsRes.error) throw jobsRes.error
  if (appsRes.error) throw appsRes.error
  if (stagesRes.error) throw stagesRes.error
  if (candsRes.error) throw candsRes.error

  return {
    jobs: jobsRes.data ?? [],
    apps: appsRes.data ?? [],
    stages: stagesRes.data ?? [],
    candidates: candsRes.data ?? [],
  }
}

export async function fetchLegacyDashboardInputs(
  supabase: Supabase,
  orgId: string,
) {
  const [jobsRes, stagesRes, appsRes, candidatesRes, eventsRes] = await Promise.all([
    supabase
      .from('hiring_requests')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false }),

    supabase
      .from('pipeline_stages')
      .select('*')
      .eq('org_id', orgId)
      .order('order_index'),

    supabase
      .from('applications')
      .select('id, candidate_id, hiring_request_id, stage_id, status, applied_at, ai_score, ai_recommendation, source')
      .eq('org_id', orgId),

    supabase
      .from('candidates')
      .select('id, name, status, current_title')
      .eq('org_id', orgId),

    supabase
      .from('application_events')
      .select(`
        id, application_id, event_type, to_stage, note, created_at,
        applications (
          candidate_id,
          candidates ( name ),
          hiring_requests ( position_title )
        )
      `)
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  if (jobsRes.error) throw jobsRes.error
  if (stagesRes.error) throw stagesRes.error
  if (appsRes.error) throw appsRes.error
  if (candidatesRes.error) throw candidatesRes.error
  if (eventsRes.error) throw eventsRes.error

  return {
    jobs: jobsRes.data ?? [],
    stages: stagesRes.data ?? [],
    apps: appsRes.data ?? [],
    candidates: candidatesRes.data ?? [],
    events: eventsRes.data ?? [],
  }
}

export async function fetchLegacyPipelineExportInputs(
  supabase: Supabase,
  orgId: string,
) {
  const [jobsRes, stagesRes, appsRes] = await Promise.all([
    supabase
      .from('hiring_requests')
      .select('id, position_title, department')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false }),
    supabase
      .from('pipeline_stages')
      .select('id, hiring_request_id, name, order_index')
      .eq('org_id', orgId)
      .order('order_index'),
    supabase
      .from('applications')
      .select('hiring_request_id, stage_id, status')
      .eq('org_id', orgId),
  ])

  if (jobsRes.error) throw jobsRes.error
  if (stagesRes.error) throw stagesRes.error
  if (appsRes.error) throw appsRes.error

  return {
    jobs: jobsRes.data ?? [],
    stages: stagesRes.data ?? [],
    apps: appsRes.data ?? [],
  }
}
