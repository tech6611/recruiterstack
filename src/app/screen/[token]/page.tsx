'use client'

import { useEffect, useState } from 'react'

interface Q { id: string; text: string }

export default function ScreenPage({ params }: { params: { token: string } }) {
  const { token } = params
  const [status, setStatus] = useState<'loading' | 'pending' | 'completed' | 'invalid' | 'submitting' | 'done'>('loading')
  const [questions, setQuestions] = useState<Q[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/screen/${token}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => {
        const s = j.data?.status
        if (s === 'pending') {
          setQuestions(j.data.questions ?? [])
          setStatus('pending')
        } else {
          setStatus('completed')
        }
      })
      .catch(() => setStatus('invalid'))
  }, [token])

  async function submit() {
    const payload = questions.map((q) => ({ question_id: q.id, answer: (answers[q.id] ?? '').trim() }))
    if (payload.every((a) => !a.answer)) {
      setError('Please answer at least one question.')
      return
    }
    setStatus('submitting')
    setError('')
    const res = await fetch(`/api/screen/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: payload }),
    })
    if (!res.ok) {
      setStatus('pending')
      setError('Something went wrong submitting your answers. Please try again.')
      return
    }
    setStatus('done')
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-600">Quick screening</div>
          <h1 className="text-xl font-bold text-slate-900">A few questions about your experience</h1>

          {status === 'loading' && <p className="mt-6 text-sm text-slate-400">Loading…</p>}

          {status === 'invalid' && (
            <p className="mt-6 text-sm text-slate-600">This screening link is invalid or has expired. Please check with your recruiter.</p>
          )}

          {status === 'completed' && (
            <p className="mt-6 text-sm text-slate-600">Thanks — this screen has already been submitted. Nothing more to do here.</p>
          )}

          {status === 'done' && (
            <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              Thank you! Your answers have been submitted. The hiring team will be in touch.
            </div>
          )}

          {(status === 'pending' || status === 'submitting') && (
            <>
              <p className="mt-2 text-sm text-slate-500">
                Answer in a few sentences each — there are no trick questions. Take your time.
              </p>
              <div className="mt-6 space-y-6">
                {questions.map((q, i) => (
                  <div key={q.id}>
                    <label className="block text-sm font-medium text-slate-800">
                      {i + 1}. {q.text}
                    </label>
                    <textarea
                      value={answers[q.id] ?? ''}
                      onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                      disabled={status === 'submitting'}
                      rows={4}
                      className="mt-2 w-full rounded-lg border border-slate-300 p-3 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      placeholder="Your answer…"
                    />
                  </div>
                ))}
              </div>
              {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
              <button
                onClick={submit}
                disabled={status === 'submitting'}
                className="mt-6 w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {status === 'submitting' ? 'Submitting…' : 'Submit answers'}
              </button>
            </>
          )}
        </div>
        <p className="mt-4 text-center text-xs text-slate-400">Powered by RecruiterStack</p>
      </div>
    </main>
  )
}
