import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { parseBody } from '@/lib/api/helpers'
import { assertAdmin, getViewerScope } from '@/lib/rbac'
import { hrDocumentCreateSchema } from '@/lib/validations/hr-documents'
import { createDocument, listAllDocuments } from '@/modules/hris/domain/documents'
import type { HrDocumentCategory } from '@/lib/types/database'

const VALID_CATEGORIES: HrDocumentCategory[] = [
  'offer_letter','id_proof','contract','certification','policy','payslip','tax_form','other',
]

// GET /api/hris/documents — admin only. Filters: employee_id (or 'org' for
// org-level), category, expiring_within (number of days).
export async function GET(req: NextRequest) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  const scope = await getViewerScope(supabase, orgId, userId)
  const guard = assertAdmin(scope)
  if (guard) return guard

  const sp = req.nextUrl.searchParams
  const employeeIdParam = sp.get('employee_id')
  const categoryParam   = sp.get('category')
  const expiringParam   = sp.get('expiring_within')

  const filter = {
    employeeId: employeeIdParam === 'org' ? null
              : employeeIdParam ? employeeIdParam
              : undefined,
    category:   VALID_CATEGORIES.includes(categoryParam as HrDocumentCategory)
              ? (categoryParam as HrDocumentCategory) : undefined,
    expiringWithinDays: expiringParam ? Number(expiringParam) : undefined,
  }

  try {
    const data = await listAllDocuments(supabase, orgId, filter)
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to list documents' },
      { status: 500 },
    )
  }
}

// POST /api/hris/documents — admin only. Upload (link) any category, any
// employee or org-level.
export async function POST(req: NextRequest) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  const scope = await getViewerScope(supabase, orgId, userId)
  const guard = assertAdmin(scope)
  if (guard) return guard

  const parsed = await parseBody(req, hrDocumentCreateSchema)
  if (parsed instanceof NextResponse) return parsed

  try {
    const data = await createDocument(supabase, orgId, {
      employeeId:       parsed.employee_id ?? null,
      title:            parsed.title,
      description:      parsed.description ?? null,
      category:         parsed.category,
      url:              parsed.url,
      visibility:       parsed.visibility ?? 'employee',
      expiresAt:        parsed.expires_at ?? null,
      uploadedByUserId: userId,
      uploadedByRole:   'admin',
    })
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create document' },
      { status: 500 },
    )
  }
}
