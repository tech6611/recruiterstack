'use client'

import { useState } from 'react'
import { Phone, Loader2, X, PhoneCall, CheckCircle, AlertCircle } from 'lucide-react'

interface VoiceCallModalProps {
  candidateId: string
  candidateName: string
  candidatePhone: string | null
  applicationId: string
  hiringRequestId: string
  positionTitle: string
  onClose: () => void
  onCallInitiated: () => void
}

export default function VoiceCallModal({
  candidateId,
  candidateName,
  candidatePhone,
  applicationId,
  hiringRequestId,
  positionTitle,
  onClose,
  onCallInitiated,
}: VoiceCallModalProps) {
  const [phone, setPhone] = useState(candidatePhone ?? '')
  const [calling, setCalling] = useState(false)
  const [result, setResult] = useState<'success' | 'error' | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  const handleCall = async () => {
    if (!phone.trim()) return

    setCalling(true)
    setResult(null)
    setErrorMsg('')

    try {
      const res = await fetch('/api/voice/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidate_id: candidateId,
          hiring_request_id: hiringRequestId,
          application_id: applicationId,
          phone_number: phone.trim(),
          agent_type: 'phone_screen',
        }),
      })

      const json = await res.json()

      if (!res.ok) {
        setResult('error')
        setErrorMsg(json.error || 'Failed to initiate call')
        return
      }

      setResult('success')
      onCallInitiated()
    } catch {
      setResult('error')
      setErrorMsg('Network error — please try again')
    } finally {
      setCalling(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-blue-50 flex items-center justify-center">
              <PhoneCall className="h-4.5 w-4.5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">AI Phone Screen</h3>
              <p className="text-xs text-slate-400 mt-0.5">{positionTitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {result === 'success' ? (
            <div className="flex flex-col items-center py-6 gap-3">
              <CheckCircle className="h-12 w-12 text-emerald-500" />
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-900">Call initiated!</p>
                <p className="text-xs text-slate-500 mt-1">
                  The AI recruiter is calling {candidateName}. You&apos;ll see the transcript
                  and score in the activity feed once the call completes.
                </p>
              </div>
              <button
                onClick={onClose}
                className="mt-2 rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 transition-colors"
              >
                Close
              </button>
            </div>
          ) : (
            <>
              <div>
                <p className="text-sm text-slate-700">
                  An AI recruiter will call <strong>{candidateName}</strong> to conduct
                  a phone screen for the <strong>{positionTitle}</strong> role.
                </p>
                <p className="text-xs text-slate-400 mt-2">
                  The call typically lasts 10-15 minutes. You&apos;ll receive a transcript,
                  summary, and AI score when it&apos;s done.
                </p>
              </div>

              {/* Phone number input */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
                />
              </div>

              {/* Error */}
              {result === 'error' && (
                <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-100 px-3.5 py-2.5">
                  <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700">{errorMsg}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  onClick={onClose}
                  className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCall}
                  disabled={!phone.trim() || calling}
                  className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {calling ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Phone className="h-4 w-4" />
                  )}
                  {calling ? 'Calling...' : 'Start Phone Screen'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
