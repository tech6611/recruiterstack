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
    <div className="min-h-screen bg-transparent text-slate-900">
      <MarketingNav />

      {/* Hero */}
      <section className="bg-transparent py-20">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400 mb-3">Contact</p>
          <h1 className="text-4xl font-black text-slate-900 sm:text-5xl">Get <span className="bg-gradient-to-r from-emerald-600 via-emerald-500 to-gold-500 bg-clip-text text-transparent">in touch</span></h1>
          <p className="mt-4 text-slate-600 text-lg">
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
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 border border-emerald-200 mb-3">
                <Mail className="h-5 w-5 text-emerald-600" />
              </div>
              <h3 className="text-sm font-semibold text-slate-900 mb-1">Email us</h3>
              <a href="mailto:hello@recruiterstack.in" className="text-sm text-emerald-600 hover:text-emerald-500 transition-colors">
                hello@recruiterstack.in
              </a>
            </div>
            <div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 border border-emerald-200 mb-3">
                <MessageSquare className="h-5 w-5 text-emerald-600" />
              </div>
              <h3 className="text-sm font-semibold text-slate-900 mb-1">Book a demo</h3>
              <p className="text-sm text-slate-400">
                Want a live walkthrough? Drop your email and we&apos;ll reach out to schedule.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold text-slate-500 mb-1">Response time</p>
              <p className="text-xs text-slate-400">We typically respond within 24 hours on business days.</p>
            </div>
          </div>

          {/* Form */}
          <div className="lg:col-span-2">
            {status === 'success' ? (
              <div className="flex flex-col items-center justify-center h-full py-16 text-center">
                <CheckCircle className="h-12 w-12 text-emerald-500 mb-4" />
                <h2 className="text-xl font-bold text-slate-900">Message sent!</h2>
                <p className="mt-2 text-slate-400">Thanks for reaching out. We&apos;ll be in touch shortly.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5">Name</label>
                    <input
                      type="text"
                      required
                      value={form.name}
                      onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Your name"
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5">Work email</label>
                    <input
                      type="email"
                      required
                      value={form.email}
                      onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="you@company.com"
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Message</label>
                  <textarea
                    required
                    rows={6}
                    value={form.message}
                    onChange={e => setForm(prev => ({ ...prev, message: e.target.value }))}
                    placeholder="Tell us about your team size, current ATS, and what you're trying to improve..."
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors resize-none"
                  />
                </div>

                {errMsg && (
                  <p className="text-xs text-red-500">{errMsg}</p>
                )}

                <button
                  type="submit"
                  disabled={status === 'loading'}
                  className="flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-400 disabled:opacity-60 transition-colors"
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
