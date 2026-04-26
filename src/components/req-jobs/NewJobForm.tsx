'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { Department, JobConfidentiality } from '@/lib/types/requisitions'

interface FormState {
  title:           string
  department_id:   string
  description:     string
  confidentiality: JobConfidentiality
}

const EMPTY: FormState = { title: '', department_id: '', description: '', confidentiality: 'public' }

export function NewJobForm() {
  const router = useRouter()
  const [form, setForm]   = useState<FormState>(EMPTY)
  const [depts, setDepts] = useState<Department[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/departments').then(r => r.json()).then(({ data }) => setDepts(data ?? []))
  }, [])

  async function save() {
    if (!form.title.trim()) { toast.error('Title is required'); return }
    setSaving(true)
    const res = await fetch('/api/req-jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title:           form.title.trim(),
        department_id:   form.department_id || null,
        description:     form.description.trim() || null,
        confidentiality: form.confidentiality,
      }),
    })
    setSaving(false)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast.error(body.error ?? 'Save failed')
      return
    }
    toast.success('Pipeline created')
    router.push(`/req-jobs/${body.data.id}`)
  }

  return (
    <Card>
      <CardContent>
        <div className="space-y-5 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" placeholder="Senior Backend Engineer pipeline" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Department</Label>
            <Select value={form.department_id} onChange={e => setForm(f => ({ ...f, department_id: e.target.value }))}>
              <option value="">—</option>
              {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Internal context (optional)</Label>
            <Textarea
              id="description"
              placeholder="Job context for the hiring team — not the public JD."
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="min-h-[120px]"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Confidentiality</Label>
            <Select value={form.confidentiality} onChange={e => setForm(f => ({ ...f, confidentiality: e.target.value as JobConfidentiality }))}>
              <option value="public">Public — visible to whole org</option>
              <option value="confidential">Confidential — hiring team + admins only</option>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => router.push('/req-jobs')}>Cancel</Button>
            <Button onClick={save} loading={saving}>Save draft</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
