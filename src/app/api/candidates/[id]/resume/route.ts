import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'
import { RESUME_BUCKET, resumeStoragePath, resumeContentType, resumeExt, OFFICE_EXTENSIONS } from '@/lib/storage/resume'
import { logger } from '@/lib/logger'

// First-time conversion of a large CV can take a few seconds; allow headroom.
export const maxDuration = 60

// Converted PDFs are cached next to the source object. The source filename is
// timestamped/immutable, so the cached render never goes stale.
const RENDERED_SUFFIX = '.rendered.pdf'

/**
 * Return a faithful PDF render of an office-document CV (Word/ODF), or null if
 * conversion isn't possible. Serves a cached render when present; otherwise asks
 * the Django LibreOffice service to convert, then caches the result best-effort.
 */
async function renderedOfficePdf(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  path: string,
  file: Blob,
): Promise<ArrayBuffer | null> {
  const cacheKey = path + RENDERED_SUFFIX

  const { data: cached } = await supabase.storage.from(RESUME_BUCKET).download(cacheKey)
  if (cached) return await cached.arrayBuffer()

  const djangoUrl = process.env.DJANGO_API_URL
  const secret = process.env.INTERNAL_API_SECRET
  if (!djangoUrl || !secret) {
    logger.error('[resume] office→pdf not configured (need DJANGO_API_URL + INTERNAL_API_SECRET)')
    return null
  }

  try {
    const res = await fetch(`${djangoUrl}/api/office-to-pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Internal-Secret': secret,
        'X-File-Ext': resumeExt(path),
      },
      body: await file.arrayBuffer(),
    })
    if (!res.ok) {
      logger.error('[resume] office→pdf conversion failed', { status: res.status })
      return null
    }
    const pdf = await res.arrayBuffer()
    // Cache for next time; a storage-policy hiccup must not break serving.
    const { error: upErr } = await supabase.storage
      .from(RESUME_BUCKET)
      .upload(cacheKey, pdf, { contentType: 'application/pdf', upsert: true })
    if (upErr) logger.error('[resume] could not cache converted PDF', upErr)
    return pdf
  } catch (err) {
    logger.error('[resume] office→pdf conversion error', err)
    return null
  }
}

/**
 * GET /api/candidates/[id]/resume
 *
 * Streams the candidate's CV back through this route with an explicit inline
 * Content-Disposition so the in-app viewer renders it instead of the browser
 * force-downloading it. Previously we 302-redirected to a Supabase signed URL,
 * but those are served as attachments, so the <iframe> preview triggered a fresh
 * download on every render — leaving users with piles of duplicate files.
 *
 * Pass `?download=1` to get the file as an attachment (the explicit Download
 * button). The bucket stays private: only a logged-in user of the owning org
 * reaches here.
 *
 * If the stored resume_url isn't one of our storage objects (e.g. an external
 * Google Drive link from sourcing), we just redirect to it unchanged.
 */

export const GET = withCapability('recruiting:view', async (req, orgId, supabase, { params }) => {
  const { data, error } = await supabase
    .from('candidates')
    .select('resume_url')
    .eq('id', params.id)
    .eq('org_id', orgId)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })
  }

  const resumeUrl = (data as { resume_url: string | null }).resume_url
  if (!resumeUrl) {
    return NextResponse.json({ error: 'No resume on file' }, { status: 404 })
  }

  const path = resumeStoragePath(resumeUrl)
  if (!path) {
    // Not one of our storage objects — hand back the original link as-is.
    return NextResponse.redirect(resumeUrl)
  }

  const { data: file, error: dlErr } = await supabase.storage.from(RESUME_BUCKET).download(path)
  if (dlErr || !file) {
    return NextResponse.json({ error: 'Resume file is unavailable' }, { status: 404 })
  }

  const wantsDownload = new URL(req.url).searchParams.get('download') === '1'
  const filename = (path.split('/').pop() || 'resume').replace(/"/g, '')
  const disposition = wantsDownload ? 'attachment' : 'inline'
  const ext = resumeExt(path)

  // Word/ODF docs can't render natively in a browser <iframe>. When previewing
  // (not downloading), convert to a faithful PDF via the LibreOffice service and
  // serve that inline. If conversion is unavailable we fall through to serving
  // the raw file (which the browser will download).
  if (!wantsDownload && OFFICE_EXTENSIONS.has(ext)) {
    const pdf = await renderedOfficePdf(supabase, path, file)
    if (pdf) {
      return new NextResponse(pdf, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'inline',
          'Cache-Control': 'private, no-store',
        },
      })
    }
  }

  return new NextResponse(await file.arrayBuffer(), {
    headers: {
      'Content-Type': resumeContentType(path),
      'Content-Disposition': `${disposition}; filename="${filename}"`,
      // PII — never let a shared/proxy cache hold the file.
      'Cache-Control': 'private, no-store',
    },
  })
})
