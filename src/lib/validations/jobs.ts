import { z } from 'zod'

const uuidOrNull = z.preprocess(
  v => (v === '' || v === undefined ? null : v),
  z.string().uuid().nullable(),
)

const jobBase = z.object({
  title:             z.string().trim().min(1).max(200),
  department_id:     uuidOrNull.optional().default(null),
  description:       z.string().trim().max(20000).nullable().optional(),
  hiring_team_id:    uuidOrNull.optional().default(null),
  confidentiality:   z.enum(['public', 'confidential']).default('public'),
  custom_fields:     z.record(z.string(), z.unknown()).optional().default({}),
})

export const jobCreateSchema = jobBase

// ── Intake create ────────────────────────────────────────────────
// The New Job form posts a richer payload than the bare canonical job row:
// a department *name* (find-or-create), the generated/written JD, comp range,
// and a list of openings (one row per location, each with a seat count). All
// the softer intake fields (level, HM details, requirements, target companies)
// ride along in `intake` and are stashed into the job's custom_fields so
// nothing the user typed is discarded on create.
const compNumOrNull = z.preprocess(
  v => (v === '' || v === undefined || v === null ? null : Number(v)),
  z.number().min(0).nullable(),
)

export const jobIntakeOpeningSchema = z.object({
  location: z.string().trim().max(200).optional().default(''),
  seats:    z.coerce.number().int().min(1).max(50).optional().default(1),
})

export const jobIntakeCreateSchema = z.object({
  title:           z.string().trim().min(1).max(200),
  department:      z.string().trim().max(200).optional().default(''),
  description:     z.string().trim().max(20000).optional().default(''),
  confidentiality: z.enum(['public', 'confidential']).optional().default('public'),
  comp_min:        compNumOrNull.optional().default(null),
  comp_max:        compNumOrNull.optional().default(null),
  remote_ok:       z.boolean().optional().default(false),
  openings:        z.array(jobIntakeOpeningSchema).max(20).optional().default([]),
  intake:          z.record(z.string(), z.unknown()).optional().default({}),
  // When the job is created from an already-approved requisition, we link that
  // existing opening instead of minting new ones (see /api/req-jobs POST).
  link_opening_id: uuidOrNull.optional().default(null),
})

export type JobIntakeCreateInput = z.infer<typeof jobIntakeCreateSchema>

// ── Send-to-Hiring-Manager intake ────────────────────────────────
// The "Send to HM" path on the New Job drawer: creates a draft job linked to an
// approved requisition, flags it as awaiting the HM's input, and emails the HM a
// public /intake/<token> link. The HM's email is required (that's who we send to);
// their name is optional. Any locked/flow-through fields (title, department, etc.)
// ride along in `intake`.
export const jobSendIntakeSchema = z.object({
  title:                z.string().trim().min(1).max(200),
  department:           z.string().trim().max(200).optional().default(''),
  confidentiality:      z.enum(['public', 'confidential']).optional().default('public'),
  link_opening_id:      uuidOrNull.optional().default(null),
  hiring_manager_name:  z.string().trim().max(200).optional().default(''),
  hiring_manager_email: z.string().trim().email().max(200),
  intake:               z.record(z.string(), z.unknown()).optional().default({}),
})

export type JobSendIntakeInput = z.infer<typeof jobSendIntakeSchema>

// Update accepts every base field plus `status` (board-level transitions such as
// the HM approve action that flips a job to 'open'). status is constrained to the
// canonical jobs status set (migration 035).
//
// IMPORTANT: this schema is intentionally defined WITHOUT the `.default()` values
// that `jobBase` carries for create. A PATCH is a partial/merge: a field the
// client omits must stay genuinely ABSENT after parsing. If defaults were applied,
// omitted fields like `department_id`/`confidentiality`/`hiring_team_id` would be
// silently injected — making the route think the caller is editing locked identity
// fields and rejecting JD-only edits on non-draft jobs with a 409 (and clobbering
// `hiring_team_id` to null on draft edits). So we rebuild the shape with plain
// optionals, no defaults.
export const jobUpdateSchema = z
  .object({
    title:           z.string().trim().min(1).max(200),
    department_id:   uuidOrNull,
    description:     z.string().trim().max(20000).nullable(),
    hiring_team_id:  uuidOrNull,
    confidentiality: z.enum(['public', 'confidential']),
    custom_fields:   z.record(z.string(), z.unknown()),
    status:          z.enum(['draft', 'pending_approval', 'approved', 'open', 'paused', 'withdrawn', 'closed', 'archived']),
  })
  .partial()

export type JobCreateInput = z.infer<typeof jobCreateSchema>
export type JobUpdateInput = z.infer<typeof jobUpdateSchema>

export const linkOpeningSchema = z.object({
  opening_id: z.string().uuid(),
})
