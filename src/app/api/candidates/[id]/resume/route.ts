import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'
import { RESUME_BUCKET, resumeStoragePath, resumeContentType } from '@/lib/storage/resume'

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

  return new NextResponse(await file.arrayBuffer(), {
    headers: {
      'Content-Type': resumeContentType(path),
      'Content-Disposition': `${disposition}; filename="${filename}"`,
      // PII — never let a shared/proxy cache hold the file.
      'Cache-Control': 'private, no-store',
    },
  })
})
