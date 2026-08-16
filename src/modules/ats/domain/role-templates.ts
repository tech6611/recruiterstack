import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import type { Icp, IcpDraftInput, RoleTemplate } from '@/lib/types/icp'

type Supabase = SupabaseClient<Database>

// The `role_templates` table (migration 111) isn't in the generated Supabase types
// yet — same loose-handle approach as icps / candidate_ai_summaries.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSb = any

/**
 * Recruiting Knowledge (Component 02) — the reusable role-calibration library. A
 * template is an ICP snapshot (gates + competencies) you can start a new job's ICP
 * from. Pure copy semantics: saving a template freezes the current gates/competencies;
 * applying one seeds a fresh draft ICP that the recruiter then reviews and approves.
 */

/** Turn a saved template into the payload that creates a draft ICP. PURE + tested. */
export function templateToDraftInput(template: Pick<RoleTemplate, 'must_haves' | 'competencies'>): IcpDraftInput {
  return {
    must_haves: template.must_haves ?? [],
    competencies: template.competencies ?? [],
    source: 'template',
  }
}

export async function listRoleTemplates(supabase: Supabase, orgId: string): Promise<RoleTemplate[]> {
  const { data, error } = await (supabase as unknown as LooseSb)
    .from('role_templates')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as RoleTemplate[]
}

export async function getRoleTemplate(
  supabase: Supabase,
  orgId: string,
  id: string,
): Promise<RoleTemplate | null> {
  const { data, error } = await (supabase as unknown as LooseSb)
    .from('role_templates')
    .select('*')
    .eq('org_id', orgId)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data ?? null) as RoleTemplate | null
}

/** Save an ICP (any version) as a reusable role template. */
export async function createRoleTemplateFromIcp(
  supabase: Supabase,
  orgId: string,
  params: { name: string; description?: string | null; icp: Pick<Icp, 'must_haves' | 'competencies' | 'job_id'>; createdBy?: string | null },
): Promise<RoleTemplate> {
  const { name, description = null, icp, createdBy = null } = params
  const { data, error } = await (supabase as unknown as LooseSb)
    .from('role_templates')
    .insert({
      org_id: orgId,
      name,
      description,
      must_haves: icp.must_haves ?? [],
      competencies: icp.competencies ?? [],
      source_job_id: icp.job_id ?? null,
      created_by: createdBy,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as RoleTemplate
}

export async function deleteRoleTemplate(supabase: Supabase, orgId: string, id: string): Promise<void> {
  const { error } = await (supabase as unknown as LooseSb)
    .from('role_templates')
    .delete()
    .eq('org_id', orgId)
    .eq('id', id)
  if (error) throw error
}
