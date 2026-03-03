'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Send, CheckCircle, Copy, Check } from 'lucide-react'
import Link from 'next/link'

export default function NewHiringRequestPage() {
  const router = useRouter()

  const [form, setForm] = useState({
    position_title: '',
    department: '',
    hiring_manager_name: '',
    hiring_manager_email: '',
    hiring_manager_slack: '',
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ name: string; intakeUrl: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const set = (key: keyof typeof form, value: string) =>
    setForm(f => ({ ...f, [key]: value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const res = await fetch('/api/hiring-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        position_title: form.position_title,
        department: form.department || undefined,
        hiring_manager_name: form.hiring_manager_name,
        hiring_manager_email: form.hiring_manager_email,
        hiring_manager_slack: form.hiring_manager_slack || undefined,
      }),
    })

    const json = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(json.error ?? 'Something went wrong')
      return
    }

    setSuccess({ name: form.hiring_manager_name, intakeUrl: json.intake_url })
  }

  const copyIntakeUrl = () => {
    if (!success) return
    navigator.clipboard.writeText(success.intakeUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const inputCls = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition'

  if (success) {
    return (
      <div className="p-8 max-w-lg">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center space-y-4">
          <CheckCircle className="h-12 w-12 text-emerald-500 mx-auto" />
          <div>
            <h2 className="text-xl font-bold text-emerald-900">Request sent!</h2>
            <p className="text-sm text-emerald-700 mt-2">
              An email and Slack message have been sent to <strong>{success.name}</strong> with the intake form link.
            </p>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-white p-3 text-left">
            <p className="text-xs font-semibold text-slate-500 mb-1.5">Intake form link</p>
            <div className="flex items-center gap-2">
              <p className="text-xs text-slate-600 truncate flex-1 font-mono">{success.intakeUrl}</p>
              <button
                onClick={copyIntakeUrl}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 transition-colors shrink-0"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => { setSuccess(null); setForm({ position_title: '', department: '', hiring_manager_name: '', hiring_manager_email: '', hiring_manager_slack: '' }) }}
              className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              New Request
            </button>
            <button
              onClick={() => router.push('/hiring-requests')}
              className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
            >
              View All Requests
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-xl space-y-6">
      <div>
        <Link
          href="/hiring-requests"
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">New Hiring Request</h1>
        <p className="text-sm text-slate-500 mt-1">
          Fill in the basics — we'll send the hiring manager an intake form to collect the full requirements.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Position</p>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">
              Job Title <span className="text-red-500">*</span>
            </label>
            <input
              required
              value={form.position_title}
              onChange={e => set('position_title', e.target.value)}
              placeholder="Senior Product Designer"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Department / Team</label>
            <input
              value={form.department}
              onChange={e => set('department', e.target.value)}
              placeholder="Engineering, Product, Sales…"
              className={inputCls}
            />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Hiring Manager</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                required
                value={form.hiring_manager_name}
                onChange={e => set('hiring_manager_name', e.target.value)}
                placeholder="Alex Johnson"
                className={inputCls}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                required
                type="email"
                value={form.hiring_manager_email}
                onChange={e => set('hiring_manager_email', e.target.value)}
                placeholder="alex@company.com"
                className={inputCls}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                Slack Handle <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <input
                value={form.hiring_manager_slack}
                onChange={e => set('hiring_manager_slack', e.target.value)}
                placeholder="@alexj"
                className={inputCls}
              />
              <p className="text-xs text-slate-400 mt-1">Used to @mention them in the Slack notification</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-700 space-y-1">
          <p className="font-semibold">What happens next:</p>
          <p>1. {form.hiring_manager_name || 'The hiring manager'} gets an email + Slack with their personal intake link</p>
          <p>2. They fill in the role details and requirements</p>
          <p>3. They generate a JD with AI (or write their own) directly on the form</p>
          <p>4. They submit the ticket — you get notified and pick it up from here</p>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition-colors shadow-sm"
        >
          {loading ? (
            <>Sending intake request…</>
          ) : (
            <><Send className="h-4 w-4" />Send Intake Request</>
          )}
        </button>
      </form>
    </div>
  )
}
