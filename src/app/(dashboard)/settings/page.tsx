'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { CheckCircle, Check, Building2, User, Sparkles, Database, Bell, Plug, LayoutList, Calendar, Video, Monitor } from 'lucide-react'
import { useSettings, KANBAN_CARD_FIELD_OPTIONS } from '@/lib/hooks/useSettings'
import { inputCls } from '@/lib/ui/styles'
import type { AppSettings } from '@/lib/hooks/useSettings'
import { CompanyInfoCard } from '@/components/settings/CompanyInfoCard'
import { AgentsCard } from '@/components/settings/AgentsCard'
import { TeamCard } from '@/components/settings/TeamCard'
import { DepartmentsCard } from '@/components/settings/DepartmentsCard'
import { LocationsCard } from '@/components/settings/LocationsCard'
import { CompBandsCard } from '@/components/settings/CompBandsCard'

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
  const [oauthErrorReason, setOauthErrorReason] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)

  // Google Calendar OAuth state
  const [googleConnected, setGoogleConnected] = useState(false)
  const [googleEmail, setGoogleEmail] = useState<string | null>(null)
  const [googleToast, setGoogleToast] = useState<'connected' | 'error' | null>(null)
  const [googleErrorReason, setGoogleErrorReason] = useState<string | null>(null)
  const [googleDisconnecting, setGoogleDisconnecting] = useState(false)

  // Zoom OAuth state
  const [zoomConnected, setZoomConnected] = useState(false)
  const [zoomEmail, setZoomEmail] = useState<string | null>(null)
  const [zoomToast, setZoomToast] = useState<'connected' | 'error' | null>(null)
  const [zoomErrorReason, setZoomErrorReason] = useState<string | null>(null)
  const [zoomDisconnecting, setZoomDisconnecting] = useState(false)

  // Microsoft OAuth state
  const [msConnected, setMsConnected] = useState(false)
  const [msEmail, setMsEmail] = useState<string | null>(null)
  const [msToast, setMsToast] = useState<'connected' | 'error' | null>(null)
  const [msErrorReason, setMsErrorReason] = useState<string | null>(null)
  const [msDisconnecting, setMsDisconnecting] = useState(false)

  // Current user's role — gates admin-only sections (Slack, company info, team, agents)
  const [isAdmin, setIsAdmin] = useState(false)

  // Sync form once settings load from localStorage
  useEffect(() => {
    if (loaded) setForm(settings)
  }, [loaded]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetch('/api/me')
      .then(r => r.json())
      .then(({ data }) => setIsAdmin(!!data?.is_admin))
      .catch(() => {})
  }, [])

  // Load Slack + Google settings from server
  // Capture URL params at mount time so the closure doesn't go stale
  useEffect(() => {
    const freshGoogleOAuth = searchParams.get('google')    === 'connected'
    const freshSlackOAuth  = searchParams.get('slack')     === 'connected'
    const freshZoomOAuth   = searchParams.get('zoom')      === 'connected'
    const freshMsOAuth     = searchParams.get('microsoft') === 'connected'
    fetch('/api/org-settings')
      .then(r => r.json())
      .then(({ data }) => {
        if (data?.slack_webhook_url) setSlackUrl(data.slack_webhook_url)
        setSlackTeamName(data?.slack_team_name ?? null)
        // Don't override optimistic `true` set by the URL-param effects — those
        // effects run synchronously before this async fetch resolves, so if we
        // just came back from an OAuth redirect we keep the optimistic state
        // and let the server value win only when we're on a plain page load.
        if (!freshSlackOAuth)  setSlackConnected(!!data?.slack_connected)
        if (!freshGoogleOAuth) setGoogleConnected(!!data?.google_connected)
        if (!freshGoogleOAuth) setGoogleEmail(data?.google_connected_email ?? null)
        if (!freshZoomOAuth)   setZoomConnected(!!data?.zoom_connected)
        if (!freshZoomOAuth)   setZoomEmail(data?.zoom_connected_email ?? null)
        if (!freshMsOAuth)     setMsConnected(!!data?.ms_connected)
        if (!freshMsOAuth)     setMsEmail(data?.ms_connected_email ?? null)
      })
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Show toast if redirected back from Slack OAuth
  useEffect(() => {
    const result = searchParams.get('slack')
    if (result === 'connected') {
      setOauthToast('connected')
      setSlackConnected(true)
      setTimeout(() => setOauthToast(null), 4000)
      fetch('/api/org-settings')
        .then(r => r.json())
        .then(({ data }) => setSlackTeamName(data?.slack_team_name ?? null))
        .catch(() => {})
    } else if (result === 'error') {
      const reason = searchParams.get('reason')
      setOauthErrorReason(reason)
      setOauthToast('error')
      setTimeout(() => setOauthToast(null), 8000)
    }
  }, [searchParams])

  // Show toast if redirected back from Google OAuth
  useEffect(() => {
    const result = searchParams.get('google')
    if (result === 'connected') {
      setGoogleToast('connected')
      setGoogleConnected(true)
      setTimeout(() => setGoogleToast(null), 4000)
      fetch('/api/org-settings')
        .then(r => r.json())
        .then(({ data }) => setGoogleEmail(data?.google_connected_email ?? null))
        .catch(() => {})
    } else if (result === 'error') {
      const reason = searchParams.get('reason')
      setGoogleErrorReason(reason)
      setGoogleToast('error')
      setTimeout(() => setGoogleToast(null), 8000)
    }
  }, [searchParams])

  // Show toast if redirected back from Zoom OAuth
  useEffect(() => {
    const result = searchParams.get('zoom')
    if (result === 'connected') {
      setZoomToast('connected')
      setZoomConnected(true)
      setTimeout(() => setZoomToast(null), 4000)
      fetch('/api/org-settings')
        .then(r => r.json())
        .then(({ data }) => setZoomEmail(data?.zoom_connected_email ?? null))
        .catch(() => {})
    } else if (result === 'error') {
      const reason = searchParams.get('reason')
      setZoomErrorReason(reason)
      setZoomToast('error')
      setTimeout(() => setZoomToast(null), 8000)
    }
  }, [searchParams])

  // Show toast if redirected back from Microsoft OAuth
  useEffect(() => {
    const result = searchParams.get('microsoft')
    if (result === 'connected') {
      setMsToast('connected')
      setMsConnected(true)
      setTimeout(() => setMsToast(null), 4000)
      fetch('/api/org-settings')
        .then(r => r.json())
        .then(({ data }) => setMsEmail(data?.ms_connected_email ?? null))
        .catch(() => {})
    } else if (result === 'error') {
      const reason = searchParams.get('reason')
      setMsErrorReason(reason)
      setMsToast('error')
      setTimeout(() => setMsToast(null), 8000)
    }
  }, [searchParams])

  const set = (key: keyof AppSettings, value: string) =>
    setForm(f => ({ ...f, [key]: value }))

  const toggleCardField = (fieldId: string) => {
    const curr = form.kanban_card_fields ?? ['company']
    const next = curr.includes(fieldId)
      ? curr.filter(f => f !== fieldId)
      : [...curr, fieldId]
    setForm(f => ({ ...f, kanban_card_fields: next }))
  }

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

  const disconnectGoogle = async () => {
    setGoogleDisconnecting(true)
    try {
      await fetch('/api/google/disconnect', { method: 'POST' })
      setGoogleConnected(false)
      setGoogleEmail(null)
    } catch {
      // ignore
    } finally {
      setGoogleDisconnecting(false)
    }
  }

  const disconnectZoom = async () => {
    setZoomDisconnecting(true)
    try {
      await fetch('/api/zoom/disconnect', { method: 'POST' })
      setZoomConnected(false)
      setZoomEmail(null)
    } catch {
      // ignore
    } finally {
      setZoomDisconnecting(false)
    }
  }

  const disconnectMicrosoft = async () => {
    setMsDisconnecting(true)
    try {
      await fetch('/api/microsoft/disconnect', { method: 'POST' })
      setMsConnected(false)
      setMsEmail(null)
    } catch {
      // ignore
    } finally {
      setMsDisconnecting(false)
    }
  }

  return (
    <div className="p-8 max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">Personalise RecruiterStack for your team</p>
      </div>

      {/* Slack OAuth toast */}
      {oauthToast && (
        <div className={`rounded-xl px-4 py-3 text-sm font-medium ${
          oauthToast === 'connected'
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {oauthToast === 'connected'
            ? '✅ Slack connected! Hiring managers will now receive DMs on candidate updates.'
            : `❌ Slack connection failed${oauthErrorReason ? ` · reason: ${oauthErrorReason}` : ''}. Please try again.`}
        </div>
      )}

      {/* Google OAuth toast */}
      {googleToast && (
        <div className={`rounded-xl px-4 py-3 text-sm font-medium ${
          googleToast === 'connected'
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {googleToast === 'connected'
            ? '✅ Google Calendar connected! Interviews will now auto-create Google Meet links.'
            : `❌ Google connection failed${googleErrorReason ? ` · reason: ${googleErrorReason}` : ''}. Please try again.`}
        </div>
      )}

      {/* Zoom OAuth toast */}
      {zoomToast && (
        <div className={`rounded-xl px-4 py-3 text-sm font-medium ${
          zoomToast === 'connected'
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {zoomToast === 'connected'
            ? '✅ Zoom connected! Interviews will now auto-create Zoom meeting links.'
            : `❌ Zoom connection failed${zoomErrorReason ? ` · reason: ${zoomErrorReason}` : ''}. Please try again.`}
        </div>
      )}

      {/* Microsoft OAuth toast */}
      {msToast && (
        <div className={`rounded-xl px-4 py-3 text-sm font-medium ${
          msToast === 'connected'
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {msToast === 'connected'
            ? '✅ Microsoft Teams connected! Interviews will now auto-create Teams meeting links.'
            : `❌ Microsoft connection failed${msErrorReason ? ` · reason: ${msErrorReason}` : ''}. Please try again.`}
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

        {/* Kanban Card Fields */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50">
              <LayoutList className="h-4 w-4 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-800">Kanban Card Fields</h2>
              <p className="text-xs text-slate-400">Choose what appears on each candidate card in the pipeline view</p>
            </div>
          </div>

          <div className="space-y-1.5">
            {/* Name — always required, not toggleable */}
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <div className="h-4 w-4 rounded bg-slate-300 flex items-center justify-center shrink-0">
                <Check className="h-2.5 w-2.5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-500">Candidate Name</p>
                <p className="text-[10px] text-slate-400">Always visible · cannot be hidden</p>
              </div>
            </div>

            {/* Configurable fields */}
            {KANBAN_CARD_FIELD_OPTIONS.map(field => {
              const active = (form.kanban_card_fields ?? ['company']).includes(field.id)
              return (
                <button
                  key={field.id}
                  type="button"
                  onClick={() => toggleCardField(field.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors ${
                    active
                      ? 'bg-indigo-50 border-indigo-200'
                      : 'bg-white border-slate-100 hover:border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-all ${
                    active ? 'bg-indigo-500 border-indigo-500' : 'border-slate-300 bg-white'
                  }`}>
                    {active && <Check className="h-2.5 w-2.5 text-white" />}
                  </div>
                  <div className="min-w-0">
                    <p className={`text-xs font-semibold ${active ? 'text-indigo-700' : 'text-slate-700'}`}>
                      {field.label}
                    </p>
                    <p className="text-[10px] text-slate-400">{field.description}</p>
                  </div>
                </button>
              )
            })}
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

      {/* Slack Notifications — channel webhook (admin-only) */}
      {!isAdmin ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
              <Bell className="h-4 w-4 text-slate-400" />
            </div>
            <h2 className="text-sm font-semibold text-slate-500">Slack Channel Alerts</h2>
          </div>
          <p className="text-xs text-slate-500 ml-11">Only admins can change the Slack webhook URL.</p>
        </div>
      ) : (
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
      )}

      {/* Slack App — OAuth DMs (admin-only install/disconnect) */}
      {!isAdmin ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
              <Plug className="h-4 w-4 text-slate-400" />
            </div>
            <h2 className="text-sm font-semibold text-slate-500">Slack App</h2>
          </div>
          <p className="text-xs text-slate-500 ml-11">
            {slackConnected
              ? `Connected to ${slackTeamName ?? 'your workspace'} by your admin.`
              : 'Your admin hasn’t installed the Slack app yet.'}
          </p>
        </div>
      ) : (
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
      )}

      {/* Google Calendar / Meet */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
            <Calendar className="h-4 w-4 text-blue-600" />
          </div>
          <h2 className="text-sm font-semibold text-slate-800">Google Calendar &amp; Meet</h2>
          <span className="text-xs text-slate-400">Auto-create Meet links on interview scheduling</span>
        </div>

        {googleConnected ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-2 w-2 rounded-full bg-green-500" />
              <p className="text-sm text-slate-700">
                Connected as <span className="font-semibold">{googleEmail ?? 'your Google account'}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={disconnectGoogle}
              disabled={googleDisconnecting}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-60"
            >
              {googleDisconnecting ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              Connect Google Calendar so RecruiterStack can create calendar events with Google Meet links
              when you schedule interviews. Invites are sent automatically to candidates and interviewers.
            </p>
            <a
              href="/api/google/connect"
              className="inline-flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
            >
              {/* Google G icon */}
              <svg viewBox="0 0 24 24" className="h-4 w-4" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Connect Google Calendar
            </a>
          </div>
        )}
      </div>

      {/* Zoom */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
            <Video className="h-4 w-4 text-blue-600" />
          </div>
          <h2 className="text-sm font-semibold text-slate-800">Zoom</h2>
          <span className="text-xs text-slate-400">Auto-create Zoom meeting links on scheduling</span>
        </div>

        {zoomConnected ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-2 w-2 rounded-full bg-green-500" />
              <p className="text-sm text-slate-700">
                Connected as <span className="font-semibold">{zoomEmail ?? 'your Zoom account'}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={disconnectZoom}
              disabled={zoomDisconnecting}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-60"
            >
              {zoomDisconnecting ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              Connect Zoom so RecruiterStack can auto-create Zoom meeting links
              when you schedule video interviews.
            </p>
            <a
              href="/api/zoom/connect"
              className="inline-flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
            >
              <Video className="h-4 w-4 text-blue-600" />
              Connect Zoom
            </a>
          </div>
        )}
      </div>

      {/* Microsoft Teams */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50">
            <Monitor className="h-4 w-4 text-violet-600" />
          </div>
          <h2 className="text-sm font-semibold text-slate-800">Microsoft Teams</h2>
          <span className="text-xs text-slate-400">Auto-create Teams links &amp; Outlook events</span>
        </div>

        {msConnected ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-2 w-2 rounded-full bg-green-500" />
              <p className="text-sm text-slate-700">
                Connected as <span className="font-semibold">{msEmail ?? 'your Microsoft account'}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={disconnectMicrosoft}
              disabled={msDisconnecting}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-60"
            >
              {msDisconnecting ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              Connect Microsoft to auto-create Teams meeting links and Outlook calendar events
              when scheduling interviews. Supports work, school, and personal accounts.
            </p>
            <a
              href="/api/microsoft/connect"
              className="inline-flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
            >
              <Monitor className="h-4 w-4 text-violet-600" />
              Connect Microsoft
            </a>
          </div>
        )}
      </div>

      {/* Admin-only workspace config */}
      {isAdmin && (
        <div className="space-y-4">
          <CompanyInfoCard />
          <AgentsCard />
          <DepartmentsCard />
          <LocationsCard />
          <CompBandsCard />
          <TeamCard />
        </div>
      )}

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
