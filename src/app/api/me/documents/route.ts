import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { parseBody } from '@/lib/api/helpers'
import { myDocumentCreateSchema } from '@/lib/validations/hr-documents'
import { getMyEmployeeProfile } from '@/modules/hris/domain/employees'
import { createDocument, listVisibleForEmployee } from '@/modules/hris/domain/documents'

// GET /api/me/documents — { mine, orgLevel }.
export async function GET() {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  try {
    const profile = await getMyEmployeeProfile(supabase, orgId, userId)
    if (!profile) {
      return NextResponse.json({ data: { mine: [], orgLevel: [] } })
    }
    const data = await listVisibleForEmployee(supabase, orgId, profile.id)
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch documents' },
      { status: 500 },
    )
  }
}

// POST /api/me/documents — employee self-upload (link). Categories restricted
// to id_proof | certification | other; visibility forced to 'employee'.
export async function POST(req: NextRequest) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const parsed = await parseBody(req, myDocumentCreateSchema)
  if (parsed instanceof NextResponse) return parsed

  const supabase = createAdminClient()
  try {
    const profile = await getMyEmployeeProfile(supabase, orgId, userId)
    if (!profile) {
      return NextResponse.json(
        { error: 'You have no employee record in this org — ask HR to add you before uploading documents.' },
        { status: 403 },
      )
    }
    const data = await createDocument(supabase, orgId, {
      employeeId:       profile.id,
      title:            parsed.title,
      description:      parsed.description ?? null,
      category:         parsed.category,
      url:              parsed.url,
      visibility:       'employee',
      expiresAt:        parsed.expires_at ?? null,
      uploadedByUserId: userId,
      uploadedByRole:   'employee',
    })
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to upload document' },
      { status: 500 },
    )
  }
}
