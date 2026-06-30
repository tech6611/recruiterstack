import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import type { Opening } from '@/lib/types/requisitions'
import type { OpeningCreateInput } from '@/lib/validations/openings'
import { submitForApproval, ApprovalError } from '@/lib/approvals/engine'

type Supabase = SupabaseClient<Database>

export async function getOpeningById(
  supabase: Supabase,
  orgId: string,
  openingId: string,
): Promise<Opening | null> {
  const { data, error } = await supabase
    .from('openings')
    .select('*')
    .eq('org_id', orgId)
    .eq('id', openingId)
    .maybeSingle()

  if (error) throw error
  return data as Opening | null
}

/**
 * Create a draft opening (requisition). Single source of truth for both
 * POST /api/openings and the copilot `create_opening` tool.
 *
 * `input` is the Zod-validated `openingCreateSchema` output (defaults already
 * applied). If a comp band is linked and comp values fall outside it,
 * `out_of_band` is computed here. status is always 'draft'; created_by and the
 * default recruiter are stamped from the acting user.
 */
export async function createOpening(
  supabase: Supabase,
  orgId: string,
  userId: string,
  input: OpeningCreateInput,
): Promise<Opening> {
  let outOfBand = input.out_of_band
  if (input.comp_band_id && (input.comp_min !== null || input.comp_max !== null)) {
    const { data: band } = await supabase
      .from('compensation_bands')
      .select('min_salary, max_salary')
      .eq('id', input.comp_band_id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (band) {
      const b = band as { min_salary: number; max_salary: number }
      const minOut = input.comp_min !== null && Number(input.comp_min) < b.min_salary
      const maxOut = input.comp_max !== null && Number(input.comp_max) > b.max_salary
      outOfBand = minOut || maxOut
    }
  }

  const { data, error } = await supabase
    .from('openings')
    .insert({
      org_id:            orgId,
      title:             input.title,
      department_id:     input.department_id ?? null,
      location_id:       input.location_id ?? null,
      employment_type:   input.employment_type,
      comp_min:          input.comp_min,
      comp_max:          input.comp_max,
      comp_currency:     input.comp_currency,
      comp_band_id:      input.comp_band_id ?? null,
      out_of_band:       outOfBand,
      target_start_date: input.target_start_date,
      hiring_manager_id: input.hiring_manager_id ?? null,
      recruiter_id:      input.recruiter_id ?? userId,
      justification:     input.justification ?? null,
      external_id:       input.external_id ?? null,
      custom_fields:     input.custom_fields ?? {},
      status:            'draft',
      created_by:        userId,
    })
    .select()
    .single()

  if (error) throw error
  return data as Opening
}

/** Thrown by submitOpeningForApproval with an HTTP-ish status so callers
 *  (API route, copilot tool) can surface a clean message. */
export class OpeningSubmitError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.name = 'OpeningSubmitError'
    this.status = status
  }
}

export interface SubmitOpeningResult {
  approvalId: string
  status: string
  autoApproved: boolean
}

/**
 * Move a draft opening to pending_approval (or approved, if the chain
 * auto-completes). Single source of truth for POST /api/openings/[id]/submit
 * and the copilot `submit_opening_for_approval` tool. Enforces the draft state,
 * the 50-char justification rule, and required custom fields, then runs the
 * approval engine and stamps the opening.
 */
export async function submitOpeningForApproval(
  supabase: Supabase,
  orgId: string,
  userId: string,
  openingId: string,
): Promise<SubmitOpeningResult> {
  const { data: row, error } = await supabase
    .from('openings')
    .select('*')
    .eq('id', openingId)
    .eq('org_id', orgId)
    .single()
  if (error || !row) throw new OpeningSubmitError('Opening not found', 404)
  const opening = row as Opening

  if (opening.status !== 'draft') {
    throw new OpeningSubmitError(`Opening is in '${opening.status}', not 'draft'.`, 409)
  }
  if (!opening.justification || opening.justification.trim().length < 50) {
    throw new OpeningSubmitError('Justification must be at least 50 characters before submitting.', 400)
  }

  // Required custom fields must be present.
  const { data: defsRaw } = await supabase
    .from('custom_field_definitions')
    .select('field_key, label, field_type')
    .eq('org_id', orgId)
    .eq('object_type', 'opening')
    .eq('is_active', true)
    .eq('required', true)
  const required = (defsRaw ?? []) as Array<{ field_key: string; label: string; field_type: string }>
  const cf = (opening.custom_fields ?? {}) as Record<string, unknown>
  const missing: string[] = []
  for (const def of required) {
    const v = cf[def.field_key]
    if (
      v === null || v === undefined ||
      (typeof v === 'string' && v.trim() === '') ||
      (Array.isArray(v) && v.length === 0)
    ) {
      missing.push(def.label)
    }
  }
  if (missing.length > 0) {
    throw new OpeningSubmitError(`Required custom fields missing: ${missing.join(', ')}.`, 400)
  }

  let result
  try {
    result = await submitForApproval({
      orgId,
      targetType:  'opening',
      targetId:    opening.id,
      target:      opening as unknown as Record<string, unknown>,
      requesterId: userId,
    })
  } catch (err) {
    if (err instanceof ApprovalError) {
      throw new OpeningSubmitError(err.message, err.status)
    }
    throw err
  }

  const newStatus = result.status === 'approved' ? 'approved' : 'pending_approval'
  await supabase
    .from('openings')
    .update({ approval_id: result.approvalId, status: newStatus })
    .eq('id', opening.id)

  return {
    approvalId:   result.approvalId,
    status:       result.status,
    autoApproved: result.autoApproved,
  }
}

/** List openings (newest first), with department/location names resolved for
 *  display. Optional status filter. Used by the copilot `list_openings` tool. */
export async function listOpenings(
  supabase: Supabase,
  orgId: string,
  opts: { status?: string | null; limit?: number } = {},
): Promise<Array<Record<string, unknown>>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase
    .from('openings')
    .select(
      'id, title, status, employment_type, comp_min, comp_max, comp_currency, ' +
      'target_start_date, department:departments(name), location:locations(name)',
    )
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 25)
  if (opts.status) q = q.eq('status', opts.status)

  const { data, error } = await q
  if (error) throw error
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []) as any
}

/** One opening with department/location names resolved. Returns null if not
 *  found in the org. Used by the copilot `get_opening` tool. */
export async function getOpeningDetail(
  supabase: Supabase,
  orgId: string,
  openingId: string,
): Promise<Record<string, unknown> | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('openings')
    .select(
      'id, title, status, employment_type, comp_min, comp_max, comp_currency, ' +
      'comp_band_id, out_of_band, target_start_date, justification, ' +
      'hiring_manager_id, recruiter_id, ' +
      'department:departments(name), location:locations(name)',
    )
    .eq('org_id', orgId)
    .eq('id', openingId)
    .maybeSingle()

  if (error) throw error
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? null) as any
}

/** Lookup lists the copilot needs to turn free-text into the IDs an opening
 *  requires: departments, locations, compensation bands, and team members
 *  (org_members joined to users — `user_id` is the value used for
 *  hiring_manager_id / recruiter_id). Active rows only. */
export async function listOpeningLookups(
  supabase: Supabase,
  orgId: string,
): Promise<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  departments: any[]; locations: any[]; compBands: any[]; team: any[]
}> {
  const [depts, locs, bands, members] = await Promise.all([
    supabase.from('departments')
      .select('id, name').eq('org_id', orgId).eq('is_active', true).order('name'),
    supabase.from('locations')
      .select('id, name, city').eq('org_id', orgId).eq('is_active', true).order('name'),
    supabase.from('compensation_bands')
      .select('id, name, level, min_salary, max_salary, currency')
      .eq('org_id', orgId).eq('is_active', true).order('name'),
    supabase.from('org_members')
      .select('user_id, role, users:user_id(full_name, email)')
      .eq('org_id', orgId).eq('is_active', true),
  ])
  return {
    departments: depts.data ?? [],
    locations:   locs.data ?? [],
    compBands:   bands.data ?? [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    team:        (members.data ?? []) as any[],
  }
}
