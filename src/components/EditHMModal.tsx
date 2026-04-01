'use client'

import { useState } from 'react'
import { X, Loader2, Pencil } from 'lucide-react'
import { inputCls } from '@/lib/ui/styles'

interface EditHMModalProps {
  requestId: string
  initial: { name: string; email: string | null; slack: string | null }
  onClose: () => void
  onSaved: (updated: { name: string; email: string | null; slack: string | null }) => void
}

export default function EditHMModal({ requestId, initial, onClose, onSaved }: EditHMModalProps) {
  const [name,  setName]  = useState(initial.name ?? '')
  const [email, setEmail] = useState(initial.email ?? '')
  const [slack, setSlack] = useState(initial.slack ?? '')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required.'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/hiring-requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hiring_manager_name:  name.trim(),
          hiring_manager_email: email.trim() || null,
          hiring_manager_slack: slack.trim() || null,
        }),
      })
      if (!res.ok) { setError('Failed to save. Please try again.'); setSaving(false); return }
      onSaved({
        name:  name.trim(),
        email: email.trim() || null,
        slack: slack.trim() || null,
      })
      onClose()
    } catch {
      setError('Network error. Please try again.')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100">
              <Pencil className="h-3.5 w-3.5 text-slate-500" />
            </div>
            <h2 className="text-sm font-semibold text-slate-900">Edit Hiring Manager</h2>
          </div>
          <button
            onClick={onClose}
            className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Fields */}
        <div className="px-5 py-4 space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Name <span className="text-red-400">*</span></label>
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Priya Sharma"
              className={inputCls}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="priya@company.com"
              className={inputCls}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Slack handle <span className="text-slate-400 font-normal">(for DM notifications)</span></label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">@</span>
              <input
                value={slack.replace(/^@/, '')}
                onChange={e => setSlack(e.target.value.replace(/^@/, ''))}
                placeholder="priya.sharma"
                className={`${inputCls} pl-7`}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
              />
            </div>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 px-5 pb-4 pt-1">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save changes
          </button>
        </div>
      </div>
    </div>
  )
}
