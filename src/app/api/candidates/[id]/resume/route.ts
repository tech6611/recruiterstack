import { NextResponse } from 'next/server'
import mammoth from 'mammoth'
import { withCapability } from '@/lib/api/helpers'
import { RESUME_BUCKET, resumeStoragePath, resumeContentType } from '@/lib/storage/resume'
import { logger } from '@/lib/logger'

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
  const ext = path.split('.').pop()?.toLowerCase() ?? ''

  // Word docs can't render natively in a browser <iframe>. When previewing (not
  // downloading) a .docx, convert it to HTML with mammoth so the viewer shows the
  // CV inline instead of the "can't preview" fallback. If conversion fails we fall
  // through to serving the raw file. Legacy .doc isn't supported by mammoth.
  if (!wantsDownload && ext === 'docx') {
    try {
      const buffer = Buffer.from(await file.arrayBuffer())
      const { value: body } = await mammoth.convertToHtml({ buffer })
      const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>
        body { margin: 0; padding: 24px 28px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.6; font-size: 14px; }
        h1, h2, h3 { color: #0f172a; line-height: 1.3; margin: 1.2em 0 0.4em; }
        p { margin: 0 0 0.7em; }
        ul, ol { margin: 0 0 0.7em; padding-left: 1.4em; }
        table { border-collapse: collapse; width: 100%; }
        td, th { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; }
        a { color: #059669; }
        img { max-width: 100%; height: auto; }
      </style></head><body>${body}</body></html>`
      return new NextResponse(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': 'inline',
          'Cache-Control': 'private, no-store',
        },
      })
    } catch (err) {
      logger.error('[resume] docx→html conversion failed, serving raw file', err)
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
