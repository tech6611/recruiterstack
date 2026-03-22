import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/api/rate-limit'

const BUCKET = 'resumes'
const MAX_BYTES = 10 * 1024 * 1024 // 10 MB
const ALLOWED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

/**
 * POST /api/apply/upload
 * Public — no auth required, but the apply token must be valid.
 * Accepts multipart/form-data with:
 *   - file  : the CV / resume file
 *   - token : the hiring-request apply_link_token
 *
 * Uploads the file to the "resumes" Supabase Storage bucket and
 * returns the public URL.
 */
export async function POST(request: NextRequest) {
  const rateLimited = await checkRateLimit(request)
  if (rateLimited) return rateLimited

  let fd: FormData
  try {
    fd = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file       = fd.get('file')  as File   | null
  const applyToken = fd.get('token') as string | null

  if (!file || !applyToken) {
    return NextResponse.json({ error: 'file and token are required' }, { status: 400 })
  }

  // Type check
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: 'Only PDF and Word documents are accepted.' },
      { status: 415 }
    )
  }

  // Size check
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File must be under 10 MB.' }, { status: 413 })
  }

  const supabase = createAdminClient()

  // Verify the apply link
  const { data: job, error: jobErr } = await supabase
    .from('hiring_requests')
    .select('id')
    .eq('apply_link_token', applyToken)
    .single()

  if (jobErr || !job) {
    return NextResponse.json({ error: 'Invalid apply token.' }, { status: 400 })
  }

  // Build a unique path: resumes/<jobId>/<timestamp>-<random>.<ext>
  const ext      = file.name.split('.').pop()?.toLowerCase() ?? 'pdf'
  const slug     = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const filePath = `${job.id}/${slug}.${ext}`
  const buffer   = await file.arrayBuffer()

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, buffer, { contentType: file.type, upsert: false })

  if (uploadErr) {
    // Surface a clear error if the bucket doesn't exist yet
    return NextResponse.json(
      { error: uploadErr.message ?? 'Failed to upload file. Please try again.' },
      { status: 500 }
    )
  }

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(filePath)

  return NextResponse.json({ url: publicUrl, filename: file.name })
}
