/**
 * AI Copilot — Tool definitions and implementations
 *
 * COPILOT_TOOLS  : Anthropic tool schema array (passed to the API)
 * executeTool()  : Routes a tool call to the right Supabase query
 */

import Anthropic from '@anthropic-ai/sdk'
import { SupabaseClient } from '@supabase/supabase-js'

// ── Tool definitions ──────────────────────────────────────────────────────────

export const COPILOT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'search_candidates',
    description:
      'Search for candidates by name, current job title, or skills. Returns matching candidates with status and active job applications.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Name, title, or keyword (e.g. "Jane", "React", "Software Engineer")',
        },
        status: {
          type: 'string',
          enum: ['active', 'inactive', 'interviewing', 'offer_extended', 'hired', 'rejected'],
          description: 'Optional: filter by candidate status',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_job_pipeline',
    description:
      "Get a job's complete hiring pipeline: all stages with candidate names, AI scores, and application IDs. Use this before moving candidates to get stage IDs.",
    input_schema: {
      type: 'object',
      properties: {
        job_id: {
          type: 'string',
          description: 'UUID of the job/hiring request — use when you have the exact ID',
        },
        job_title_query: {
          type: 'string',
          description: 'Job title to search for (e.g. "Senior PM", "Backend Engineer") — use when you don\'t have the exact ID',
        },
      },
    },
  },
  {
    name: 'list_jobs',
    description:
      'List all hiring requests with status, hiring manager, department, and active candidate counts.',
    input_schema: {
      type: 'object',
      properties: {
        status_filter: {
          type: 'string',
          enum: ['intake_pending', 'intake_submitted', 'jd_generated', 'jd_sent', 'jd_approved', 'posted'],
          description: 'Optional: filter by job status',
        },
      },
    },
  },
  {
    name: 'get_dashboard_stats',
    description:
      'Get high-level recruiting metrics: total jobs, active candidates, interviewing count, and total hired.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'find_stale_applications',
    description:
      'Find active applications with no pipeline activity in the last N days. Helps identify neglected candidates.',
    input_schema: {
      type: 'object',
      properties: {
        days: {
          type: 'number',
          description: 'Inactivity threshold in days (default: 7)',
        },
      },
    },
  },
  {
    name: 'get_candidate',
    description:
      'Get full profile for a specific candidate: skills, experience, status, and all applications with current stage.',
    input_schema: {
      type: 'object',
      properties: {
        candidate_id: {
          type: 'string',
          description: 'UUID of the candidate — use when you have the exact ID',
        },
        candidate_name_query: {
          type: 'string',
          description: 'Candidate name to search for — use when you don\'t have the exact ID',
        },
      },
    },
  },
  {
    name: 'move_application_to_stage',
    description:
      "Move a candidate's application to a specific pipeline stage. Call get_job_pipeline first to get valid stage IDs.",
    input_schema: {
      type: 'object',
      properties: {
        application_id: {
          type: 'string',
          description: 'UUID of the application to move',
        },
        stage_id: {
          type: 'string',
          description: 'UUID of the target pipeline stage',
        },
        note: {
          type: 'string',
          description: 'Optional note explaining the move',
        },
      },
      required: ['application_id', 'stage_id'],
    },
  },
  {
    name: 'add_note_to_application',
    description: "Add a text note to an application's activity log.",
    input_schema: {
      type: 'object',
      properties: {
        application_id: {
          type: 'string',
          description: 'UUID of the application',
        },
        note: {
          type: 'string',
          description: 'The note text to record',
        },
      },
      required: ['application_id', 'note'],
    },
  },
]

// ── Tool executor ─────────────────────────────────────────────────────────────

export async function executeTool(
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  try {
    switch (name) {
      case 'search_candidates':     return await searchCandidates(input, orgId, supabase)
      case 'get_job_pipeline':      return await getJobPipeline(input, orgId, supabase)
      case 'list_jobs':             return await listJobs(input, orgId, supabase)
      case 'get_dashboard_stats':   return await getDashboardStats(orgId, supabase)
      case 'find_stale_applications': return await findStaleApplications(input, orgId, supabase)
      case 'get_candidate':         return await getCandidate(input, orgId, supabase)
      case 'move_application_to_stage': return await moveApplicationToStage(input, orgId, supabase)
      case 'add_note_to_application':   return await addNoteToApplication(input, orgId, supabase)
      default:                      return `Unknown tool: ${name}`
    }
  } catch (err) {
    return `Error executing ${name}: ${err instanceof Error ? err.message : 'Unknown error'}`
  }
}

// ── Read tools ────────────────────────────────────────────────────────────────

async function searchCandidates(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const { query, status } = input

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase
    .from('candidates')
    .select('id, name, email, current_title, status, skills, experience_years, location')
    .eq('org_id', orgId)

  if (query) {
    q = q.or(`name.ilike.%${query}%,current_title.ilike.%${query}%`)
  }
  if (status) q = q.eq('status', status)

  const { data, error } = await q.order('created_at', { ascending: false }).limit(20)
  if (error) return `Error: ${error.message}`
  if (!data || data.length === 0) return `No candidates found matching "${query}"${status ? ` with status "${status}"` : ''}.`

  // Active applications per candidate
  const candidateIds = data.map((c: { id: string }) => c.id)
  const { data: apps } = await supabase
    .from('applications')
    .select('candidate_id, hiring_request:hiring_requests(position_title)')
    .in('candidate_id', candidateIds)
    .eq('org_id', orgId)
    .eq('status', 'active')

  const appsByCandidate: Record<string, string[]> = {}
  for (const app of apps ?? []) {
    const cid = (app as { candidate_id: string }).candidate_id
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const title = (app.hiring_request as any)?.position_title
    if (!appsByCandidate[cid]) appsByCandidate[cid] = []
    if (title) appsByCandidate[cid].push(title)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lines = data.map((c: any) => {
    const jobs = appsByCandidate[c.id] ?? []
    return [
      `• ${c.name}`,
      c.current_title ?? 'No title',
      `${c.experience_years ?? 0}y exp`,
      `status: ${c.status}`,
      c.email,
      jobs.length > 0 ? `active in: ${jobs.join(', ')}` : null,
      `ID: ${c.id}`,
    ].filter(Boolean).join(' | ')
  })

  return `Found ${data.length} candidate(s):\n${lines.join('\n')}`
}

async function getJobPipeline(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const { job_id, job_title_query } = input

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let jobQuery: any = supabase
    .from('hiring_requests')
    .select('id, position_title, status, hiring_manager_name, department')
    .eq('org_id', orgId)

  if (job_id) {
    jobQuery = jobQuery.eq('id', job_id)
  } else if (job_title_query) {
    jobQuery = jobQuery.ilike('position_title', `%${job_title_query}%`)
  } else {
    return 'Error: provide either job_id or job_title_query'
  }

  const { data: jobs, error: jobErr } = await jobQuery.limit(5)
  if (jobErr) return `Error: ${jobErr.message}`
  if (!jobs || jobs.length === 0) return `No job found matching "${job_title_query ?? job_id}".`

  if (jobs.length > 1 && !job_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return `Multiple jobs found — be more specific or use job_id:\n${jobs.map((j: any) => `• ${j.position_title} (${j.status}) — ID: ${j.id}`).join('\n')}`
  }

  const job = jobs[0]

  const [stagesRes, appsRes] = await Promise.all([
    supabase
      .from('pipeline_stages')
      .select('id, name, order_index')
      .eq('hiring_request_id', job.id)
      .eq('org_id', orgId)
      .order('order_index'),
    supabase
      .from('applications')
      .select('id, stage_id, ai_score, candidate:candidates(name)')
      .eq('hiring_request_id', job.id)
      .eq('org_id', orgId)
      .eq('status', 'active'),
  ])

  if (stagesRes.error) return `Error fetching stages: ${stagesRes.error.message}`

  const stages = stagesRes.data ?? []
  const apps   = appsRes.data ?? []

  // Group candidates by stage
  const stageMap: Record<string, { name: string; candidates: string[] }> = {}
  for (const s of stages) stageMap[s.id] = { name: s.name, candidates: [] }

  const unstaged: string[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const app of apps as any[]) {
    const name  = app.candidate?.name ?? 'Unknown'
    const score = app.ai_score ? ` (score: ${app.ai_score})` : ''
    const entry = `${name}${score} [appId: ${app.id}]`

    if (app.stage_id && stageMap[app.stage_id]) {
      stageMap[app.stage_id].candidates.push(entry)
    } else {
      unstaged.push(entry)
    }
  }

  let result = `**${job.position_title}** (${job.status})\n`
  result += `Hiring Manager: ${job.hiring_manager_name}${job.department ? ` | ${job.department}` : ''}\n`
  result += `Total active candidates: ${apps.length}\n`
  result += `\nPipeline:\n`

  for (const stage of stages) {
    const { name, candidates } = stageMap[stage.id]
    result += `\n${name} (${candidates.length} candidates):\n`
    for (const c of candidates) result += `  • ${c}\n`
    if (candidates.length === 0) result += `  (empty)\n`
  }

  if (unstaged.length > 0) {
    result += `\nUnassigned (${unstaged.length}):\n`
    for (const c of unstaged) result += `  • ${c}\n`
  }

  result += `\nStage IDs (for move_application_to_stage):\n`
  for (const stage of stages) result += `• ${stage.name}: ${stage.id}\n`

  return result
}

async function listJobs(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const { status_filter } = input

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase
    .from('hiring_requests')
    .select('id, position_title, status, hiring_manager_name, department, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  if (status_filter) q = q.eq('status', status_filter)

  const { data: jobs, error } = await q
  if (error) return `Error: ${error.message}`
  if (!jobs || jobs.length === 0) return 'No jobs found.'

  const jobIds = jobs.map((j: { id: string }) => j.id)
  const { data: appCounts } = await supabase
    .from('applications')
    .select('hiring_request_id')
    .in('hiring_request_id', jobIds)
    .eq('org_id', orgId)
    .eq('status', 'active')

  const countByJob: Record<string, number> = {}
  for (const app of appCounts ?? []) {
    const id = (app as { hiring_request_id: string }).hiring_request_id
    countByJob[id] = (countByJob[id] ?? 0) + 1
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lines = jobs.map((j: any) => {
    const count = countByJob[j.id] ?? 0
    return `• ${j.position_title}${j.department ? ` (${j.department})` : ''} | ${j.status} | HM: ${j.hiring_manager_name} | ${count} candidates | ID: ${j.id}`
  })

  return `${jobs.length} job(s):\n${lines.join('\n')}`
}

async function getDashboardStats(orgId: string, supabase: SupabaseClient): Promise<string> {
  const [jobsRes, activeRes, interviewingRes, hiredRes] = await Promise.all([
    supabase.from('hiring_requests').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
    supabase.from('candidates').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'active'),
    supabase.from('candidates').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'interviewing'),
    supabase.from('candidates').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'hired'),
  ])

  return `Recruiting overview:
• Total jobs: ${jobsRes.count ?? 0}
• Active candidates: ${activeRes.count ?? 0}
• Currently interviewing: ${interviewingRes.count ?? 0}
• Total hired: ${hiredRes.count ?? 0}`
}

async function findStaleApplications(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const days   = input.days ?? 7
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const { data: apps, error: appsErr } = await supabase
    .from('applications')
    .select('id, applied_at, pipeline_stages(name), hiring_request:hiring_requests(position_title), candidate:candidates(name)')
    .eq('org_id', orgId)
    .eq('status', 'active')

  if (appsErr) return `Error: ${appsErr.message}`
  if (!apps || apps.length === 0) return 'No active applications found.'

  const appIds = apps.map((a: { id: string }) => a.id)

  // Get most recent event per application
  const { data: events } = await supabase
    .from('application_events')
    .select('application_id, created_at')
    .in('application_id', appIds)
    .order('created_at', { ascending: false })

  const latestEvent: Record<string, string> = {}
  for (const ev of events ?? []) {
    const e = ev as { application_id: string; created_at: string }
    if (!latestEvent[e.application_id]) latestEvent[e.application_id] = e.created_at
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stale = (apps as any[]).filter(app => {
    const last = latestEvent[app.id] ?? app.applied_at
    return last < cutoff
  })

  if (stale.length === 0) return `No stale applications — all have activity in the last ${days} days. ✓`

  stale.sort((a: { id: string; applied_at: string }, b: { id: string; applied_at: string }) => {
    const aDate = latestEvent[a.id] ?? a.applied_at
    const bDate = latestEvent[b.id] ?? b.applied_at
    return aDate < bDate ? -1 : 1
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lines = stale.map((app: any) => {
    const last     = latestEvent[app.id] ?? app.applied_at
    const daysAgo  = Math.floor((Date.now() - new Date(last).getTime()) / 86_400_000)
    const job      = app.hiring_request?.position_title ?? 'Unknown job'
    const candidate = app.candidate?.name ?? 'Unknown'
    const stage    = app.pipeline_stages?.name ?? 'Unassigned'
    return `• ${candidate} | ${job} | Stage: ${stage} | Last activity: ${daysAgo}d ago | appId: ${app.id}`
  })

  return `${stale.length} stale application(s) (no activity in ${days}+ days):\n${lines.join('\n')}`
}

async function getCandidate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const { candidate_id, candidate_name_query } = input

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase
    .from('candidates')
    .select('id, name, email, phone, current_title, skills, experience_years, location, status, linkedin_url')
    .eq('org_id', orgId)

  if (candidate_id) {
    q = q.eq('id', candidate_id)
  } else if (candidate_name_query) {
    q = q.ilike('name', `%${candidate_name_query}%`)
  } else {
    return 'Error: provide either candidate_id or candidate_name_query'
  }

  const { data: candidates, error } = await q.limit(3)
  if (error) return `Error: ${error.message}`
  if (!candidates || candidates.length === 0) return `No candidate found matching "${candidate_name_query ?? candidate_id}".`

  if (candidates.length > 1) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return `Multiple candidates found — be more specific:\n${candidates.map((c: any) => `• ${c.name} | ${c.current_title ?? 'No title'} | ${c.email} | ID: ${c.id}`).join('\n')}`
  }

  const c = candidates[0]

  const { data: apps } = await supabase
    .from('applications')
    .select('id, status, applied_at, ai_score, pipeline_stages(name), hiring_request:hiring_requests(position_title, status)')
    .eq('candidate_id', c.id)
    .eq('org_id', orgId)
    .order('applied_at', { ascending: false })

  let result = `${c.name}\n`
  result += `Email: ${c.email}${c.phone ? ` | Phone: ${c.phone}` : ''}\n`
  result += `Title: ${c.current_title ?? 'Not specified'} | ${c.experience_years ?? 0} years exp\n`
  result += `Location: ${c.location ?? 'Not specified'} | Status: ${c.status}\n`
  if (c.skills?.length > 0) result += `Skills: ${c.skills.join(', ')}\n`
  if (c.linkedin_url) result += `LinkedIn: ${c.linkedin_url}\n`
  result += `ID: ${c.id}\n`

  if (apps && apps.length > 0) {
    result += `\nApplications:\n`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const app of apps as any[]) {
      const job   = app.hiring_request?.position_title ?? 'Unknown'
      const stage = app.pipeline_stages?.name ?? 'Unassigned'
      const score = app.ai_score ? ` | AI score: ${app.ai_score}` : ''
      result += `• ${job} | Stage: ${stage} | ${app.status}${score} | appId: ${app.id}\n`
    }
  }

  return result
}

// ── Write tools ───────────────────────────────────────────────────────────────

async function moveApplicationToStage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const { application_id, stage_id, note } = input

  // Verify application exists in this org
  const { data: current, error: fetchErr } = await supabase
    .from('applications')
    .select('id, pipeline_stages(name), candidate:candidates(name), hiring_request:hiring_requests(position_title)')
    .eq('id', application_id)
    .eq('org_id', orgId)
    .single()

  if (fetchErr || !current) return `Application not found or not in your organization.`

  // Verify new stage exists in this org
  const { data: newStage, error: stageErr } = await supabase
    .from('pipeline_stages')
    .select('id, name')
    .eq('id', stage_id)
    .eq('org_id', orgId)
    .single()

  if (stageErr || !newStage) return `Stage not found in your organization.`

  const { error: updateErr } = await supabase
    .from('applications')
    .update({ stage_id } as never)
    .eq('id', application_id)
    .eq('org_id', orgId)

  if (updateErr) return `Error moving application: ${updateErr.message}`

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fromStage     = (current.pipeline_stages as any)?.name ?? 'unknown'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidateName = (current.candidate as any)?.name ?? 'Candidate'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jobTitle      = (current.hiring_request as any)?.position_title ?? 'Unknown job'

  await supabase.from('application_events').insert({
    application_id,
    event_type: 'stage_moved',
    from_stage: fromStage,
    to_stage:   newStage.name,
    note:       note ?? 'Moved by AI Copilot',
    created_by: 'AI Copilot',
    org_id:     orgId,
  } as never)

  return `Moved ${candidateName} from "${fromStage}" to "${newStage.name}" in ${jobTitle}.`
}

async function addNoteToApplication(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const { application_id, note } = input

  if (!note?.trim()) return 'Error: note cannot be empty'

  const { data: app, error: fetchErr } = await supabase
    .from('applications')
    .select('id, candidate:candidates(name), hiring_request:hiring_requests(position_title)')
    .eq('id', application_id)
    .eq('org_id', orgId)
    .single()

  if (fetchErr || !app) return `Application not found or not in your organization.`

  const { error: insertErr } = await supabase.from('application_events').insert({
    application_id,
    event_type: 'note_added',
    note,
    created_by: 'AI Copilot',
    org_id:     orgId,
  } as never)

  if (insertErr) return `Error adding note: ${insertErr.message}`

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidateName = (app.candidate as any)?.name ?? 'Candidate'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jobTitle      = (app.hiring_request as any)?.position_title ?? 'Unknown job'

  return `Note added to ${candidateName}'s application for ${jobTitle}.`
}
