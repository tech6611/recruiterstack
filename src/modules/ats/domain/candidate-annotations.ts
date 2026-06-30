import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, TaskStatus } from '@/lib/types/database'

/**
 * Candidate annotations facade: tags + tasks. Shared by the
 * /api/candidates/[id]/{tags,tasks} routes and the copilot tools so both write
 * through one path.
 */

type Supabase = SupabaseClient<Database>

export class AnnotationError extends Error {
  status: number
  constructor(message: string, status = 500) {
    super(message)
    this.name = 'AnnotationError'
    this.status = status
  }
}

export async function listCandidateTags(
  supabase: Supabase,
  orgId: string,
  candidateId: string,
): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await supabase
    .from('candidate_tags')
    .select('*')
    .eq('candidate_id', candidateId)
    .eq('org_id', orgId)
    .order('created_at', { ascending: true })
  if (error) throw new AnnotationError(error.message)
  return (data ?? []) as Array<Record<string, unknown>>
}

/** Add a tag (normalised lower-case). Throws AnnotationError(409) on duplicate. */
export async function addCandidateTag(
  supabase: Supabase,
  orgId: string,
  candidateId: string,
  rawTag: string,
): Promise<Record<string, unknown>> {
  const tag = rawTag?.trim().toLowerCase()
  if (!tag) throw new AnnotationError('tag is required', 400)

  const { data, error } = await supabase
    .from('candidate_tags')
    .insert({ org_id: orgId, candidate_id: candidateId, tag } as never)
    .select()
    .single()
  if (error) {
    if (error.code === '23505') throw new AnnotationError('Tag already exists', 409)
    throw new AnnotationError(error.message)
  }
  return data as Record<string, unknown>
}

export async function listCandidateTasks(
  supabase: Supabase,
  orgId: string,
  candidateId: string,
): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await supabase
    .from('candidate_tasks')
    .select('*')
    .eq('candidate_id', candidateId)
    .eq('org_id', orgId)
    .order('completed_at', { ascending: true, nullsFirst: true })
    .order('due_date',      { ascending: true, nullsFirst: false })
    .order('created_at',    { ascending: false })
  if (error) throw new AnnotationError(error.message)
  return (data ?? []) as Array<Record<string, unknown>>
}

export interface CreateTaskInput {
  title: string
  description?: string | null
  dueDate?: string | null
  assigneeName?: string | null
  applicationId?: string | null
  createdBy?: string | null
  status?: TaskStatus
}

/** Create a candidate task. Tolerates DBs where the `status` column hasn't been
 *  migrated yet by retrying the insert without it (mirrors the route). */
export async function createCandidateTask(
  supabase: Supabase,
  orgId: string,
  candidateId: string,
  input: CreateTaskInput,
): Promise<Record<string, unknown>> {
  const title = input.title?.trim()
  if (!title) throw new AnnotationError('title is required', 400)

  const baseInsert = {
    org_id:         orgId,
    candidate_id:   candidateId,
    application_id: input.applicationId ?? null,
    title,
    description:    input.description ?? null,
    due_date:       input.dueDate ?? null,
    assignee_name:  input.assigneeName ?? null,
    created_by:     input.createdBy ?? 'Recruiter',
  }
  const statusValue = (input.status ?? 'to_do') as TaskStatus

  const { data, error } = await supabase
    .from('candidate_tasks')
    .insert({ ...baseInsert, status: statusValue } as never)
    .select()
    .single()
  if (error) {
    if (error.code === '42703' || error.message?.includes('status')) {
      const { data: data2, error: error2 } = await supabase
        .from('candidate_tasks')
        .insert(baseInsert as never)
        .select()
        .single()
      if (error2) throw new AnnotationError(error2.message)
      return { ...(data2 as Record<string, unknown>), status: statusValue }
    }
    throw new AnnotationError(error.message)
  }
  return data as Record<string, unknown>
}
