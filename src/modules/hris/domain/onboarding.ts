import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Database,
  OnboardingPlan,
  OnboardingPlanStatus,
  OnboardingTask,
  OnboardingTemplate,
  OnboardingTemplateTask,
} from '@/lib/types/database'
import { createNotification } from '@/lib/api/notify'

type Supabase = SupabaseClient<Database>

// ── Templates ────────────────────────────────────────────────────────────────

export async function listTemplates(
  supabase: Supabase,
  orgId: string,
): Promise<OnboardingTemplate[]> {
  const { data, error } = await supabase
    .from('onboarding_templates')
    .select('*')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as OnboardingTemplate[]
}

export async function getTemplateTasks(
  supabase: Supabase,
  templateId: string,
): Promise<OnboardingTemplateTask[]> {
  const { data, error } = await supabase
    .from('onboarding_template_tasks')
    .select('*')
    .eq('template_id', templateId)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return (data ?? []) as OnboardingTemplateTask[]
}

// ── Plans ────────────────────────────────────────────────────────────────────

export interface PlanWithProgress extends OnboardingPlan {
  total_tasks: number
  completed_tasks: number
}

function addDaysISO(startDate: string, days: number): string {
  const d = new Date(startDate + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export interface CreatePlanInput {
  employeeId: string
  templateId: string
  startDate?: string | null    // defaults to employee's start_date or today
  startedBy?: string | null
}

// Creates a plan + snapshots all tasks from the template with concrete due dates
// computed from start_date + due_offset_days. Fires a "your onboarding has
// started" notification to the new hire (if they're a Clerk user).
export async function createPlanFromTemplate(
  supabase: Supabase,
  orgId: string,
  input: CreatePlanInput,
): Promise<{ plan: OnboardingPlan; tasks: OnboardingTask[] }> {
  // 1. resolve template + its tasks + employee start_date
  const [tplRes, tasksRes, empRes] = await Promise.all([
    supabase
      .from('onboarding_templates')
      .select('id, name, org_id')
      .eq('id', input.templateId)
      .eq('org_id', orgId)
      .maybeSingle(),
    supabase
      .from('onboarding_template_tasks')
      .select('*')
      .eq('template_id', input.templateId)
      .order('sort_order', { ascending: true }),
    supabase
      .from('employee_profiles')
      .select('start_date, user_id, person_id')
      .eq('id', input.employeeId)
      .eq('org_id', orgId)
      .maybeSingle(),
  ])

  if (tplRes.error) throw tplRes.error
  if (tasksRes.error) throw tasksRes.error
  if (empRes.error) throw empRes.error
  const tpl = tplRes.data as { id: string; name: string; org_id: string } | null
  if (!tpl) throw new Error('Template not found in this org.')
  const tplTasks = (tasksRes.data ?? []) as OnboardingTemplateTask[]
  const emp = empRes.data as { start_date: string | null; user_id: string | null; person_id: string | null } | null

  const todayISO = new Date().toISOString().slice(0, 10)
  const startDate = input.startDate ?? emp?.start_date ?? todayISO

  // 2. insert the plan row
  const { data: planRow, error: planErr } = await supabase
    .from('onboarding_plans')
    .insert({
      org_id:        orgId,
      employee_id:   input.employeeId,
      template_id:   tpl.id,
      template_name: tpl.name,
      start_date:    startDate,
      started_by:    input.startedBy ?? null,
    } as never)
    .select('*')
    .single()
  if (planErr) throw planErr
  const plan = planRow as OnboardingPlan

  // 3. snapshot tasks with computed due_date
  if (tplTasks.length > 0) {
    const taskRows = tplTasks.map(t => ({
      org_id:        orgId,
      plan_id:       plan.id,
      sort_order:    t.sort_order,
      title:         t.title,
      description:   t.description ?? null,
      assignee_role: t.assignee_role,
      due_date:      addDaysISO(startDate, t.due_offset_days),
    }))
    const { error: taskErr } = await supabase
      .from('onboarding_tasks')
      .insert(taskRows as never)
    if (taskErr) throw taskErr
  }

  const tasks = await listPlanTasks(supabase, orgId, plan.id)

  // 4. notify the new hire (if a Clerk user)
  if (emp?.user_id) {
    void createNotification({
      orgId,
      userId:       emp.user_id,
      type:         'system',
      title:        'Your onboarding has started',
      body:         `${tpl.name} — ${tasks.length} task${tasks.length === 1 ? '' : 's'} starting ${startDate}`,
      resourceType: 'onboarding_plan',
      resourceId:   plan.id,
    })
  }

  return { plan, tasks }
}

export async function listPlanTasks(
  supabase: Supabase,
  orgId: string,
  planId: string,
): Promise<OnboardingTask[]> {
  const { data, error } = await supabase
    .from('onboarding_tasks')
    .select('*')
    .eq('org_id', orgId)
    .eq('plan_id', planId)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return (data ?? []) as OnboardingTask[]
}

export async function listPlans(
  supabase: Supabase,
  orgId: string,
  statusFilter?: OnboardingPlanStatus,
): Promise<PlanWithProgress[]> {
  let q = supabase
    .from('onboarding_plans')
    .select('*')
    .eq('org_id', orgId)
  if (statusFilter) q = q.eq('status', statusFilter)
  const { data, error } = await q.order('started_at', { ascending: false })
  if (error) throw error
  const plans = (data ?? []) as OnboardingPlan[]
  if (plans.length === 0) return []

  // Aggregate task counts in one query.
  const { data: tasksRaw } = await supabase
    .from('onboarding_tasks')
    .select('plan_id, status')
    .eq('org_id', orgId)
    .in('plan_id', plans.map(p => p.id))

  const counts = new Map<string, { total: number; done: number }>()
  for (const t of (tasksRaw ?? []) as Array<{ plan_id: string; status: string }>) {
    const c = counts.get(t.plan_id) ?? { total: 0, done: 0 }
    c.total += 1
    if (t.status === 'completed') c.done += 1
    counts.set(t.plan_id, c)
  }
  return plans.map(p => ({
    ...p,
    total_tasks:     counts.get(p.id)?.total ?? 0,
    completed_tasks: counts.get(p.id)?.done  ?? 0,
  }))
}

export async function getActivePlanForEmployee(
  supabase: Supabase,
  orgId: string,
  employeeId: string,
): Promise<OnboardingPlan | null> {
  const { data, error } = await supabase
    .from('onboarding_plans')
    .select('*')
    .eq('org_id', orgId)
    .eq('employee_id', employeeId)
    .eq('status', 'in_progress')
    .maybeSingle()
  if (error) throw error
  return (data as OnboardingPlan) ?? null
}

// ── Tasks ────────────────────────────────────────────────────────────────────

export async function completeTask(
  supabase: Supabase,
  orgId: string,
  taskId: string,
  completedBy: string | null,
): Promise<OnboardingTask> {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('onboarding_tasks')
    .update({
      status:       'completed',
      completed_at: now,
      completed_by: completedBy,
    } as never)
    .eq('id', taskId)
    .eq('org_id', orgId)
    .eq('status', 'pending')                     // idempotent: only pending→completed
    .select('*')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Task not found or already completed.')
  const task = data as OnboardingTask

  // If this completes the plan, flip the plan status.
  await maybeCompletePlan(supabase, orgId, task.plan_id)

  return task
}

async function maybeCompletePlan(
  supabase: Supabase,
  orgId: string,
  planId: string,
): Promise<void> {
  const { data: remaining } = await supabase
    .from('onboarding_tasks')
    .select('id', { head: true, count: 'exact' })
    .eq('org_id', orgId)
    .eq('plan_id', planId)
    .eq('status', 'pending')
  // Supabase returns count on the response; for head:true the count comes through.
  // Defensive: also fetch a single row to confirm pending == 0.
  const { count } = await supabase
    .from('onboarding_tasks')
    .select('id', { head: true, count: 'exact' })
    .eq('org_id', orgId)
    .eq('plan_id', planId)
    .eq('status', 'pending')
  void remaining
  if ((count ?? 0) === 0) {
    await supabase
      .from('onboarding_plans')
      .update({ status: 'completed', completed_at: new Date().toISOString() } as never)
      .eq('id', planId)
      .eq('org_id', orgId)
      .eq('status', 'in_progress')
  }
}

// "Tasks for the calling user" — joins via employee_profiles.user_id and the
// in-progress plan; returns only tasks assigned to the new_hire role.
export async function listMyOnboardingTasks(
  supabase: Supabase,
  orgId: string,
  userId: string,
): Promise<{ plan: OnboardingPlan | null; tasks: OnboardingTask[] }> {
  const { data: emp } = await supabase
    .from('employee_profiles')
    .select('id')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .in('status', ['pending', 'active'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const employeeId = (emp as { id: string } | null)?.id ?? null
  if (!employeeId) return { plan: null, tasks: [] }

  const plan = await getActivePlanForEmployee(supabase, orgId, employeeId)
  if (!plan) return { plan: null, tasks: [] }

  const tasks = (await listPlanTasks(supabase, orgId, plan.id))
    .filter(t => t.assignee_role === 'new_hire')
  return { plan, tasks }
}
