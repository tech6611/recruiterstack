import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Database,
  Okr,
  OkrInsert,
  OkrKeyResult,
  OkrKeyResultInsert,
  OkrKeyResultUpdate,
  OkrStatus,
  OkrUpdate,
} from '@/lib/types/database'

type Supabase = SupabaseClient<Database>

// ── Computed shape ───────────────────────────────────────────────────────────

export interface OkrWithProgress extends Okr {
  /** Average of KR progress, rounded; 0 when no KRs. */
  computed_progress: number
  key_result_count:  number
}

export interface OkrDetail extends OkrWithProgress {
  key_results: OkrKeyResult[]
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length)
}

// ── Reads ────────────────────────────────────────────────────────────────────

export interface ListOkrsFilter {
  ownerEmployeeId?: string
  cycle?:           string
  status?:          OkrStatus
}

export async function listOkrs(
  supabase: Supabase,
  orgId: string,
  filter: ListOkrsFilter = {},
): Promise<OkrWithProgress[]> {
  let q = supabase.from('okrs').select('*').eq('org_id', orgId)
  if (filter.ownerEmployeeId) q = q.eq('owner_employee_id', filter.ownerEmployeeId)
  if (filter.cycle)           q = q.eq('cycle',             filter.cycle)
  if (filter.status)          q = q.eq('status',            filter.status)

  const { data: okrs, error } = await q
    .order('cycle',      { ascending: false })
    .order('sort_order', { ascending: true })
  if (error) throw error
  const list = (okrs ?? []) as Okr[]
  if (list.length === 0) return []

  // One round-trip for KR progress across all returned OKRs.
  const { data: krs } = await supabase
    .from('okr_key_results')
    .select('okr_id, progress')
    .in('okr_id', list.map(o => o.id))

  const byOkr = new Map<string, number[]>()
  for (const k of (krs ?? []) as Array<{ okr_id: string; progress: number }>) {
    const arr = byOkr.get(k.okr_id) ?? []
    arr.push(k.progress)
    byOkr.set(k.okr_id, arr)
  }

  return list.map(o => {
    const progresses = byOkr.get(o.id) ?? []
    return {
      ...o,
      computed_progress: avg(progresses),
      key_result_count:  progresses.length,
    }
  })
}

export async function getOkrDetail(
  supabase: Supabase,
  orgId: string,
  okrId: string,
): Promise<OkrDetail | null> {
  const { data: row, error } = await supabase
    .from('okrs').select('*').eq('id', okrId).eq('org_id', orgId).maybeSingle()
  if (error) throw error
  if (!row) return null
  const okr = row as Okr

  const { data: krs, error: krErr } = await supabase
    .from('okr_key_results')
    .select('*')
    .eq('okr_id', okrId)
    .order('sort_order', { ascending: true })
  if (krErr) throw krErr
  const keyResults = (krs ?? []) as OkrKeyResult[]

  return {
    ...okr,
    key_results:       keyResults,
    computed_progress: avg(keyResults.map(k => k.progress)),
    key_result_count:  keyResults.length,
  }
}

// Convenience used by the cases AI: a one-line summary list for an employee
// across a cycle (defaults to "current" — empty filter returns latest cycle).
export async function listOkrsForEmployee(
  supabase: Supabase,
  orgId: string,
  employeeId: string,
  cycle?: string,
): Promise<OkrWithProgress[]> {
  return listOkrs(supabase, orgId, { ownerEmployeeId: employeeId, cycle })
}

// ── Writes ───────────────────────────────────────────────────────────────────

export interface CreateOkrInput {
  ownerEmployeeId: string
  title:           string
  description?:    string | null
  cycle:           string
  status?:         OkrStatus
}

export async function createOkr(
  supabase: Supabase,
  orgId: string,
  input: CreateOkrInput,
): Promise<Okr> {
  const row: OkrInsert = {
    org_id:            orgId,
    owner_employee_id: input.ownerEmployeeId,
    title:             input.title.trim(),
    description:       input.description ?? null,
    cycle:             input.cycle.trim(),
    status:            input.status ?? 'active',
  }
  const { data, error } = await supabase
    .from('okrs').insert(row as never).select('*').single()
  if (error) throw error
  return data as Okr
}

export async function updateOkr(
  supabase: Supabase,
  orgId: string,
  okrId: string,
  patch: OkrUpdate,
): Promise<Okr> {
  const { data, error } = await supabase
    .from('okrs').update(patch as never)
    .eq('id', okrId).eq('org_id', orgId)
    .select('*').single()
  if (error) throw error
  return data as Okr
}

export async function deleteOkr(
  supabase: Supabase,
  orgId: string,
  okrId: string,
): Promise<void> {
  const { error } = await supabase
    .from('okrs').delete().eq('id', okrId).eq('org_id', orgId)
  if (error) throw error
}

// ── Key results ──────────────────────────────────────────────────────────────

export interface CreateKeyResultInput {
  okrId:          string
  title:          string
  description?:   string | null
  progress?:      number
  targetMetric?:  string | null
  sortOrder?:     number
}

export async function addKeyResult(
  supabase: Supabase,
  orgId: string,
  input: CreateKeyResultInput,
): Promise<OkrKeyResult> {
  const row: OkrKeyResultInsert = {
    org_id:        orgId,
    okr_id:        input.okrId,
    title:         input.title.trim(),
    description:   input.description ?? null,
    progress:      input.progress ?? 0,
    target_metric: input.targetMetric ?? null,
    sort_order:    input.sortOrder ?? 0,
  }
  const { data, error } = await supabase
    .from('okr_key_results').insert(row as never).select('*').single()
  if (error) throw error
  return data as OkrKeyResult
}

export async function updateKeyResult(
  supabase: Supabase,
  orgId: string,
  krId: string,
  patch: OkrKeyResultUpdate,
): Promise<OkrKeyResult> {
  if (patch.progress !== undefined) {
    if (patch.progress < 0 || patch.progress > 100) {
      throw new Error('progress must be between 0 and 100.')
    }
  }
  const { data, error } = await supabase
    .from('okr_key_results').update(patch as never)
    .eq('id', krId).eq('org_id', orgId)
    .select('*').single()
  if (error) throw error
  return data as OkrKeyResult
}

export async function deleteKeyResult(
  supabase: Supabase,
  orgId: string,
  krId: string,
): Promise<void> {
  const { error } = await supabase
    .from('okr_key_results').delete().eq('id', krId).eq('org_id', orgId)
  if (error) throw error
}
