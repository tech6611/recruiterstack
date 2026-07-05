import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { getViewerScope, assertCapability } from '@/lib/rbac'

const BUCKET = 'company-assets'
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
const ALLOWED_KINDS = ['logo', 'hero', 'story'] as const

/**
 * POST /api/org-settings/branding-upload
 * Admin-only. Accepts multipart/form-data with:
 *   - file : the image (logo or hero)
 *   - kind : "logo" | "hero"
 *
 * Uploads to the public "company-assets" bucket and returns the public URL.
 */
export async function POST(request: NextRequest) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()

  const scope = await getViewerScope(supabase, orgId, userId)
  const denied = assertCapability(scope, 'settings:edit')
  if (denied) return denied

  let fd: FormData
  try {
    fd = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = fd.get('file') as File | null
  const kind = fd.get('kind') as string | null

  if (!file || !kind) {
    return NextResponse.json({ error: 'file and kind are required' }, { status: 400 })
  }
  if (!ALLOWED_KINDS.includes(kind as (typeof ALLOWED_KINDS)[number])) {
    return NextResponse.json({ error: 'kind must be "logo", "hero", or "story".' }, { status: 400 })
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: 'Only PNG, JPG, WebP, or SVG images are accepted.' },
      { status: 415 }
    )
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Image must be under 5 MB.' }, { status: 413 })
  }

  // Path: company-assets/<orgId>/<kind>-<timestamp>.<ext>
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png'
  const filePath = `${orgId}/${kind}-${Date.now()}.${ext}`
  const buffer = await file.arrayBuffer()

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, buffer, { contentType: file.type, upsert: false })

  if (uploadErr) {
    return NextResponse.json(
      { error: uploadErr.message ?? 'Failed to upload image. Please try again.' },
      { status: 500 }
    )
  }

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(filePath)

  return NextResponse.json({ url: publicUrl })
}
