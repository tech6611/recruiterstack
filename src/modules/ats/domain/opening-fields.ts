/**
 * Opening (requisition) field manifest — the SINGLE source of truth for which
 * fields the AI copilot may set when creating a requisition.
 *
 * Three consumers read from this one definition, so they can never drift apart:
 *   1. `openingToolInputSchema()` generates the copilot tool's input_schema, so
 *      the agent automatically knows about (and can ask for) every listed field.
 *   2. `buildOpeningCreateInput()` maps agent args → the domain create input,
 *      resolving name/email fields to ids and REFUSING to silently drop a value
 *      it has no home for (the historical "vanished field" bug).
 *   3. A compile-time drift check (bottom of file) fails `npm run typecheck` if
 *      the `Opening` row type gains a business column this manifest neither maps
 *      nor explicitly excludes — turning a silent gap into a build failure.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import type { Opening } from '@/lib/types/requisitions'
import type { CreateOpeningInput } from '@/modules/ats/domain/openings'
import {
  findDepartmentByName,
  findLocationByName,
  findUserByEmail,
} from '@/modules/ats/domain/openings'

type Supabase = SupabaseClient<Database>

/** Context passed to a field resolver. */
export interface ResolveCtx {
  supabase: Supabase
  orgId: string
}

/** Thrown by a resolver when an agent-supplied value can't be matched (e.g. "no
 *  location named X"). Carries a user-facing message the tool returns verbatim. */
export class FieldResolutionError extends Error {}

export interface OpeningFieldDef {
  /** The argument name the copilot passes. */
  key: string
  /** The DB column on `openings` this field writes (used by the drift check). */
  column: keyof Opening
  /** The `CreateOpeningInput` property this field maps to. */
  inputKey: keyof CreateOpeningInput
  /** Plain-English label + description (the description is what the agent sees,
   *  so it includes any dependency hint that helps it ask good questions). */
  description: string
  type: 'string' | 'number'
  required?: boolean
  enumValues?: readonly string[]
  /** When present, the agent supplies a human value (name/email) that must be
   *  resolved to an id. Returns the id, or throws FieldResolutionError. */
  resolve?: (ctx: ResolveCtx, value: string) => Promise<string>
}

export const OPENING_FIELDS = [
  {
    key: 'title',
    column: 'title',
    inputKey: 'title',
    description: 'Job title for the requisition',
    type: 'string',
    required: true,
  },
  {
    key: 'department',
    column: 'department_id',
    inputKey: 'departmentId',
    description: 'Department name (optional — must match an existing department in this org)',
    type: 'string',
    resolve: async (ctx, value) => {
      const dept = await findDepartmentByName(ctx.supabase, ctx.orgId, value)
      if (!dept) throw new FieldResolutionError(`No department named "${value}" exists. Create it first, or leave the department out.`)
      return dept.id
    },
  },
  {
    key: 'location',
    column: 'location_id',
    inputKey: 'locationId',
    description: 'Work location name (optional — must match an existing location/office in this org)',
    type: 'string',
    resolve: async (ctx, value) => {
      const loc = await findLocationByName(ctx.supabase, ctx.orgId, value)
      if (!loc) throw new FieldResolutionError(`No location named "${value}" exists. Create it first, or leave the location out.`)
      return loc.id
    },
  },
  {
    key: 'hiring_manager',
    column: 'hiring_manager_id',
    inputKey: 'hiringManagerId',
    description: "Hiring manager's email address (optional — must be a member of this org)",
    type: 'string',
    resolve: async (ctx, value) => {
      const user = await findUserByEmail(ctx.supabase, ctx.orgId, value)
      if (!user) throw new FieldResolutionError(`No org member with email "${value}" was found. Invite them first, or leave the hiring manager out.`)
      return user.id
    },
  },
  {
    key: 'hiring_manager_name',
    column: 'hiring_manager_name',
    inputKey: 'hiringManagerName',
    description: "Hiring manager's name — free-typed contact that flows down to the job (need not be an org member)",
    type: 'string',
  },
  {
    key: 'hiring_manager_email',
    column: 'hiring_manager_email',
    inputKey: 'hiringManagerEmail',
    description: "Hiring manager's email — free-typed contact that flows to the job and powers the interview booking link; required before the requisition can be submitted for approval",
    type: 'string',
  },
  {
    key: 'employment_type',
    column: 'employment_type',
    inputKey: 'employmentType',
    description: 'Employment type (optional, default full_time)',
    type: 'string',
    enumValues: ['full_time', 'part_time', 'contract', 'intern', 'temp'],
  },
  {
    key: 'comp_min',
    column: 'comp_min',
    inputKey: 'compMin',
    description: 'Minimum compensation (optional)',
    type: 'number',
  },
  {
    key: 'comp_max',
    column: 'comp_max',
    inputKey: 'compMax',
    description: 'Maximum compensation (optional)',
    type: 'number',
  },
  {
    key: 'comp_currency',
    column: 'comp_currency',
    inputKey: 'compCurrency',
    description: 'Three-letter currency code (optional, default USD)',
    type: 'string',
  },
  {
    key: 'target_start_date',
    column: 'target_start_date',
    inputKey: 'targetStartDate',
    description: 'Target start date, YYYY-MM-DD (optional)',
    type: 'string',
  },
  {
    key: 'justification',
    column: 'justification',
    inputKey: 'justification',
    description: 'Business justification for the headcount (optional here, but required — min 50 chars — before it can be submitted for approval)',
    type: 'string',
  },
] as const satisfies readonly OpeningFieldDef[]

/** The manifest widened to the uniform `OpeningFieldDef` shape. Iterate THIS in
 *  the runtime helpers below: the `as const` above keeps each element's literal
 *  `column` type (so the drift check stays honest), but that also makes optional
 *  props like `resolve`/`enumValues` absent from the members that don't set them.
 *  The widened view restores a single shape with those props typed as optional. */
const FIELDS: readonly OpeningFieldDef[] = OPENING_FIELDS

/** Columns on `openings` that are intentionally NOT agent-settable — system
 *  bookkeeping, workflow-managed status, or deferred features. Listed explicitly
 *  so the drift check can tell "handled elsewhere" apart from "forgotten". */
export const EXCLUDED_OPENING_COLUMNS = [
  'id',
  'org_id',
  'external_id',      // HRIS sync bookkeeping
  'comp_band_id',     // deferred — comp bands not yet wired into the copilot
  'out_of_band',      // auto-derived from comp vs band
  'recruiter_id',     // stamped to the acting user
  'status',           // workflow-managed (draft → approval engine)
  'approval_id',      // set by the approval engine
  'custom_fields',    // free-form escape hatch, not a first-class field
  'created_by',
  'created_at',
  'updated_at',
] as const satisfies readonly (keyof Opening)[]

/** Build the copilot tool's input_schema from the manifest. Adding a field to
 *  OPENING_FIELDS automatically exposes it to the agent. */
export function openingToolInputSchema(): Record<string, unknown> {
  const properties: Record<string, unknown> = {}
  const required: string[] = []
  for (const f of FIELDS) {
    const prop: Record<string, unknown> = { type: f.type, description: f.description }
    if (f.enumValues) prop.enum = f.enumValues
    properties[f.key] = prop
    if (f.required) required.push(f.key)
  }
  return { type: 'object', properties, required }
}

/**
 * Turn raw copilot args into a `CreateOpeningInput`, resolving name/email fields
 * to ids along the way. Throws FieldResolutionError (user-facing message) when a
 * value can't be resolved, and a plain Error when handed a field the manifest
 * doesn't know — so a value is NEVER silently dropped.
 */
export async function buildOpeningCreateInput(
  ctx: ResolveCtx,
  input: Record<string, unknown>,
): Promise<CreateOpeningInput> {
  const title = typeof input.title === 'string' ? input.title.trim() : ''
  const out: CreateOpeningInput = { title }

  for (const [key, value] of Object.entries(input)) {
    if (key === 'title') continue
    if (value == null || value === '') continue

    const field = FIELDS.find(f => f.key === key)
    if (!field) {
      // No silent drop: an arg with nowhere to go is a manifest/tool mismatch,
      // surfaced loudly rather than quietly discarded.
      throw new Error(`Requisition create received unknown field "${key}"; refusing to silently drop it.`)
    }

    let columnValue: unknown
    if (field.resolve) {
      columnValue = await field.resolve(ctx, String(value))
    } else if (field.type === 'number') {
      columnValue = typeof value === 'number' ? value : Number(value)
    } else {
      columnValue = value
    }

    // inputKey is a valid CreateOpeningInput property by construction.
    ;(out as unknown as Record<string, unknown>)[field.inputKey] = columnValue
  }

  return out
}

// ── Compile-time drift check ─────────────────────────────────────────────────
// If `Opening` gains a column that is neither mapped by a manifest field nor in
// EXCLUDED_OPENING_COLUMNS, `Unaccounted` stops being `never` and the assignment
// below fails `npm run typecheck` with a message naming the stray column(s).
type ManifestColumn = (typeof OPENING_FIELDS)[number]['column']
type ExcludedColumn = (typeof EXCLUDED_OPENING_COLUMNS)[number]
type Unaccounted = Exclude<keyof Opening, ManifestColumn | ExcludedColumn>
type DriftCheck = [Unaccounted] extends [never]
  ? true
  : { ERROR: 'openings column not in manifest or EXCLUDED list'; columns: Unaccounted }
const _driftCheck: DriftCheck = true
void _driftCheck
