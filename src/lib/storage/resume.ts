/** The private Supabase Storage bucket that holds candidate CVs. */
export const RESUME_BUCKET = 'resumes'

/**
 * Extract the in-bucket object path from a Supabase storage URL, or null if the
 * URL isn't one of our storage objects (e.g. an external Google Drive link).
 * Handles the public, signed, and authenticated URL shapes.
 */
export function resumeStoragePath(url: string): string | null {
  for (const marker of [
    `/object/public/${RESUME_BUCKET}/`,
    `/object/sign/${RESUME_BUCKET}/`,
    `/object/${RESUME_BUCKET}/`,
  ]) {
    const idx = url.indexOf(marker)
    if (idx !== -1) {
      const rest = url.slice(idx + marker.length)
      // Drop any query string (e.g. an existing token) before decoding.
      return decodeURIComponent(rest.split('?')[0])
    }
  }
  return null
}
