'use client'
import { useState } from 'react'
import { Wand2, Loader2, RefreshCw, FileText, ExternalLink } from 'lucide-react'
import type { Candidate } from '@/lib/types/database'

interface SummaryTabProps {
  candidate: Candidate
}

export default function SummaryTab({ candidate }: SummaryTabProps) {
  const [summary, setSummary] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState('')

  const generate = async () => {
    setGenerating(true); setGenError('')
    const res = await fetch(`/api/candidates/${candidate.id}/ai-summary`, { method: 'POST' })
    const json = await res.json()
    if (!res.ok) { setGenError(json.error ?? 'Generation failed'); setGenerating(false); return }
    setSummary(json.data.summary)
    setGenerating(false)
  }

  return (
    <div className="p-5 space-y-5">
      {/* AI Summary */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-violet-500" />
            <h3 className="text-sm font-semibold text-slate-800">AI Summary</h3>
          </div>
          <button
            onClick={generate}
            disabled={generating}
            className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-60 transition-colors"
          >
            {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : summary ? <RefreshCw className="h-3 w-3" /> : <Wand2 className="h-3 w-3" />}
            {generating ? 'Generating…' : summary ? 'Regenerate' : 'Generate Summary'}
          </button>
        </div>
        <div className="px-4 py-4">
          {genError && <p className="text-sm text-red-600">{genError}</p>}
          {summary ? (
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{summary}</p>
          ) : !generating && (
            <p className="text-sm text-slate-400 italic">Click &quot;Generate Summary&quot; to get an AI overview of this candidate.</p>
          )}
        </div>
      </div>

      {/* Resume */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-800">Resume / CV</h3>
          </div>
          {candidate.resume_url && (
            <a href={candidate.resume_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800">
              <ExternalLink className="h-3 w-3" /> Download
            </a>
          )}
        </div>
        <div className="p-2">
          {candidate.resume_url ? (
            <iframe
              src={candidate.resume_url}
              className="w-full h-[500px] rounded-xl border border-slate-100"
              title="Resume"
            />
          ) : (
            <div className="flex flex-col items-center py-10 text-center">
              <FileText className="h-8 w-8 text-slate-200 mb-2" />
              <p className="text-sm text-slate-400">No resume uploaded</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
