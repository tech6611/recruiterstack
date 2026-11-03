/**
 * POST /api/copilot/attachments — read a file the recruiter attached in the
 * copilot (PDF, Word .docx, text) into plain text. multipart/form-data { file }.
 * Returns { name, text, truncated }. Nothing is stored — the text travels with
 * the chat message so the AI can pull job details out of it.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireOrgAndUser } from '@/lib/auth'
import { checkAuthRateLimit } from '@/lib/api/rate-limit'
import { readFileText, SourceMaterialError, MAX_FILE_BYTES } from '@/lib/copilot/source-material'
import { logger } from '@/lib/logger'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth
  const { orgId, userId } = auth

  const limited = await checkAuthRateLimit(`${orgId}:copilot-attach`, { maxRequests: 10, window: '60 s' })
  if (limited) return limited

  let file: File | null = null
  try {
    file = (await request.formData()).get('file') as File | null
  } catch {
    return NextResponse.json({ error: 'Could not read the upload.' }, { status: 400 })
  }
  if (!file) return NextResponse.json({ error: 'No file attached.' }, { status: 400 })
  if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: 'That file is over 10 MB.' }, { status: 400 })

  try {
    const out = await readFileText(Buffer.from(await file.arrayBuffer()), file.name, file.type, { orgId, userId })
    return NextResponse.json(out)
  } catch (err) {
    if (err instanceof SourceMaterialError) return NextResponse.json({ error: err.message }, { status: 422 })
    logger.error('[copilot] attachment read failed', err)
    return NextResponse.json({ error: 'Couldn\'t read that file. Try a PDF or paste the text instead.' }, { status: 500 })
  }
}
