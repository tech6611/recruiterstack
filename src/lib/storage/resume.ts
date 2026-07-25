/** The private Supabase Storage bucket that holds candidate CVs. */
export const RESUME_BUCKET = 'resumes'

/**
 * Office/ODF document extensions a browser can't render natively. The resume
 * route converts these to PDF (via the LibreOffice service) before serving, so
 * the viewer shows the real document instead of force-downloading it.
 */
export const OFFICE_EXTENSIONS = new Set(['doc', 'docx', 'rtf', 'odt', 'dot', 'dotx', 'wps'])

/** Lowercased file extension for a storage path (no leading dot), or ''. */
export function resumeExt(path: string): string {
  return path.split('.').pop()?.toLowerCase() ?? ''
}

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

/**
 * Best-effort MIME type from a stored file path. Serving the correct type lets
 * the browser render the CV inline in the viewer instead of force-downloading
 * it (which happens when the type is unknown/octet-stream).
 */
export function resumeContentType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  switch (ext) {
    case 'pdf':
      return 'application/pdf'
    case 'doc':
      return 'application/msword'
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    case 'txt':
      return 'text/plain; charset=utf-8'
    case 'rtf':
      return 'application/rtf'
    default:
      return 'application/octet-stream'
  }
}
