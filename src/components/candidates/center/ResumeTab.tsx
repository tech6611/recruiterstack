'use client'
import { useEffect, useRef, useState } from 'react'
import { Download, FileText, Loader2, RefreshCw } from 'lucide-react'
import type { Candidate } from '@/lib/types/database'
import { useCandidateProfile } from '../CandidateProfileContext'
import { resumeStoragePath, resumeExt, OFFICE_EXTENSIONS } from '@/lib/storage/resume'

// PDFs and plain text render natively in a browser <iframe>. Word/ODF docs can't,
// but the resume API converts those to a faithful PDF (LibreOffice) before serving,
// so they preview too. Anything else falls back to the Download card.
function resumeIsPreviewable(resumeUrl: string | null | undefined): boolean {
  if (!resumeUrl) return false
  const path = resumeStoragePath(resumeUrl)
  if (!path) return true // external link (e.g. Google Drive) — let it try to embed
  const ext = resumeExt(path)
  return ext === 'pdf' || ext === 'txt' || OFFICE_EXTENSIONS.has(ext)
}

/**
 * The CV, as its own tab beside Summary and Activities.
 *
 * It used to be the last panel of Summary, in a 500px box below the AI assessment —
 * the document a recruiter reads most was the one they had to scroll furthest for, and
 * then read through a letterbox. As a tab it gets the whole height of the centre column.
 */
export default function ResumeTab({ candidate }: { candidate: Candidate }) {
  const { reload } = useCandidateProfile()
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // Re-run CV extraction on demand (fills blank profile fields from the resume).
  const [reparsing, setReparsing] = useState(false)
  const reparse = async () => {
    setReparsing(true)
    try {
      const res = await fetch(`/api/candidates/${candidate.id}/parse-cv`, { method: 'POST' })
      const json = await res.json().catch(() => null)
      if (res.ok && json?.data?.updated) await reload()
    } catch {
      // Non-critical — leave the profile as-is on failure.
    } finally {
      if (mountedRef.current) setReparsing(false)
    }
  }

  const downloadHref = `/api/candidates/${candidate.id}/resume?download=1`

  if (!candidate.resume_url) {
    return (
      <div className="flex flex-col items-center py-24 text-center">
        <FileText className="mb-2 h-8 w-8 text-slate-200" />
        <p className="text-sm text-slate-400">No resume uploaded</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col p-4">
      <div className="mb-3 flex items-center justify-end gap-4">
        <button
          onClick={reparse}
          disabled={reparsing}
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 disabled:opacity-60"
          title="Re-read this CV and fill in any blank profile fields (skills, title, etc.)"
        >
          {reparsing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          {reparsing ? 'Reading…' : 'Re-parse CV'}
        </button>
        <a href={downloadHref} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-800">
          <Download className="h-3 w-3" /> Download
        </a>
      </div>

      {resumeIsPreviewable(candidate.resume_url) ? (
        <iframe
          src={`/api/candidates/${candidate.id}/resume`}
          className="min-h-[600px] w-full flex-1 rounded-xl border border-slate-200 bg-white"
          title="Resume"
        />
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white py-16 text-center">
          <FileText className="h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-500">This CV can&apos;t be previewed in the browser.</p>
          <a
            href={downloadHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
          >
            <Download className="h-3.5 w-3.5" /> Download CV
          </a>
        </div>
      )}
    </div>
  )
}
