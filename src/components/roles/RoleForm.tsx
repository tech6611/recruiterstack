'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Role, RoleStatus } from '@/lib/types/database'

interface RoleFormProps {
  role?: Role
  onSuccess: () => void
}

const STATUS_OPTIONS: { value: RoleStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'closed', label: 'Closed' },
]

export function RoleForm({ role, onSuccess }: RoleFormProps) {
  const router = useRouter()
  const isEdit = !!role

  const [form, setForm] = useState({
    job_title: role?.job_title ?? '',
    location: role?.location ?? '',
    min_experience: role?.min_experience ?? 0,
    salary_min: role?.salary_min ?? '',
    salary_max: role?.salary_max ?? '',
    required_skills: role?.required_skills.join(', ') ?? '',
    status: (role?.status ?? 'draft') as RoleStatus,
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (key: keyof typeof form, value: string | number) =>
    setForm((f) => ({ ...f, [key]: value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const payload = {
      job_title: form.job_title,
      location: form.location || null,
      min_experience: Number(form.min_experience),
      salary_min: form.salary_min !== '' ? Number(form.salary_min) : null,
      salary_max: form.salary_max !== '' ? Number(form.salary_max) : null,
      required_skills: form.required_skills
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      status: form.status,
    }

    const url = isEdit ? `/api/roles/${role.id}` : '/api/roles'
    const method = isEdit ? 'PATCH' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    setLoading(false)

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Something went wrong')
      return
    }

    router.refresh()
    onSuccess()
  }

  const inputCls =
    'w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition'

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-xs font-semibold text-slate-500 mb-1.5">
            Job Title <span className="text-red-500">*</span>
          </label>
          <input
            required
            value={form.job_title}
            onChange={(e) => set('job_title', e.target.value)}
            placeholder="Senior Full-Stack Engineer"
            className={inputCls}
          />
        </div>

        <div className="col-span-2">
          <label className="block text-xs font-semibold text-slate-500 mb-1.5">Location</label>
          <input
            value={form.location}
            onChange={(e) => set('location', e.target.value)}
            placeholder="Remote, New York, etc."
            className={inputCls}
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5">
            Min Experience (yrs)
          </label>
          <input
            type="number"
            min={0}
            value={form.min_experience}
            onChange={(e) => set('min_experience', e.target.value)}
            className={inputCls}
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5">Status</label>
          <select
            value={form.status}
            onChange={(e) => set('status', e.target.value)}
            className={inputCls}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5">
            Salary Min ($)
          </label>
          <input
            type="number"
            min={0}
            value={form.salary_min}
            onChange={(e) => set('salary_min', e.target.value)}
            placeholder="140000"
            className={inputCls}
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5">
            Salary Max ($)
          </label>
          <input
            type="number"
            min={0}
            value={form.salary_max}
            onChange={(e) => set('salary_max', e.target.value)}
            placeholder="180000"
            className={inputCls}
          />
        </div>

        <div className="col-span-2">
          <label className="block text-xs font-semibold text-slate-500 mb-1.5">
            Required Skills{' '}
            <span className="text-slate-400 font-normal">(comma-separated)</span>
          </label>
          <input
            value={form.required_skills}
            onChange={(e) => set('required_skills', e.target.value)}
            placeholder="TypeScript, React, Node.js, PostgreSQL"
            className={inputCls}
          />
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
        >
          {loading ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Role'}
        </button>
      </div>
    </form>
  )
}
