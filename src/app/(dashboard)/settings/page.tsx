'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { CheckCircle, Building2, User, Sparkles, Database, Bell, Plug } from 'lucide-react'
import { useSettings } from '@/lib/hooks/useSettings'
import type { AppSettings } from '@/lib/hooks/useSettings'

export default function SettingsPage() {
  const { settings, save, loaded } = useSettings()
  const [form, setForm] = useState<AppSettings>(settings)
  const [saved, setSaved] = useState(false)
  const searchParams = useSearchParams()

  // Slack webhook state
  const [slackUrl, setSlackUrl] = useState('')
  const [slackStatus, setSlackStatus] = useState<'idle' | 'saving' | 'saved' | 'testing' | 'ok' | 'error'>('idle')

  // Slack OAuth state
  const [slackConnected, setSlackConnected] = useState(false)
  const [slackTeamName, setSlackTeamName] = useState<string | null>(null)
  const [oauthToast, setOauthToast] = useState<'connected' | 'error' | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)

  // Sync form once settings load from localStorage
  useEffect(() => {
    if (loaded) setForm(settings)
  }, [loaded]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load Slack settings from server
  useEffect(() => {
    fetch('/api/org-settings')
      .then(r => r.json())
      .then(({ data }) => {
        if (data?.slack_webhook_url) setSlackUrl(data.slack_webhook_url)
        setSlackConnected(!!data?.slack_connected)
        setSlackTeamName(data?.slack_team_name ?? null)
      })
      .catch(() => {})
  }, [])

  // Show toast if redirected back from Slack OAuth
  useEffect(() => {
    const result = searchParams.get('slack')
    if (result === 'connected') {
      setOauthToast('connected')
      setSlackConnected(true)
      setTimeout(() => setOauthToast(null), 4000)
      // Reload to get the team name
      fetch('/api/org-settings')
        .then(r => r.json())
        .then(({ data }) => setSlackTeamName(data?.slack_team_name ?? null))
        .catch(() => {})
    } else if (result === 'error') {
      setOauthToast('error')
      setTimeout(() => setOauthToast(null), 4000)
    }
  }, [searchParams])

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

  const disconnectSlack = async () => {
    setDisconnecting(true)
    try {
      await fetch('/api/slack/disconnect', { method: 'POST' })
      setSlackConnected(false)
      setSlackTeamName(null)
    } catch {
      // ignore
    } finally {
      setDisconnecting(false)
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

      {/* OAuth toast */}
      {oauthToast && (
        <div className={`rounded-xl px-4 py-3 text-sm font-medium ${
          oauthToast === 'connected'
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {oauthToast === 'connected'
            ? '✅ Slack connected! Hiring managers will now receive DMs on candidate updates.'
            : '❌ Slack connection failed. Please try again.'}
        </div>
      )}

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

      {/* Slack Notifications — channel webhook */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-50">
            <Bell className="h-4 w-4 text-green-600" />
          </div>
          <h2 className="text-sm font-semibold text-slate-800">Slack Channel Alerts</h2>
          <span className="text-xs text-slate-400">Post to a #channel on key events</span>
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

      {/* Slack App — OAuth DMs */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50">
            <Plug className="h-4 w-4 text-purple-600" />
          </div>
          <h2 className="text-sm font-semibold text-slate-800">Slack App</h2>
          <span className="text-xs text-slate-400">DM hiring managers directly on stage moves</span>
        </div>

        {slackConnected ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-2 w-2 rounded-full bg-green-500" />
              <p className="text-sm text-slate-700">
                Connected to <span className="font-semibold">{slackTeamName ?? 'your workspace'}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={disconnectSlack}
              disabled={disconnecting}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-60"
            >
              {disconnecting ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              Connect your Slack workspace so RecruiterStack can DM hiring managers when candidates move through their pipeline.
            </p>
            <a
              href="/api/slack/install"
              className="inline-flex items-center gap-2 rounded-xl bg-[#4A154B] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
            >
              {/* Slack bolt icon */}
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-white" xmlns="http://www.w3.org/2000/svg">
                <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
              </svg>
              Add to Slack
            </a>
          </div>
        )}
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
