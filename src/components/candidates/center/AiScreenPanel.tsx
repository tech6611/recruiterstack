'use client'

import { useCallback, useEffect, useState } from 'react'
import { ClipboardCheck, Copy, Send, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface Session {
  status: 'pending' | 'completed' | 'expired'
  token: string
  result: {
    score: number
    fit_bucket: 'great' | 'good' | 'okay'
    summary: string
    red_flags?: string[]
    competencies?: { name: string; rating: number; evidence: string }[]
  } | null
}

const BUCKET: Record<string, { label: string; cls: string }> = {
  great: { label: 'Great fit', cls: 'bg-emerald-100 text-emerald-700' },
  good: { label: 'Good fit', cls: 'bg-sky-100 text-sky-700' },
  okay: { label: 'Okay fit', cls: 'bg-amber-100 text-amber-700' },
  weak: { label: 'Weak fit', cls: 'bg-rose-100 text-rose-700' },
}

/** Component 07 — start an AI screen for this application and see the result. The
 *  recruiter shares the generated link with the candidate; nothing is auto-sent. */
export function AiScreenPanel({ applicationId }: { applicationId: string }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)

  const load = useCallback(() => {
    fetch(`/api/applications/${applicationId}/screen`)
      .then((r) => (r.ok ? r.json() : { data: null }))
      .then((j) => setSession(j.data ?? null))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [applicationId])
  useEffect(() => { load() }, [load])

  async function start() {
    setStarting(true)
    const res = await fetch(`/api/applications/${applicationId}/screen`, { method: 'POST' })
    setStarting(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      toast.error(j.error ?? 'Could not start the screen')
      return
    }
    load()
    toast.success('AI screen created — copy the link and share it with the candidate.')
  }

  function copyLink() {
    if (!session?.token) return
    const url = `${window.location.origin}/screen/${session.token}`
    navigator.clipboard.writeText(url).then(
      () => toast.success('Screening link copied.'),
      () => toast.error('Could not copy the link.'),
    )
  }

  if (loading) return null

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <ClipboardCheck className="h-4 w-4 text-slate-400" /> AI Screen
        </div>
        {(!session || session.status === 'expired') && (
          <button onClick={start} disabled={starting}
            className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
            {starting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Start screen
          </button>
        )}
      </div>

      <div className="px-5 py-4">
        {!session && (
          <p className="text-xs text-slate-500">
            Generate a few ICP-targeted questions and get a private link to share with the candidate. Their answers are
            scored against this role automatically.
          </p>
        )}

        {session?.status === 'pending' && (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">Screen created and awaiting the candidate’s answers. Share this link:</p>
            <button onClick={copyLink}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
              <Copy className="h-3.5 w-3.5" /> Copy screening link
            </button>
          </div>
        )}

        {session?.status === 'completed' && session.result && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${BUCKET[session.result.fit_bucket]?.cls ?? 'bg-slate-100 text-slate-600'}`}>
                {BUCKET[session.result.fit_bucket]?.label ?? 'Screened'}
              </span>
              <span className="text-sm font-bold text-slate-800">{session.result.score}/100</span>
            </div>
            {session.result.summary && <p className="text-xs text-slate-600">{session.result.summary}</p>}
            {(session.result.competencies ?? []).length > 0 && (
              <div className="space-y-1.5">
                {session.result.competencies!.map((c, i) => (
                  <div key={i} className="text-xs">
                    <span className="font-medium text-slate-700">{c.name}</span>
                    <span className="text-slate-400"> · {c.rating}/4</span>
                    {c.evidence && <span className="text-slate-500"> — {c.evidence}</span>}
                  </div>
                ))}
              </div>
            )}
            {(session.result.red_flags ?? []).length > 0 && (
              <p className="text-xs text-red-600">Watch-outs: {session.result.red_flags!.join('; ')}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
