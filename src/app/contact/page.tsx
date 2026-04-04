'use client'

import { useState } from 'react'
import { ArrowRight, Mail, MessageSquare, CheckCircle, Loader2 } from 'lucide-react'
import { MarketingNav } from '@/components/marketing/MarketingNav'
import { MarketingFooter } from '@/components/marketing/MarketingFooter'

export default function ContactPage() {
  const [form, setForm]       = useState({ name: '', email: '', message: '' })
  const [status, setStatus]   = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errMsg, setErrMsg]   = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('loading')
    setErrMsg('')
    try {
      const res = await fetch('/api/leads', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: form.email, source: 'contact-form', name: form.name, message: form.message }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setStatus('success')
      } else {
        setStatus('error')
        setErrMsg(data.error ?? 'Something went wrong. Please try again.')
      }
    } catch {
      setStatus('error')
      setErrMsg('Something went wrong. Please try again.')
    }
  }

  return (
    <div className="min-h-screen bg-[#061D46] text-white">
      <MarketingNav />

      {/* Hero */}
      <section className="border-b border-white/10 py-20">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-400 mb-3">Contact</p>
          <h1 className="text-4xl font-black text-white sm:text-5xl">Get in touch</h1>
          <p className="mt-4 text-blue-100/60 text-lg">
            Questions, demos, partnerships, or just curious — we&apos;re here.
          </p>
        </div>
      </section>

      {/* Form + sidebar */}
      <section className="py-20">
        <div className="mx-auto max-w-5xl px-6 grid gap-12 lg:grid-cols-3">

          {/* Info */}
          <div className="space-y-8">
            <div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 border border-blue-500/20 mb-3">
                <Mail className="h-5 w-5 text-blue-400" />
              </div>
              <h3 className="text-sm font-semibold text-white mb-1">Email us</h3>
              <a href="mailto:hello@recruiterstack.in" className="text-sm text-blue-400 hover:text-blue-300 transition-colors">
                hello@recruiterstack.in
              </a>
            </div>
            <div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/10 border border-blue-600/20 mb-3">
                <MessageSquare className="h-5 w-5 text-blue-400" />
              </div>
              <h3 className="text-sm font-semibold text-white mb-1">Book a demo</h3>
              <p className="text-sm text-blue-200/40">
                Want a live walkthrough? Drop your email and we&apos;ll reach out to schedule.
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs font-semibold text-blue-100/60 mb-1">Response time</p>
              <p className="text-xs text-blue-200/40">We typically respond within 24 hours on business days.</p>
            </div>
          </div>

          {/* Form */}
          <div className="lg:col-span-2">
            {status === 'success' ? (
              <div className="flex flex-col items-center justify-center h-full py-16 text-center">
                <CheckCircle className="h-12 w-12 text-emerald-500 mb-4" />
                <h2 className="text-xl font-bold text-white">Message sent!</h2>
                <p className="mt-2 text-blue-200/40">Thanks for reaching out. We&apos;ll be in touch shortly.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-blue-100/60 mb-1.5">Name</label>
                    <input
                      type="text"
                      required
                      value={form.name}
                      onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Your name"
                      className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-blue-100/60 mb-1.5">Work email</label>
                    <input
                      type="email"
                      required
                      value={form.email}
                      onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="you@company.com"
                      className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-blue-100/60 mb-1.5">Message</label>
                  <textarea
                    required
                    rows={6}
                    value={form.message}
                    onChange={e => setForm(prev => ({ ...prev, message: e.target.value }))}
                    placeholder="Tell us about your team size, current ATS, and what you're trying to improve..."
                    className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors resize-none"
                  />
                </div>

                {errMsg && (
                  <p className="text-xs text-red-400">{errMsg}</p>
                )}

                <button
                  type="submit"
                  disabled={status === 'loading'}
                  className="flex items-center gap-2 rounded-xl bg-blue-500 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-400 disabled:opacity-60 transition-colors"
                >
                  {status === 'loading'
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <ArrowRight className="h-4 w-4" />}
                  {status === 'loading' ? 'Sending…' : 'Send message'}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  )
}
