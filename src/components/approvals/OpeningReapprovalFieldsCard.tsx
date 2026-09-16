'use client'

import { useEffect, useMemo, useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface Option { key: string; label: string }

/**
 * Admin control for the Ashby "approval protects specific fields" model:
 * which built-in requisition fields, when edited on an approved/open
 * requisition, send the change back through the approval chain.
 * Custom fields are gated per-definition in Settings → Custom fields.
 */
export function OpeningReapprovalFieldsCard() {
  const [options,  setOptions]  = useState<Option[]>([])
  const [defaults, setDefaults] = useState<string[]>([])
  const [saved,    setSaved]    = useState<string[]>([])   // last persisted set
  const [fields,   setFields]   = useState<string[]>([])   // working set
  const [loaded,   setLoaded]   = useState(false)
  const [saving,   setSaving]   = useState(false)

  useEffect(() => {
    fetch('/api/admin/opening-reapproval-fields')
      .then(r => r.json())
      .then(({ data }) => {
        setOptions(data?.options ?? [])
        setDefaults(data?.defaults ?? [])
        setSaved(data?.fields ?? [])
        setFields(data?.fields ?? [])
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  const dirty = useMemo(() => {
    const a = [...fields].sort().join(','), b = [...saved].sort().join(',')
    return a !== b
  }, [fields, saved])

  function toggle(key: string) {
    setFields(prev => (prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]))
  }

  async function save() {
    setSaving(true)
    const res = await fetch('/api/admin/opening-reapproval-fields', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    })
    setSaving(false)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(body.error ?? 'Save failed'); return }
    setSaved(body.data?.fields ?? fields)
    setFields(body.data?.fields ?? fields)
    toast.success('Re-approval fields saved')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-amber-600" /> Requisition fields that need re-approval
        </CardTitle>
        <CardDescription>
          Editing one of these on an approved requisition sends the change back through its approval chain. Everything else saves immediately.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!loaded ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-2">
              {options.map(o => (
                <label key={o.key} className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={fields.includes(o.key)} onChange={() => toggle(o.key)} />
                  {o.label}
                </label>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <button
                type="button"
                className="text-xs text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline"
                onClick={() => setFields(defaults)}
              >
                Reset to defaults
              </button>
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-slate-400">
                  Custom fields are gated individually in Settings → Custom fields.
                </span>
                <Button size="sm" onClick={save} loading={saving} disabled={!dirty}>Save</Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
