import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Database,
  HrDocument,
  HrDocumentCategory,
  HrDocumentInsert,
  HrDocumentUpdate,
  HrDocumentVisibility,
} from '@/lib/types/database'
import { createNotification } from '@/lib/api/notify'

type Supabase = SupabaseClient<Database>

// Employees may self-upload only these categories (the "personal docs" set).
// Offer letters, contracts, payslips, etc. are HR-only uploads.
export const EMPLOYEE_UPLOAD_CATEGORIES: ReadonlySet<HrDocumentCategory> = new Set<HrDocumentCategory>([
  'id_proof', 'certification', 'other',
])

// ── Reads ────────────────────────────────────────────────────────────────────

export interface ListDocumentsFilter {
  employeeId?: string | null    // explicit null = org-level only
  category?:   HrDocumentCategory
  expiringWithinDays?: number   // for the admin "expiring soon" view
}

export async function listAllDocuments(
  supabase: Supabase,
  orgId: string,
  filter: ListDocumentsFilter = {},
): Promise<HrDocument[]> {
  let q = supabase.from('hr_documents').select('*').eq('org_id', orgId)

  if (filter.employeeId === null) q = q.is('employee_id', null)
  else if (filter.employeeId)     q = q.eq('employee_id', filter.employeeId)

  if (filter.category) q = q.eq('category', filter.category)

  if (filter.expiringWithinDays !== undefined) {
    const cutoff = new Date(Date.now() + filter.expiringWithinDays * 86_400_000)
      .toISOString().slice(0, 10)
    q = q.not('expires_at', 'is', null).lte('expires_at', cutoff)
  }

  const { data, error } = await q.order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as HrDocument[]
}

// What the calling employee can see: their own employee-visible docs +
// every org-level document (org-level docs are always employee-visible).
export async function listVisibleForEmployee(
  supabase: Supabase,
  orgId: string,
  employeeId: string,
): Promise<{ mine: HrDocument[]; orgLevel: HrDocument[] }> {
  const [mineRes, orgRes] = await Promise.all([
    supabase
      .from('hr_documents')
      .select('*')
      .eq('org_id', orgId)
      .eq('employee_id', employeeId)
      .eq('visibility', 'employee')
      .order('created_at', { ascending: false }),
    supabase
      .from('hr_documents')
      .select('*')
      .eq('org_id', orgId)
      .is('employee_id', null)
      .order('created_at', { ascending: false }),
  ])
  if (mineRes.error) throw mineRes.error
  if (orgRes.error)  throw orgRes.error
  return {
    mine:     (mineRes.data ?? []) as HrDocument[],
    orgLevel: (orgRes.data ?? [])  as HrDocument[],
  }
}

export async function getDocument(
  supabase: Supabase,
  orgId: string,
  documentId: string,
): Promise<HrDocument | null> {
  const { data, error } = await supabase
    .from('hr_documents')
    .select('*')
    .eq('id', documentId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (error) throw error
  return (data as HrDocument) ?? null
}

export async function listExpiringSoon(
  supabase: Supabase,
  orgId: string,
  days = 30,
): Promise<HrDocument[]> {
  return listAllDocuments(supabase, orgId, { expiringWithinDays: days })
}

// ── Writes ───────────────────────────────────────────────────────────────────

export interface CreateDocumentInput {
  employeeId?:        string | null     // null for org-level
  title:              string
  description?:       string | null
  category:           HrDocumentCategory
  url:                string
  visibility?:        HrDocumentVisibility
  expiresAt?:         string | null
  uploadedByUserId:   string
  uploadedByRole:     'admin' | 'employee'
}

export async function createDocument(
  supabase: Supabase,
  orgId: string,
  input: CreateDocumentInput,
): Promise<HrDocument> {
  if (input.uploadedByRole === 'employee') {
    if (!EMPLOYEE_UPLOAD_CATEGORIES.has(input.category)) {
      throw new Error('Employees can only upload personal documents (ID, certifications, other).')
    }
    if (!input.employeeId) {
      throw new Error('Employee self-upload requires an employee_id.')
    }
  }

  const row: HrDocumentInsert = {
    org_id:              orgId,
    employee_id:         input.employeeId ?? null,
    title:               input.title.trim(),
    description:         input.description ?? null,
    category:            input.category,
    url:                 input.url.trim(),
    visibility:          input.visibility ?? 'employee',
    uploaded_by_user_id: input.uploadedByUserId,
    uploaded_by_role:    input.uploadedByRole,
    expires_at:          input.expiresAt ?? null,
  }
  const { data, error } = await supabase
    .from('hr_documents').insert(row as never).select('*').single()
  if (error) throw error
  const created = data as HrDocument

  // Notify the employee when HR uploads a doc visible to them.
  if (created.employee_id && created.visibility === 'employee' && input.uploadedByRole === 'admin') {
    const { data: emp } = await supabase
      .from('employee_profiles').select('user_id').eq('id', created.employee_id).maybeSingle()
    const empUserId = (emp as { user_id: string | null } | null)?.user_id ?? null
    if (empUserId) {
      void createNotification({
        orgId,
        userId:       empUserId,
        type:         'system',
        title:        `New document on file: ${created.title}`,
        body:         `Category: ${created.category}. Open it from /me/documents.`,
        resourceType: 'hr_document',
        resourceId:   created.id,
      })
    }
  }

  return created
}

export async function updateDocument(
  supabase: Supabase,
  orgId: string,
  documentId: string,
  patch: HrDocumentUpdate,
): Promise<HrDocument> {
  const { data, error } = await supabase
    .from('hr_documents')
    .update(patch as never)
    .eq('id', documentId).eq('org_id', orgId)
    .select('*').single()
  if (error) throw error
  return data as HrDocument
}

export async function deleteDocument(
  supabase: Supabase,
  orgId: string,
  documentId: string,
): Promise<void> {
  const { error } = await supabase
    .from('hr_documents')
    .delete()
    .eq('id', documentId).eq('org_id', orgId)
  if (error) throw error
}
