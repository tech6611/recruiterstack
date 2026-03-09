'use client'

import { useState } from 'react'
import { ArrowRight, CheckCircle, Loader2 } from 'lucide-react'

interface EmailCaptureProps {
  placeholder?: string
  buttonLabel?: string
  source?: string
  className?: string
}

export function EmailCapture({
  placeholder = 'Enter your work email',
  buttonLabel = 'Get early access',
  source = 'homepage',
  className = '',
}: EmailCaptureProps) {
  const [email, setEmail]     = useState('')
  const [status, setStatus]   = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return

    setStatus('loading')
    setMessage('')

    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source }),
      })

      const data = await res.json()

      if (res.ok && data.success) {
        setStatus('success')
        setMessage("You're on the list. We'll be in touch soon.")
        setEmail('')
      } else {
        setStatus('error')
        setMessage(data.error ?? 'Something went wrong. Please try again.')
      }
    } catch {
      setStatus('error')
      setMessage('Something went wrong. Please try again.')
    }
  }

  if (status === 'success') {
    return (
      <div className={`flex items-center gap-2.5 text-emerald-400 ${className}`}>
        <CheckCircle className="h-5 w-5 shrink-0" />
        <span className="text-sm font-medium">{message}</span>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className={`flex flex-col sm:flex-row gap-3 ${className}`}>
      <input
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder={placeholder}
        required
        className="flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 transition-colors"
      />
      <button
        type="submit"
        disabled={status === 'loading'}
        className="flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-60 transition-colors whitespace-nowrap"
      >
        {status === 'loading' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            {buttonLabel}
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>
      {status === 'error' && (
        <p className="w-full text-xs text-red-400 sm:col-span-2">{message}</p>
      )}
    </form>
  )
}
