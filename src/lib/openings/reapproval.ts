// Pure helpers for "which requisition edits need re-approval" (Ashby model).
// No I/O here — see change-requests.ts for the database side.

/** Built-in opening fields an admin may gate. Order = display order. */
export const GATEABLE_OPENING_FIELDS = [
  'title', 'department_id', 'location_id', 'employment_type',
  'comp_min', 'comp_max', 'comp_currency', 'comp_band_id',
  'target_start_date', 'target_hire_date', 'hiring_manager_id', 'recruiter_id', 'coordinator_id', 'sourcer_id', 'is_backfill',
] as const
export type GateableField = typeof GATEABLE_OPENING_FIELDS[number]

/** Default gated set (migration 141). Hiring manager deliberately not included. */
export const DEFAULT_OPENING_REAPPROVAL_FIELDS: GateableField[] = [
  'comp_min', 'comp_max', 'comp_currency', 'comp_band_id',
  'target_start_date', 'employment_type', 'department_id',
]

export const OPENING_FIELD_LABEL: Record<string, string> = {
  title: 'Title', department_id: 'Department', location_id: 'Location', employment_type: 'Employment type',
  comp_min: 'Compensation min', comp_max: 'Compensation max', comp_currency: 'Currency', comp_band_id: 'Compensation band',
  target_start_date: 'Target start date', hiring_manager_id: 'Hiring manager', hiring_manager_name: 'Hiring manager name',
  hiring_manager_email: 'Hiring manager email', recruiter_id: 'Recruiter', coordinator_id: 'Recruiting coordinator', sourcer_id: 'Sourcer', justification: 'Justification',
  external_id: 'External id', out_of_band: 'Out of band', target_hire_date: 'Target hire date', is_backfill: 'Backfill', backfill_for: 'Backfill for', number: 'Number',
}

/** Fields never diffed / never gated (server-derived or identity). */
const IGNORED = new Set(['id', 'org_id', 'status', 'approval_id', 'created_by', 'created_at', 'updated_at', 'out_of_band', 'number', 'opened_at', 'filled_at', 'filled_by_application_id', 'closed_at', 'close_reason', 'close_note', 'status_before_archive'])

export type FieldChange = { field: string; before: unknown; after: unknown }

const NUMERIC_FIELDS = new Set(['comp_min', 'comp_max'])
const norm = (v: unknown, field?: string): unknown => {
  if (v === undefined || v === null) return null
  if (typeof v === 'string') {
    const t = v.trim()
    if (t === '') return null
    // NUMERIC columns come back from Postgres as strings ("150000.00").
    if (field && NUMERIC_FIELDS.has(field) && !Number.isNaN(Number(t))) return Number(t)
    return t
  }
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  return v
}
const same = (a: unknown, b: unknown, field?: string): boolean => {
  const x = norm(a, field), y = norm(b, field)
  if (x === null || y === null) return x === y
  // comp values arrive as numeric strings from the DB and numbers from Zod.
  if ((typeof x === 'number' || typeof y === 'number') && !Number.isNaN(Number(x)) && !Number.isNaN(Number(y))) return Number(x) === Number(y)
  return JSON.stringify(x) === JSON.stringify(y)
}

/**
 * Which fields would actually change if `patch` were applied to `current`.
 * Custom fields are compared per key and reported as `custom_fields.<key>`.
 */
export function diffOpeningPatch(current: Record<string, unknown>, patch: Record<string, unknown>): FieldChange[] {
  const out: FieldChange[] = []
  for (const [k, v] of Object.entries(patch)) {
    if (IGNORED.has(k) || v === undefined) continue
    if (k === 'custom_fields') {
      const cur = (current.custom_fields ?? {}) as Record<string, unknown>
      const next = (v ?? {}) as Record<string, unknown>
      for (const [ck, cv] of Object.entries(next)) {
        if (!same(cur[ck], cv)) out.push({ field: `custom_fields.${ck}`, before: cur[ck] ?? null, after: norm(cv) })
      }
      continue
    }
    if (!same(current[k], v, k)) out.push({ field: k, before: norm(current[k], k), after: norm(v, k) })
  }
  return out
}

/** Split changes into those that apply now and those that need re-approval. */
export function splitByGate(changes: FieldChange[], gated: Iterable<string>): { immediate: FieldChange[]; gated: FieldChange[] } {
  const g = new Set(gated)
  const immediate: FieldChange[] = [], gatedOut: FieldChange[] = []
  for (const c of changes) (g.has(c.field) ? gatedOut : immediate).push(c)
  return { immediate, gated: gatedOut }
}

/** Rebuild a DB patch from a list of changes (custom_fields merged onto current). */
export function changesToPatch(changes: FieldChange[], current: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  let cf: Record<string, unknown> | null = null
  for (const c of changes) {
    if (c.field.startsWith('custom_fields.')) {
      cf ??= { ...((current.custom_fields ?? {}) as Record<string, unknown>) }
      cf[c.field.slice('custom_fields.'.length)] = c.after
    } else {
      patch[c.field] = c.after
    }
  }
  if (cf) patch.custom_fields = cf
  return patch
}

/** Human label for a field key, including `custom_fields.<key>`. */
export function openingFieldLabel(field: string, customLabels: Record<string, string> = {}): string {
  if (field.startsWith('custom_fields.')) {
    const k = field.slice('custom_fields.'.length)
    return customLabels[k] ?? k
  }
  return OPENING_FIELD_LABEL[field] ?? field
}

/** `{field: value}` maps for storing on a change request. */
export function changesToMaps(changes: FieldChange[]): { previous: Record<string, unknown>; proposed: Record<string, unknown> } {
  const previous: Record<string, unknown> = {}, proposed: Record<string, unknown> = {}
  for (const c of changes) { previous[c.field] = c.before; proposed[c.field] = c.after }
  return { previous, proposed }
}

/** Inverse of changesToMaps. */
export function mapsToChanges(previous: Record<string, unknown>, proposed: Record<string, unknown>): FieldChange[] {
  return Object.keys(proposed).map(field => ({ field, before: previous[field] ?? null, after: proposed[field] }))
}
