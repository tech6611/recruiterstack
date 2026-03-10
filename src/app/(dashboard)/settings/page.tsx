'use client'

import { useState, useEffect } from 'react'
import { CheckCircle, Building2, User, Sparkles, Database, Bell } from 'lucide-react'
import { useSettings } from '@/lib/hooks/useSettings'
import type { AppSettings } from '@/lib/hooks/useSettings'

export default function SettingsPage() {
  const { settings, save, loaded } = useSettings()
  const [form, setForm] = useState<AppSettings>(settings)
  const [saved, setSaved] = useState(false)

  // Slack webhook state
  const [slackUrl, setSlackUrl] = useState('')
  const [slackStatus, setSlackStatus] = useState<'idle' | 'saving' | 'saved' | 'testing' | 'ok' | 'error'>('idle')

  // Sync form once settings load from localStorage
  useEffect(() => {
    if (loaded) setForm(settings)
  }, [loaded]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load Slack webhook from server
  useEffect(() => {
    fetch('/api/org-settings')
      .then(r => r.json())
      .then(({ data }) => { if (data?.slack_webhook_url) setSlackUrl(data.slack_webhook_url) })
      .catch(() => {})
  }, [])

  const set = (key: keyof AppSettings, value: string) =>
    setForm(f => ({ ...f, [key]: value }))

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    save(form)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const saveSlack = async () => {
    setSlackStatus('saving')
    try {
      await fetch('/api/org-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slack_webhook_url: slackUrl || null }),
      })
      setSlackStatus('saved')
      setTimeout(() => setSlackStatus('idle'), 2500)
    } catch {
      setSlackStatus('error')
      setTimeout(() => setSlackStatus('idle'), 2500)
    }
  }

  const testSlack = async () => {
    setSlackStatus('testing')
    try {
      const res = await fetch('/api/org-settings/test', { method: 'POST' })
      setSlackStatus(res.ok ? 'ok' : 'error')
      setTimeout(() => setSlackStatus('idle'), 3000)
    } catch {
      setSlackStatus('error')
      setTimeout(() => setSlackStatus('idle'), 3000)
    }
  }

  const inputCls =
    'w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition'

  return (
    <div className="p-8 max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">Personalise RecruiterStack for your team</p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">

        {/* Company */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
              <Building2 className="h-4 w-4 text-blue-600" />
            </div>
            <h2 className="text-sm font-semibold text-slate-800">Company</h2>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Company Name</label>
              <input
                value={form.company_name}
                onChange={e => set('company_name', e.target.value)}
                placeholder="Acme Corp"
                className={inputCls}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Website</label>
              <input
                value={form.company_website}
                onChange={e => set('company_website', e.target.value)}
                placeholder="https://acme.com"
                className={inputCls}
              />
            </div>
          </div>
        </div>

        {/* Recruiter Profile */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50">
              <User className="h-4 w-4 text-violet-600" />
            </div>
            <h2 className="text-sm font-semibold text-slate-800">Recruiter Profile</h2>
            <span className="text-xs text-slate-400">Used in AI-drafted outreach emails</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Your Name</label>
              <input
                value={form.recruiter_name}
                onChange={e => set('recruiter_name', e.target.value)}
                placeholder="Sarah Johnson"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Your Title</label>
              <input
                value={form.recruiter_title}
                onChange={e => set('recruiter_title', e.target.value)}
                placeholder="Senior Recruiter"
                className={inputCls}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Your Email</label>
              <input
                type="email"
                value={form.recruiter_email}
                onChange={e => set('recruiter_email', e.target.value)}
                placeholder="sarah@acme.com"
                className={inputCls}
              />
            </div>
          </div>
        </div>

        {/* Save button */}
        <button
          type="submit"
          className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors shadow-sm"
        >
          {saved ? (
            <>
              <CheckCircle className="h-4 w-4 text-white" />
              Saved!
            </>
          ) : (
            'Save Settings'
          )}
        </button>
      </form>

      {/* Slack Notifications */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-50">
            <Bell className="h-4 w-4 text-green-600" />
          </div>
          <h2 className="text-sm font-semibold text-slate-800">Slack Notifications</h2>
          <span className="text-xs text-slate-400">Get notified on new applications and stage moves</span>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5">Incoming Webhook URL</label>
          <input
            value={slackUrl}
            onChange={e => setSlackUrl(e.target.value)}
            placeholder="https://hooks.slack.com/services/..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
          />
          <p className="mt-1 text-xs text-slate-400">
            Create a webhook at <span className="font-medium text-slate-500">api.slack.com/apps</span> and paste the URL here.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={saveSlack}
            disabled={slackStatus === 'saving'}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-60"
          >
            {slackStatus === 'saving' ? 'Saving…' : slackStatus === 'saved' ? (
              <><CheckCircle className="h-4 w-4" /> Saved!</>
            ) : 'Save'}
          </button>

          {slackUrl && (
            <button
              type="button"
              onClick={testSlack}
              disabled={slackStatus === 'testing'}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-60"
            >
              {slackStatus === 'testing' ? 'Sending…'
                : slackStatus === 'ok' ? '✅ Sent!'
                : slackStatus === 'error' ? '❌ Failed'
                : 'Test'}
            </button>
          )}
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-500" />
            <p className="text-xs font-semibold text-slate-600">AI Model</p>
          </div>
          <p className="text-sm font-medium text-slate-800">Claude Sonnet 4.6</p>
          <p className="text-xs text-slate-400">Used for matching, resume parsing, and email drafts</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-2">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-emerald-500" />
            <p className="text-xs font-semibold text-slate-600">Database</p>
          </div>
          <p className="text-sm font-medium text-slate-800">Supabase · PostgreSQL</p>
          <p className="text-xs text-slate-400">Candidates, roles, matches, and resume storage</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-slate-50 px-5 py-4">
        <p className="text-xs text-slate-400">
          <span className="font-semibold text-slate-500">RecruiterStack</span> · Phase 2 · AI Matching ·{' '}
          Settings are saved locally in your browser.
        </p>
      </div>
    </div>
  )
}
