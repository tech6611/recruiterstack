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
import { CustomFieldsBlock } from '@/components/openings/CustomFieldsBlock'
import type {
  Department,
  Location as LocationRow,
  CompensationBand,
  EmploymentType,
  OpeningInsert,
  CustomFieldDefinition,
} from '@/lib/types/requisitions'

interface TeamMemberLite {
  id:     string
  users:  { id: string; email: string; full_name: string | null } | null
}

interface FormState {
  title:             string
  department_id:     string
  location_id:       string
  employment_type:   EmploymentType
  comp_band_id:      string
  comp_min:          string
  comp_max:          string
  comp_currency:     string
  target_start_date: string
  hiring_manager_id: string
  recruiter_id:      string
  justification:     string
}

const EMPTY: FormState = {
  title: '', department_id: '', location_id: '',
  employment_type: 'full_time',
  comp_band_id: '', comp_min: '', comp_max: '', comp_currency: 'USD',
  target_start_date: '',
  hiring_manager_id: '', recruiter_id: '',
  justification: '',
}

export function NewOpeningForm() {
  const router = useRouter()
  const [form, setForm]       = useState<FormState>(EMPTY)
  const [depts, setDepts]     = useState<Department[]>([])
  const [locs,  setLocs]      = useState<LocationRow[]>([])
  const [bands, setBands]     = useState<CompensationBand[]>([])
  const [members, setMembers] = useState<TeamMemberLite[]>([])
  const [defs, setDefs]       = useState<CustomFieldDefinition[]>([])
  const [customValues, setCustomValues] = useState<Record<string, unknown>>({})
  const [saving, setSaving]   = useState(false)

  useEffect(() => {
    fetch('/api/departments').then(r => r.json()).then(({ data }) => setDepts(data ?? []))
    fetch('/api/locations').then(r => r.json()).then(({ data }) => setLocs(data ?? []))
    fetch('/api/team').then(r => r.json()).then(({ data }) => setMembers(data ?? []))
    fetch('/api/admin/custom-fields?object_type=opening').then(r => r.json()).then(({ data }) => setDefs(data ?? []))
  }, [])

  // Refresh comp bands when dept/location changes, auto-fill if exactly one match.
  useEffect(() => {
    const params = new URLSearchParams()
    if (form.department_id) params.set('department_id', form.department_id)
    if (form.location_id)   params.set('location_id',   form.location_id)
    fetch(`/api/compensation-bands?${params}`)
      .then(r => r.json())
      .then(({ data }) => {
        const list: CompensationBand[] = data ?? []
        setBands(list)
        // If exactly one band matches and user hasn't picked one yet, suggest it.
        if (list.length === 1 && !form.comp_band_id) {
          applyBand(list[0])
        }
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.department_id, form.location_id])

  function applyBand(band: CompensationBand) {
    setForm(f => ({
      ...f,
      comp_band_id: band.id,
      comp_min:     String(band.min_salary),
      comp_max:     String(band.max_salary),
      comp_currency: band.currency,
    }))
  }

  async function save() {
    if (!form.title.trim()) {
      toast.error('Title is required')
      return
    }
    setSaving(true)
    const payload: Partial<OpeningInsert> = {
      title:             form.title.trim(),
      department_id:     form.department_id || null,
      location_id:       form.location_id   || null,
      employment_type:   form.employment_type,
      comp_band_id:      form.comp_band_id  || null,
      comp_min:          form.comp_min ? Number(form.comp_min) : null,
      comp_max:          form.comp_max ? Number(form.comp_max) : null,
      comp_currency:     form.comp_currency,
      target_start_date: form.target_start_date || null,
      hiring_manager_id: form.hiring_manager_id || null,
      recruiter_id:      form.recruiter_id || null,
      justification:     form.justification.trim() || null,
      custom_fields:     customValues,
    }
    const res = await fetch('/api/openings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setSaving(false)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast.error(body.error ?? 'Save failed')
      return
    }
    toast.success('Draft saved')
    router.push(`/openings/${body.data.id}`)
  }

  return (
    <Card>
      <CardContent>
        <div className="space-y-5 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              placeholder="Senior Backend Engineer"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Select value={form.department_id} onChange={e => setForm(f => ({ ...f, department_id: e.target.value, comp_band_id: '' }))}>
                <option value="">—</option>
                {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
              {depts.length === 0 && (
                <p className="text-[11px] text-slate-400">No departments configured yet.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Location</Label>
              <Select value={form.location_id} onChange={e => setForm(f => ({ ...f, location_id: e.target.value, comp_band_id: '' }))}>
                <option value="">—</option>
                {locs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </Select>
              {locs.length === 0 && (
                <p className="text-[11px] text-slate-400">No locations configured yet.</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Employment type</Label>
            <Select value={form.employment_type} onChange={e => setForm(f => ({ ...f, employment_type: e.target.value as EmploymentType }))}>
              <option value="full_time">Full-time</option>
              <option value="part_time">Part-time</option>
              <option value="contract">Contract</option>
              <option value="intern">Intern</option>
              <option value="temp">Temporary</option>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Hiring manager</Label>
              <Select value={form.hiring_manager_id} onChange={e => setForm(f => ({ ...f, hiring_manager_id: e.target.value }))}>
                <option value="">—</option>
                {members.map(m => (
                  <option key={m.id} value={m.users?.id ?? ''}>{m.users?.full_name ?? m.users?.email ?? 'Unknown'}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Recruiter</Label>
              <Select value={form.recruiter_id} onChange={e => setForm(f => ({ ...f, recruiter_id: e.target.value }))}>
                <option value="">Current user (default)</option>
                {members.map(m => (
                  <option key={m.id} value={m.users?.id ?? ''}>{m.users?.full_name ?? m.users?.email ?? 'Unknown'}</option>
                ))}
              </Select>
            </div>
          </div>

          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <Label>Compensation band</Label>
            <Select value={form.comp_band_id} onChange={e => {
              const id = e.target.value
              const band = bands.find(b => b.id === id)
              if (band) applyBand(band)
              else setForm(f => ({ ...f, comp_band_id: '' }))
            }}>
              <option value="">—</option>
              {bands.map(b => (
                <option key={b.id} value={b.id}>
                  {b.name} · {b.currency} {Number(b.min_salary).toLocaleString()}–{Number(b.max_salary).toLocaleString()}
                </option>
              ))}
            </Select>
            <div className="grid grid-cols-3 gap-3 pt-2">
              <div className="space-y-1">
                <Label className="text-xs">Min</Label>
                <Input value={form.comp_min} onChange={e => setForm(f => ({ ...f, comp_min: e.target.value }))} type="number" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Max</Label>
                <Input value={form.comp_max} onChange={e => setForm(f => ({ ...f, comp_max: e.target.value }))} type="number" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Currency</Label>
                <Input value={form.comp_currency} onChange={e => setForm(f => ({ ...f, comp_currency: e.target.value.toUpperCase().slice(0, 3) }))} maxLength={3} />
              </div>
            </div>
            <p className="text-[11px] text-slate-500">
              Band auto-fills min/max. Editing either outside the band marks this as out-of-band at submit time.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Target start date</Label>
            <Input type="date" value={form.target_start_date} onChange={e => setForm(f => ({ ...f, target_start_date: e.target.value }))} />
          </div>

          <CustomFieldsBlock definitions={defs} values={customValues} onChange={setCustomValues} />

          <div className="space-y-1.5">
            <Label htmlFor="justification">Justification</Label>
            <Textarea
              id="justification"
              placeholder="Why this hire is needed. Business impact, context, urgency."
              value={form.justification}
              onChange={e => setForm(f => ({ ...f, justification: e.target.value }))}
              className="min-h-[120px]"
            />
            <p className="text-[11px] text-slate-400">Required when submitting for approval (≥ 50 chars). Can be short or blank in draft.</p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => router.push('/openings')}>Cancel</Button>
            <Button onClick={save} loading={saving}>Save draft</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
