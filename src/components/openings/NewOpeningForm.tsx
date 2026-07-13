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
import { DepartmentCombobox } from '@/components/openings/DepartmentCombobox'
import type {
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
  hiring_manager_id:    string
  hiring_manager_name:  string
  hiring_manager_email: string
  recruiter_id:      string
  justification:     string
}

const EMPTY: FormState = {
  title: '', department_id: '', location_id: '',
  employment_type: 'full_time',
  comp_band_id: '', comp_min: '', comp_max: '', comp_currency: 'USD',
  target_start_date: '',
  hiring_manager_id: '', hiring_manager_name: '', hiring_manager_email: '',
  recruiter_id: '',
  justification: '',
}

export function NewOpeningForm() {
  const router = useRouter()
  const [form, setForm]       = useState<FormState>(EMPTY)
  const [locs,  setLocs]      = useState<LocationRow[]>([])
  const [bands, setBands]     = useState<CompensationBand[]>([])
  const [members, setMembers] = useState<TeamMemberLite[]>([])
  const [defs, setDefs]       = useState<CustomFieldDefinition[]>([])
  const [customValues, setCustomValues] = useState<Record<string, unknown>>({})
  const [saving, setSaving]   = useState(false)
  // Approver picker mode: pick a teammate ('member') or invite someone new by
  // email ('invite'). Drives whether the name/email fields are auto-filled +
  // locked (member) or free-entry (invite).
  const [hmMode, setHmMode]   = useState<'member' | 'invite'>('invite')

  // When picking a teammate, stamp their user_id + copy name/email off the
  // member so the required fields pass and still flow down to the job. When
  // inviting, clear the id (the POST route provisions a seat from the email)
  // and blank the fields for fresh entry.
  function onPickHiringManager(value: string) {
    if (value === '__invite__') {
      setHmMode('invite')
      setForm(f => ({ ...f, hiring_manager_id: '', hiring_manager_name: '', hiring_manager_email: '' }))
      return
    }
    const member = members.find(m => m.users?.id === value)
    setHmMode('member')
    setForm(f => ({
      ...f,
      hiring_manager_id:    value,
      hiring_manager_name:  member?.users?.full_name ?? f.hiring_manager_name,
      hiring_manager_email: member?.users?.email ?? f.hiring_manager_email,
    }))
  }

  useEffect(() => {
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
    if (!form.department_id) {
      toast.error('Department is required')
      return
    }
    if (!form.hiring_manager_name.trim()) {
      toast.error('Hiring manager name is required')
      return
    }
    const hmEmail = form.hiring_manager_email.trim()
    if (!hmEmail) {
      toast.error("Hiring manager's email is required")
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(hmEmail)) {
      toast.error('Enter a valid hiring manager email')
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
      hiring_manager_id:    form.hiring_manager_id || null,
      hiring_manager_name:  form.hiring_manager_name.trim() || null,
      hiring_manager_email: form.hiring_manager_email.trim() || null,
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
            <Label htmlFor="title">Title <span className="text-red-500">*</span></Label>
            <Input
              id="title"
              placeholder="Senior Backend Engineer"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Department <span className="text-red-500">*</span></Label>
              <DepartmentCombobox
                value={form.department_id}
                onChange={id => setForm(f => ({ ...f, department_id: id, comp_band_id: '' }))}
              />
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
              <Label>Hiring manager (approver) <span className="text-red-500">*</span></Label>
              <Select
                value={hmMode === 'member' ? form.hiring_manager_id : '__invite__'}
                onChange={e => onPickHiringManager(e.target.value)}
              >
                {members.map(m => (
                  <option key={m.id} value={m.users?.id ?? ''}>{m.users?.full_name ?? m.users?.email ?? 'Unknown'}</option>
                ))}
                <option value="__invite__">➕ Invite someone by email…</option>
              </Select>
              <p className="text-[11px] text-slate-400">
                {hmMode === 'member'
                  ? 'This teammate approves the requisition.'
                  : 'Not on your team yet — they get a free approver seat and an email invite.'}
              </p>
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

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="hm-name">Hiring manager name <span className="text-red-500">*</span></Label>
              <Input
                id="hm-name"
                placeholder="Priya Sharma"
                value={form.hiring_manager_name}
                disabled={hmMode === 'member'}
                onChange={e => setForm(f => ({ ...f, hiring_manager_name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hm-email">Hiring manager email <span className="text-red-500">*</span></Label>
              <Input
                id="hm-email"
                type="email"
                placeholder="priya@company.com"
                value={form.hiring_manager_email}
                disabled={hmMode === 'member'}
                onChange={e => setForm(f => ({ ...f, hiring_manager_email: e.target.value }))}
              />
              <p className="text-[11px] text-slate-400">
                {hmMode === 'member'
                  ? 'Filled from the teammate you picked. Flows to the job + calendar booking link.'
                  : 'Flows to the job. Powers the calendar booking link in sequence emails.'}
              </p>
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
