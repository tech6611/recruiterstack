import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'
import { RESUME_BUCKET, resumeStoragePath } from '@/lib/storage/resume'

/**
 * GET /api/candidates/[id]/resume
 *
 * Streams the candidate's CV by minting a short-lived signed link to the file
 * in the private `resumes` bucket, then 302-redirecting to it. Keeps the bucket
 * private (candidate PII is never publicly reachable) while letting the in-app
 * viewer/download work: only a logged-in user of the owning org can reach here,
 * and the signed link expires quickly.
 *
 * If the stored resume_url isn't one of our storage objects (e.g. an external
 * Google Drive link from sourcing), we just redirect to it unchanged.
 */

const SIGNED_URL_TTL_SECONDS = 60 * 60 // 1 hour

export const GET = withCapability('recruiting:view', async (_req, orgId, supabase, { params }) => {
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

  const { data: signed, error: signErr } = await supabase
    .storage
    .from(RESUME_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json({ error: 'Resume file is unavailable' }, { status: 404 })
  }

  return NextResponse.redirect(signed.signedUrl)
})
