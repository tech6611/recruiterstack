import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Database,
  ScreeningAnswer,
  ScreeningField,
  ScreeningForm,
  ScreeningQuestion,
} from '@/lib/types/database'
import type { ScreeningQuestionInput } from '@/lib/validations/screening'

type Supabase = SupabaseClient<Database>

// The screening_* tables and jobs.custom_fields.screening are not in the
// generated Database types yet, so reads/writes go through `as any` (the same
// pattern the rest of this module uses for canonical tables).
/* eslint-disable @typescript-eslint/no-explicit-any */

const EMPTY_FORM: ScreeningForm = { fields: [] }

// ── Reusable question library ──────────────────────────────────────────────

export async function listScreeningQuestions(
  supabase: Supabase,
  orgId: string,
  opts: { includeArchived?: boolean } = {},
): Promise<ScreeningQuestion[]> {
  let query = (supabase as any)
    .from('screening_questions')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: true })

  if (!opts.includeArchived) query = query.eq('archived', false)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as ScreeningQuestion[]
}

export async function createScreeningQuestion(
  supabase: Supabase,
  orgId: string,
  input: ScreeningQuestionInput,
): Promise<ScreeningQuestion> {
  const { data, error } = await (supabase as any)
    .from('screening_questions')
    .insert({ org_id: orgId, ...input })
    .select('*')
    .single()

  if (error) throw error
  return data as ScreeningQuestion
}

export async function updateScreeningQuestion(
  supabase: Supabase,
  orgId: string,
  id: string,
  input: Partial<ScreeningQuestionInput>,
): Promise<ScreeningQuestion | null> {
  const { data, error } = await (supabase as any)
    .from('screening_questions')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('org_id', orgId)
    .eq('id', id)
    .select('*')
    .maybeSingle()

  if (error) throw error
  return (data as ScreeningQuestion) ?? null
}

// ── Org default form template ──────────────────────────────────────────────

export async function getOrgScreeningTemplate(
  supabase: Supabase,
  orgId: string,
): Promise<ScreeningForm> {
  const { data, error } = await (supabase as any)
    .from('screening_form_templates')
    .select('fields')
    .eq('org_id', orgId)
    .maybeSingle()

  if (error) throw error
  if (!data) return EMPTY_FORM
  return { fields: ((data.fields ?? []) as ScreeningField[]) }
}

export async function saveOrgScreeningTemplate(
  supabase: Supabase,
  orgId: string,
  form: ScreeningForm,
): Promise<void> {
  const { error } = await (supabase as any)
    .from('screening_form_templates')
    .upsert(
      { org_id: orgId, fields: form.fields, updated_at: new Date().toISOString() },
      { onConflict: 'org_id' },
    )

  if (error) throw error
}

// ── Per-job form (jobs.custom_fields.screening) ────────────────────────────

// Reads a job's screening form. Falls back to the org default template when the
// job has no override of its own (mirrors Ashby's inherit-then-override model).
export async function getJobScreeningForm(
  supabase: Supabase,
  orgId: string,
  jobId: string,
): Promise<ScreeningForm> {
  const { data, error } = await (supabase as any)
    .from('jobs')
    .select('custom_fields')
    .eq('org_id', orgId)
    .eq('id', jobId)
    .maybeSingle()

  if (error) throw error

  const screening = data?.custom_fields?.screening as { fields?: ScreeningField[] } | undefined
  if (screening && Array.isArray(screening.fields)) {
    return { fields: screening.fields }
  }
  return getOrgScreeningTemplate(supabase, orgId)
}

export async function saveJobScreeningForm(
  supabase: Supabase,
  orgId: string,
  jobId: string,
  form: ScreeningForm,
): Promise<void> {
  const { data, error: readErr } = await (supabase as any)
    .from('jobs')
    .select('custom_fields')
    .eq('org_id', orgId)
    .eq('id', jobId)
    .maybeSingle()

  if (readErr) throw readErr

  const customFields = { ...(data?.custom_fields ?? {}), screening: { fields: form.fields } }

  const { error } = await (supabase as any)
    .from('jobs')
    .update({ custom_fields: customFields })
    .eq('org_id', orgId)
    .eq('id', jobId)

  if (error) throw error
}

// ── Knockout evaluation (used on apply-submit) ─────────────────────────────

function valueMatches(answer: ScreeningAnswer['value'], rule: { operator: string; value: string | string[] }): boolean {
  const answerSet = Array.isArray(answer) ? answer : answer == null ? [] : [answer]
  const ruleSet = Array.isArray(rule.value) ? rule.value : [rule.value]

  switch (rule.operator) {
    case 'eq':
      return answerSet.length === 1 && answerSet[0] === ruleSet[0]
    case 'neq':
      return !(answerSet.length === 1 && answerSet[0] === ruleSet[0])
    case 'in':
      return answerSet.some(a => ruleSet.includes(a))
    case 'not_in':
      return !answerSet.some(a => ruleSet.includes(a))
    default:
      return false
  }
}

// Returns true if any answer triggers a disqualifying (knockout) rule.
export function evaluateKnockout(form: ScreeningForm, answers: ScreeningAnswer[]): boolean {
  const byField = new Map(answers.map(a => [a.field_id, a.value]))
  return form.fields.some(field => {
    if (!field.knockout) return false
    const answer = byField.get(field.id) ?? null
    return valueMatches(answer, field.knockout)
  })
}

// Splits submitted answers into the hiring-team bucket and the hidden EEO bucket.
export function partitionAnswers(
  form: ScreeningForm,
  answers: ScreeningAnswer[],
): { screening: ScreeningAnswer[]; eeo: ScreeningAnswer[] } {
  const eeoFields = new Set(form.fields.filter(f => f.is_eeo).map(f => f.id))
  const screening: ScreeningAnswer[] = []
  const eeo: ScreeningAnswer[] = []
  for (const answer of answers) {
    if (eeoFields.has(answer.field_id)) eeo.push(answer)
    else screening.push(answer)
  }
  return { screening, eeo }
}

/* eslint-enable @typescript-eslint/no-explicit-any */
