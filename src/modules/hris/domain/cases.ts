import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Database,
  HrCase,
  HrCaseAuthorRole,
  HrCaseCategory,
  HrCaseInsert,
  HrCaseMessage,
  HrCaseMessageInsert,
  HrCaseStatus,
} from '@/lib/types/database'
import { COPILOT_TOOLS } from '@/lib/copilot-tools'
import { runSubAgent } from '@/lib/agents/sub-agent'
import { createNotification } from '@/lib/api/notify'

type Supabase = SupabaseClient<Database>

const SLA_HOURS = 48
const MODEL     = 'claude-opus-4-6'

// Read-only HRIS tools the AI uses for HR-case auto-answer. Whitelist —
// explicitly excludes write tools (mark_*, record_*, set_*, decide_*,
// request_*, start_*, complete_*) so the auto-answer can't accidentally
// take destructive actions on the requester's behalf.
const HRIS_READ_TOOL_NAMES = new Set([
  'list_employees',
  'get_employee_history',
  'get_employee_compensation',
  'get_direct_reports',
  'list_time_off',
  'get_employee_onboarding',
  'list_onboarding_templates',
  'list_onboarding_plans',
])
const HRIS_READ_TOOLS: Anthropic.Tool[] = COPILOT_TOOLS.filter(t =>
  HRIS_READ_TOOL_NAMES.has(t.name),
)

// ── Reads ────────────────────────────────────────────────────────────────────

export interface CaseWithRequester extends HrCase {
  requester: { name: string | null; email: string | null } | null
}

async function enrichCases(
  supabase: Supabase,
  rows: HrCase[],
): Promise<CaseWithRequester[]> {
  if (rows.length === 0) return []
  const userIds = Array.from(new Set(rows.map(r => r.requester_user_id)))
  const { data: users } = await supabase
    .from('users')
    .select('id, full_name, email')
    .in('id', userIds)
  const byId = new Map(
    (users ?? []).map(u => {
      const row = u as { id: string; full_name: string | null; email: string }
      return [row.id, { name: row.full_name, email: row.email }]
    }),
  )
  return rows.map(r => ({
    ...r,
    requester: byId.get(r.requester_user_id) ?? null,
  }))
}

export async function listCases(
  supabase: Supabase,
  orgId: string,
  filter: { status?: HrCaseStatus; category?: HrCaseCategory } = {},
): Promise<CaseWithRequester[]> {
  let q = supabase.from('hr_cases').select('*').eq('org_id', orgId)
  if (filter.status)   q = q.eq('status',   filter.status)
  if (filter.category) q = q.eq('category', filter.category)
  const { data, error } = await q.order('created_at', { ascending: false })
  if (error) throw error
  return enrichCases(supabase, (data ?? []) as HrCase[])
}

export async function listMyCases(
  supabase: Supabase,
  orgId: string,
  userId: string,
): Promise<HrCase[]> {
  const { data, error } = await supabase
    .from('hr_cases')
    .select('*')
    .eq('org_id', orgId)
    .eq('requester_user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as HrCase[]
}

export async function getCase(
  supabase: Supabase,
  orgId: string,
  caseId: string,
): Promise<{ case: CaseWithRequester; messages: HrCaseMessage[] } | null> {
  const { data: caseRow, error: caseErr } = await supabase
    .from('hr_cases').select('*').eq('id', caseId).eq('org_id', orgId).maybeSingle()
  if (caseErr) throw caseErr
  if (!caseRow) return null

  const [enriched] = await enrichCases(supabase, [caseRow as HrCase])

  const { data: msgs, error: msgErr } = await supabase
    .from('hr_case_messages')
    .select('*')
    .eq('org_id', orgId)
    .eq('case_id', caseId)
    .order('created_at', { ascending: true })
  if (msgErr) throw msgErr

  return { case: enriched, messages: (msgs ?? []) as HrCaseMessage[] }
}

// ── Writes ───────────────────────────────────────────────────────────────────

export interface CreateCaseInput {
  requesterUserId:      string
  requesterEmployeeId?: string | null
  category:             HrCaseCategory
  subject:              string
  body:                 string
}

export async function createCase(
  supabase: Supabase,
  orgId: string,
  input: CreateCaseInput,
): Promise<HrCase> {
  const slaDueAt = new Date(Date.now() + SLA_HOURS * 3600 * 1000).toISOString()

  const row: HrCaseInsert = {
    org_id:                orgId,
    requester_user_id:     input.requesterUserId,
    requester_employee_id: input.requesterEmployeeId ?? null,
    category:              input.category,
    subject:               input.subject,
    body:                  input.body,
    sla_due_at:            slaDueAt,
  }
  const { data, error } = await supabase
    .from('hr_cases').insert(row as never).select('*').single()
  if (error) throw error
  const created = data as HrCase

  // Fire-and-forget AI auto-answer attempt. Doesn't block case creation.
  void attemptAiAnswer(supabase, orgId, created).catch(() => {})

  // Notify any admins (they all get pinged for new cases in v1).
  void notifyAdminsOfNewCase(supabase, orgId, created).catch(() => {})

  return created
}

export async function addMessage(
  supabase: Supabase,
  orgId: string,
  caseId: string,
  authorRole: HrCaseAuthorRole,
  body: string,
  authorUserId: string | null,
): Promise<HrCaseMessage> {
  const row: HrCaseMessageInsert = {
    org_id:         orgId,
    case_id:        caseId,
    author_role:    authorRole,
    body,
    author_user_id: authorUserId,
  }
  const { data, error } = await supabase
    .from('hr_case_messages').insert(row as never).select('*').single()
  if (error) throw error

  // If HR replies, flip status to in_progress (if still open). Don't change
  // status on employee replies; they often follow an HR reply.
  if (authorRole === 'hr') {
    await supabase
      .from('hr_cases')
      .update({ status: 'in_progress' } as never)
      .eq('id', caseId).eq('org_id', orgId).eq('status', 'open')
  }

  // Notification: HR reply → requester. Employee reply → assigned HR.
  void notifyOnReply(supabase, orgId, caseId, authorRole).catch(() => {})

  return data as HrCaseMessage
}

export async function updateCaseStatus(
  supabase: Supabase,
  orgId: string,
  caseId: string,
  newStatus: HrCaseStatus,
  byUserId: string | null,
): Promise<HrCase> {
  const patch: Record<string, unknown> = { status: newStatus }
  if (newStatus === 'resolved' || newStatus === 'closed') {
    patch.resolved_at         = new Date().toISOString()
    patch.resolved_by_user_id = byUserId
  }
  const { data, error } = await supabase
    .from('hr_cases')
    .update(patch as never)
    .eq('id', caseId).eq('org_id', orgId)
    .select('*').single()
  if (error) throw error
  return data as HrCase
}

export async function assignCase(
  supabase: Supabase,
  orgId: string,
  caseId: string,
  assigneeUserId: string | null,
): Promise<HrCase> {
  const { data, error } = await supabase
    .from('hr_cases')
    .update({ assigned_to_user_id: assigneeUserId } as never)
    .eq('id', caseId).eq('org_id', orgId)
    .select('*').single()
  if (error) throw error
  return data as HrCase
}

// ── AI auto-answer (THE differentiator) ──────────────────────────────────────
// Runs the HRIS sub-agent against the case with a read-only tool subset and a
// focused HR-helpdesk prompt. Whatever the agent answers becomes the first
// case message with author_role='agent'. Fire-and-forget; safe if it fails.

async function attemptAiAnswer(
  supabase: Supabase,
  orgId: string,
  hrCase: HrCase,
): Promise<void> {
  // Build context: requester's profile so the agent can resolve them by id/email.
  let requesterContext = ''
  if (hrCase.requester_employee_id) {
    const { data: emp } = await supabase
      .from('employee_profiles')
      .select('id, person:people(name, email)')
      .eq('id', hrCase.requester_employee_id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (emp) {
      const e = emp as unknown as { id: string; person: { name: string; email: string } | null }
      requesterContext = `\nREQUESTER (employee_id: ${e.id}): ${e.person?.name ?? 'unknown'} <${e.person?.email ?? 'unknown'}>`
    }
  }

  const systemPrompt = `You are the HR-helpdesk first responder inside RecruiterStack. An employee has submitted an HR case; you are the first to see it before any HR person. Your job is to look up the answer from the unified person/employee data and respond clearly and warmly — OR honestly say you can't and an HR teammate will follow up.

You have READ-ONLY access to HRIS data (timeline, compensation, time-off, manager, onboarding plans). You CANNOT take actions on the employee's behalf. Use 2–4 short paragraphs. Always address the employee by first name if known. End with: "If this didn't fully answer your question, just reply and a member of our HR team will follow up."

If the question is sensitive (complaint, harassment, escalation about a person, immigration, anything that obviously needs a human), do NOT try to answer with data. Instead respond briefly: "Thanks for raising this. An HR team member will follow up with you directly." That's the right answer in those cases.

Be honest. If the data doesn't have what's needed, say so plainly rather than guess.`

  const task = `An employee submitted this HR case:${requesterContext}

CATEGORY: ${hrCase.category}
SUBJECT: ${hrCase.subject}
BODY: ${hrCase.body}

Look up whatever data is needed and write a helpful reply.`

  let answer = ''
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    answer = await runSubAgent({
      client,
      model: MODEL,
      tools: HRIS_READ_TOOLS,
      systemPrompt,
      task,
      orgId,
      supabase,
    })
  } catch {
    answer = ''
  }

  // Always stamp ai_attempted_at so HR can see we tried.
  await supabase
    .from('hr_cases')
    .update({ ai_attempted_at: new Date().toISOString() } as never)
    .eq('id', hrCase.id)
    .eq('org_id', orgId)

  if (answer.trim()) {
    await addMessage(supabase, orgId, hrCase.id, 'agent', answer.trim(), null)
    // Notify the employee that the AI replied (so they can read it).
    void createNotification({
      orgId,
      userId:       hrCase.requester_user_id,
      type:         'system',
      title:        'We took a first pass at your HR question',
      body:         `Your case "${hrCase.subject}" has a reply — read it on /me/cases.`,
      resourceType: 'hr_case',
      resourceId:   hrCase.id,
    })
  }
}

// ── Notifications wiring ─────────────────────────────────────────────────────

async function notifyAdminsOfNewCase(
  supabase: Supabase,
  orgId: string,
  hrCase: HrCase,
): Promise<void> {
  const { data: admins } = await supabase
    .from('org_members')
    .select('user_id')
    .eq('org_id', orgId)
    .eq('role', 'admin')
    .eq('is_active', true)
  for (const a of (admins ?? []) as Array<{ user_id: string }>) {
    void createNotification({
      orgId,
      userId:       a.user_id,
      type:         'system',
      title:        `New HR case: ${hrCase.subject}`,
      body:         `Category: ${hrCase.category}. SLA due in 48h.`,
      resourceType: 'hr_case',
      resourceId:   hrCase.id,
    })
  }
}

async function notifyOnReply(
  supabase: Supabase,
  orgId: string,
  caseId: string,
  authorRole: HrCaseAuthorRole,
): Promise<void> {
  if (authorRole !== 'hr' && authorRole !== 'employee') return

  const { data: row } = await supabase
    .from('hr_cases')
    .select('requester_user_id, assigned_to_user_id, subject')
    .eq('id', caseId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!row) return
  const c = row as { requester_user_id: string; assigned_to_user_id: string | null; subject: string }

  if (authorRole === 'hr') {
    void createNotification({
      orgId,
      userId:       c.requester_user_id,
      type:         'system',
      title:        'HR replied to your case',
      body:         c.subject,
      resourceType: 'hr_case',
      resourceId:   caseId,
    })
  } else if (c.assigned_to_user_id) {
    void createNotification({
      orgId,
      userId:       c.assigned_to_user_id,
      type:         'system',
      title:        'Employee replied to a case',
      body:         c.subject,
      resourceType: 'hr_case',
      resourceId:   caseId,
    })
  }
}
