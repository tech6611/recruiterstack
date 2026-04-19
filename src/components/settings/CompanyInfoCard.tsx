'use client'

import { useEffect, useState } from 'react'
import { Building2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import type { CompanySize } from '@/lib/types/database'

interface FormState {
  company_name: string
  company_size: CompanySize | ''
  industry:     string
  website:      string
}

const EMPTY: FormState = { company_name: '', company_size: '', industry: '', website: '' }

export function CompanyInfoCard() {
  const [form,    setForm]    = useState<FormState>(EMPTY)
  const [loaded,  setLoaded]  = useState(false)
  const [saving,  setSaving]  = useState(false)

  useEffect(() => {
    fetch('/api/org-settings/company')
      .then(r => r.json())
      .then(({ data }) => {
        setForm({
          company_name: data?.company_name ?? '',
          company_size: (data?.company_size ?? '') as FormState['company_size'],
          industry:     data?.industry ?? '',
          website:      data?.website ?? '',
        })
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  async function save() {
    if (!form.company_name.trim()) {
      toast.error('Company name is required')
      return
    }
    if (!form.company_size) {
      toast.error('Pick a company size')
      return
    }
    setSaving(true)
    const res = await fetch('/api/org-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_name: form.company_name.trim(),
        company_size: form.company_size,
        industry:     form.industry.trim() || null,
        website:      form.website.trim()  || null,
      }),
    })
    setSaving(false)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? 'Save failed')
      return
    }
    toast.success('Company info saved')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-emerald-600" /> Company info
        </CardTitle>
        <CardDescription>Shown on the careers page and used in offer letters.</CardDescription>
      </CardHeader>
      <CardContent>
        {!loaded ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="company_name">Company name</Label>
              <Input id="company_name" value={form.company_name} onChange={e => setForm({ ...form, company_name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="company_size">Company size</Label>
              <Select id="company_size" value={form.company_size} onChange={e => setForm({ ...form, company_size: e.target.value as FormState['company_size'] })}>
                <option value="">Pick a range…</option>
                <option value="1-10">1–10</option>
                <option value="11-50">11–50</option>
                <option value="51-200">51–200</option>
                <option value="201-1000">201–1,000</option>
                <option value="1000+">1,000+</option>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="industry">Industry</Label>
                <Input id="industry" value={form.industry} onChange={e => setForm({ ...form, industry: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="website">Website</Label>
                <Input id="website" placeholder="https://acme.com" value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={save} loading={saving}>Save</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
