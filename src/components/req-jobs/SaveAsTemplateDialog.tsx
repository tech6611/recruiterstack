'use client'

import { useState } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const NAME_MAX = 120

interface Props {
  jobId:        string
  /** Seed for the template name (usually the job title). */
  initialName?: string
  /** `saved` is true when the server accepted the template. */
  onClose:      (saved: boolean) => void
}

/**
 * "Save as template…" — snapshots this job (fields, JD, comp, interview plan,
 * draft posting) into a reusable job template via POST /api/job-templates/from-job.
 */
export function SaveAsTemplateDialog({ jobId, initialName = '', onClose }: Props) {
  const [name, setName]     = useState(initialName)
  const [saving, setSaving] = useState(false)

  async function submit() {
    const trimmed = name.trim()
    if (!trimmed) { toast.error('Give the template a name'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/job-templates/from-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId, name: trimmed }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(body.error ?? 'Could not save the template'); return }
      toast.success('Template saved', {
        action: { label: 'View templates', onClick: () => { window.location.href = '/jobs/templates' } },
      })
      onClose(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => onClose(false)}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">Save as template</h3>
          <button onClick={() => onClose(false)} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-4 text-sm text-slate-600">
          Copies this job&apos;s details, description, compensation and interview plan into a
          reusable template. Future jobs can start from it.
        </p>

        <div className="space-y-1.5">
          <Label htmlFor="template-name">Template name</Label>
          <Input
            id="template-name"
            autoFocus
            value={name}
            maxLength={NAME_MAX}
            placeholder="Senior Backend Engineer (Bengaluru)"
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit() }}
          />
          <p className="text-[11px] text-slate-400">
            Manage templates under <Link href="/jobs/templates" className="underline hover:text-slate-600">Jobs → Templates</Link>.
          </p>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onClose(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} loading={saving}>Save template</Button>
        </div>
      </div>
    </div>
  )
}
