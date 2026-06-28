/**
 * "Substance" of a job = the content the approval was granted against: the job
 * description plus the key intake fields (what they'll do, key requirements,
 * nice-to-haves, level). Editing any of these on an already-approved job means
 * the live posting no longer matches what was signed off, so it must go back for
 * re-approval.
 *
 * The comparison is deliberately FORMATTING-BLIND: the rich-text editor stores
 * HTML, and we don't want a bold/italic/bullet tweak to count as a real change.
 * We strip tags and collapse whitespace, then compare the resulting plain words.
 * Only a genuine wording change (text added or removed) trips re-approval.
 */

export type SubstanceField =
  | 'description'
  | 'key_requirements'
  | 'nice_to_have'
  | 'team_context'
  | 'level'

export type JobSubstance = Record<SubstanceField, string>

const SUBSTANCE_LABELS: Record<SubstanceField, string> = {
  description:      'Job description',
  key_requirements: 'Key requirements',
  nice_to_have:     'Nice to have',
  team_context:     "What they'll do",
  level:            'Level',
}

/**
 * Reduce rich-text/HTML to comparable plain words: drop tags, decode the few
 * entities our editor emits, collapse all whitespace to single spaces, trim.
 * Two values that differ only in formatting normalize to the same string.
 */
export function normalizeText(value: unknown): string {
  if (value == null) return ''
  const withoutTags = String(value).replace(/<[^>]*>/g, ' ')
  const decoded = withoutTags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
  return decoded.replace(/\s+/g, ' ').trim()
}

/**
 * Pull the normalized substance fields out of a job row. Reads `description`
 * and `custom_fields.intake.{key_requirements,nice_to_have,team_context,level}`.
 */
export function extractSubstance(job: {
  description?: unknown
  custom_fields?: { intake?: Record<string, unknown> } | Record<string, unknown> | null
}): JobSubstance {
  const cf = (job?.custom_fields ?? {}) as { intake?: Record<string, unknown> }
  const intake = (cf.intake ?? {}) as Record<string, unknown>
  return {
    description:      normalizeText(job?.description),
    key_requirements: normalizeText(intake.key_requirements),
    nice_to_have:     normalizeText(intake.nice_to_have),
    team_context:     normalizeText(intake.team_context),
    level:            normalizeText(intake.level),
  }
}

/**
 * Which substance fields changed in WORDING between two snapshots. Returns an
 * empty array when nothing material changed (formatting-only or unrelated edits).
 */
export function diffSubstance(before: JobSubstance, after: JobSubstance): SubstanceField[] {
  return (Object.keys(SUBSTANCE_LABELS) as SubstanceField[]).filter(k => before[k] !== after[k])
}

/** Human-readable labels for a set of changed substance fields. */
export function substanceLabels(fields: SubstanceField[]): string[] {
  return fields.map(f => SUBSTANCE_LABELS[f])
}

export interface ApprovedSnapshot {
  substance:   JobSubstance
  captured_at: string
}

/**
 * Record the current job content as the approved baseline. Call this whenever a
 * job's approval is granted (chain completion or intake one-click approve), so a
 * later edit can be compared against what was actually signed off. Overwrites any
 * previous snapshot (a re-approval re-baselines on the new content).
 *
 * The Supabase client is loosely typed because canonical `jobs` columns
 * (custom_fields, approved_snapshot) aren't in the generated Database types yet.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function captureApprovedSubstance(supabase: any, jobId: string): Promise<void> {
  const { data: job } = await supabase
    .from('jobs')
    .select('description, custom_fields')
    .eq('id', jobId)
    .maybeSingle()
  if (!job) return
  const snapshot: ApprovedSnapshot = {
    substance:   extractSubstance(job),
    captured_at: new Date().toISOString(),
  }
  await supabase.from('jobs').update({ approved_snapshot: snapshot }).eq('id', jobId)
}
