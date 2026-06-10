'use client'

import { useEffect, useState } from 'react'
import { CheckCircle, MessageCircle } from 'lucide-react'

type Provider = 'meta' | 'vobiz'

interface WhatsAppStatus {
  connected: boolean
  status: string
  provider?: Provider
  phone_number_id?: string
  waba_id?: string | null
  auth_id?: string | null
  display_phone?: string | null
  outreach_template?: string | null
  template_language?: string
}

// WhatsApp (Meta Cloud API) integration card for the Settings → Integrations
// tab. Self-contained: owns its fetch/save/test state so the (already large)
// settings page only mounts it.
export function WhatsAppCard({ isAdmin }: { isAdmin: boolean }) {
  const [loaded, setLoaded] = useState(false)
  const [connected, setConnected] = useState(false)
  const [provider, setProvider] = useState<Provider>('vobiz')
  const [displayPhone, setDisplayPhone] = useState('')
  const [phoneNumberId, setPhoneNumberId] = useState('')
  const [wabaId, setWabaId] = useState('')
  const [authId, setAuthId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [appSecret, setAppSecret] = useState('')
  const [template, setTemplate] = useState('')
  const [templateLang, setTemplateLang] = useState('en')
  const [editing, setEditing] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [testPhone, setTestPhone] = useState('')
  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle')
  const [testMessage, setTestMessage] = useState('')

  useEffect(() => {
    if (!isAdmin) return
    fetch('/api/org-settings/whatsapp')
      .then(res => res.json())
      .then(({ data }: { data: WhatsAppStatus }) => {
        setConnected(data.connected)
        if (data.provider) setProvider(data.provider)
        setPhoneNumberId(data.phone_number_id ?? '')
        setWabaId(data.waba_id ?? '')
        setAuthId(data.auth_id ?? '')
        setDisplayPhone(data.display_phone ?? '')
        setTemplate(data.outreach_template ?? '')
        setTemplateLang(data.template_language ?? 'en')
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [isAdmin])

  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/webhooks/whatsapp`
    : '/api/webhooks/whatsapp'

  const save = async () => {
    setSaveStatus('saving')
    try {
      const res = await fetch('/api/org-settings/whatsapp', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          phone_number_id: phoneNumberId.trim(),
          waba_id: provider === 'meta' ? wabaId.trim() || null : null,
          auth_id: provider === 'vobiz' ? authId.trim() || null : null,
          display_phone: displayPhone.trim() || null,
          access_token: accessToken.trim(),
          app_secret: provider === 'meta' ? appSecret.trim() || null : null,
          outreach_template: template.trim() || null,
          template_language: templateLang.trim() || 'en',
        }),
      })
      if (!res.ok) throw new Error()
      setConnected(true)
      setEditing(false)
      setAccessToken('')
      setAppSecret('')
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2500)
    } catch {
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 2500)
    }
  }

  const disconnect = async () => {
    await fetch('/api/org-settings/whatsapp', { method: 'DELETE' }).catch(() => {})
    setConnected(false)
  }

  const sendTest = async () => {
    setTestStatus('sending')
    setTestMessage('')
    try {
      const res = await fetch('/api/org-settings/whatsapp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_phone: testPhone.trim() }),
      })
      const json = await res.json().catch(() => ({}))
      setTestMessage(json?.data?.message ?? '')
      setTestStatus(res.ok ? 'ok' : 'error')
    } catch {
      setTestStatus('error')
    }
    setTimeout(() => setTestStatus('idle'), 4000)
  }

  if (!isAdmin) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
            <MessageCircle className="h-4 w-4 text-slate-400" />
          </div>
          <h2 className="text-sm font-semibold text-slate-500">WhatsApp</h2>
        </div>
        <p className="text-xs text-slate-500 ml-11">Only admins can manage the WhatsApp connection.</p>
      </div>
    )
  }

  const inputClass =
    'w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition'

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6 space-y-4">
      <div className="flex items-center gap-2.5 mb-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-50">
          <MessageCircle className="h-4 w-4 text-green-600" />
        </div>
        <h2 className="text-sm font-semibold text-slate-800">WhatsApp</h2>
      </div>
      <p className="text-xs text-slate-400 -mt-2">Agents message candidates on WhatsApp; replies are answered by AI</p>

      {!loaded ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : connected && !editing ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-2 w-2 rounded-full bg-green-500" />
              <p className="text-sm text-slate-700">
                Connected{displayPhone ? <> as <span className="font-semibold">{displayPhone}</span></> : null}
                <span className="text-slate-400"> · via {provider === 'vobiz' ? 'Vobiz' : 'Meta'}</span>
                {template ? <span className="text-slate-400"> · template “{template}”</span> : null}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={disconnect}
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Disconnect
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Send a test message</label>
            <div className="flex items-center gap-2">
              <input
                value={testPhone}
                onChange={e => setTestPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className={inputClass}
              />
              <button
                type="button"
                onClick={sendTest}
                disabled={testStatus === 'sending' || !testPhone.trim()}
                className="shrink-0 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-60"
              >
                {testStatus === 'sending' ? 'Sending…' : testStatus === 'ok' ? '✅ Sent!' : testStatus === 'error' ? '❌ Failed' : 'Test'}
              </button>
            </div>
            {testMessage && <p className="mt-1 text-xs text-slate-400">{testMessage}</p>}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Provider</label>
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-0.5">
              {(['vobiz', 'meta'] as const).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setProvider(p)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    provider === p ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {p === 'vobiz' ? 'Vobiz' : 'Meta Cloud API'}
                </button>
              ))}
            </div>
          </div>

          {provider === 'meta' ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Phone Number ID</label>
                <input value={phoneNumberId} onChange={e => setPhoneNumberId(e.target.value)} placeholder="1064…" className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">WABA ID</label>
                <input value={wabaId} onChange={e => setWabaId(e.target.value)} placeholder="1023…" className={inputClass} />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Channel ID</label>
                <input value={phoneNumberId} onChange={e => setPhoneNumberId(e.target.value)} placeholder="ch_…" className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Auth ID</label>
                <input value={authId} onChange={e => setAuthId(e.target.value)} placeholder="Console → Settings → API Credentials" className={inputClass} />
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Display phone (optional)</label>
            <input value={displayPhone} onChange={e => setDisplayPhone(e.target.value)} placeholder="+91 98765 43210" className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">
              {provider === 'meta' ? 'Permanent access token' : 'Auth Token'}
            </label>
            <input
              type="password"
              value={accessToken}
              onChange={e => setAccessToken(e.target.value)}
              placeholder={provider === 'meta' ? 'EAAG…' : 'Console → Settings → API Credentials'}
              className={inputClass}
            />
          </div>
          {provider === 'meta' && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">App secret (for webhook verification)</label>
              <input type="password" value={appSecret} onChange={e => setAppSecret(e.target.value)} placeholder="From Meta App → Settings → Basic" className={inputClass} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Outreach template name</label>
              <input value={template} onChange={e => setTemplate(e.target.value)} placeholder="recruiter_outreach" className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Template language</label>
              <input value={templateLang} onChange={e => setTemplateLang(e.target.value)} placeholder="en" className={inputClass} />
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5">
            <p className="text-xs font-semibold text-slate-500 mb-1">Webhook callback URL</p>
            <p className="text-xs font-mono text-slate-600 break-all">{webhookUrl}</p>
            <p className="mt-1.5 text-xs text-slate-400">
              {provider === 'meta' ? (
                <>In your Meta app → WhatsApp → Configuration, set this callback URL with your verify token, and
                subscribe to the <span className="font-medium">messages</span> webhook field.</>
              ) : (
                <>In the Vobiz Console, set this as your WhatsApp callback URL. Callbacks are verified
                automatically using your Auth Token — no extra secret needed.</>
              )}{' '}
              Register an outreach template (e.g. “Hi {'{{1}}'}, this is {'{{2}}'} from {'{{3}}'}. We&apos;re hiring
              for {'{{4}}'} — interested? Reply here or apply: {'{{5}}'}”) and enter its name above.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={
                saveStatus === 'saving' ||
                !phoneNumberId.trim() ||
                !accessToken.trim() ||
                (provider === 'meta' ? !wabaId.trim() : !authId.trim())
              }
              className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors disabled:opacity-60"
            >
              {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? (
                <><CheckCircle className="h-4 w-4" /> Saved!</>
              ) : saveStatus === 'error' ? 'Failed — retry' : 'Connect'}
            </button>
            {connected && (
              <button
                type="button"
                onClick={() => { setEditing(false); setAccessToken(''); setAppSecret('') }}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
