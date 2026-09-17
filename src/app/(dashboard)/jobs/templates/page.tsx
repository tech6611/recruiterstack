'use client'

import { useEffect, useMemo, useState } from 'react'
import { Plus, LayoutTemplate, Pencil, Archive, ArchiveRestore, ChevronDown, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { JobTemplateEditor, type EditorOption, type PlanTemplateOption } from '@/components/req-jobs/JobTemplateEditor'
import type { JobTemplate } from '@/lib/types/requisitions'
import { cn } from '@/lib/utils'

// /jobs/templates — the org's full job templates (fields + JD + comp +
// interview-plan template + draft posting). The New Job drawer starts from
// these. Look-and-feel follows /admin/approvals (Cards, slate + emerald).

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

export default function JobTemplatesPage() {
  const [items, setItems]         = useState<JobTemplate[]>([])
  const [loaded, setLoaded]       = useState(false)
  const [departments, setDepts]   = useState<EditorOption[]>([])
  const [locations, setLocs]      = useState<EditorOption[]>([])
  const [plans, setPlans]         = useState<PlanTemplateOption[]>([])
  const [editing, setEditing]     = useState<JobTemplate | null | 'new'>(null)
  const [showArchived, setShowArchived] = useState(false)

  async function refresh() {
    const r = await fetch('/api/job-templates?include_inactive=1').then(x => x.json()).catch(() => ({ data: [] }))
    setItems((r.data ?? []) as JobTemplate[])
    setLoaded(true)
  }

  useEffect(() => {
    refresh()
    const pick = (d: { data?: Array<{ id: string; name: string }> }) => (d.data ?? []).map(x => ({ id: x.id, name: x.name }))
    fetch('/api/departments').then(r => r.json()).then(d => setDepts(pick(d))).catch(() => {})
    fetch('/api/locations').then(r => r.json()).then(d => setLocs(pick(d))).catch(() => {})
    fetch('/api/plan-templates').then(r => r.json()).then(d => setPlans(pick(d))).catch(() => {})
  }, [])

  const deptName = useMemo(() => new Map(departments.map(d => [d.id, d.name])), [departments])
  const planName = useMemo(() => new Map(plans.map(p => [p.id, p.name])), [plans])
  const active   = items.filter(t => t.is_active)
  const archived = items.filter(t => !t.is_active)

  async function setActive(t: JobTemplate, isActive: boolean) {
    const res = isActive
      ? await fetch(`/api/job-templates/${t.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: true }) })
      : await fetch(`/api/job-templates/${t.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? 'Could not update the template.')
      return
    }
    toast.success(isActive ? `"${t.name}" restored.` : `"${t.name}" archived — it no longer shows in the New Job form.`)
    refresh()
  }

  const Row = ({ t }: { t: JobTemplate }) => (
    <div className={cn('grid grid-cols-12 items-center gap-3 px-5 py-3.5 text-sm', !t.is_active && 'opacity-70')}>
      <div className="col-span-4 min-w-0">
        <p className="truncate font-semibold text-slate-900">{t.name}</p>
        {t.description && <p className="truncate text-xs text-slate-500">{t.description}</p>}
      </div>
      <div className="col-span-3 min-w-0 truncate text-slate-700">{t.title || <span className="text-slate-400">—</span>}</div>
      <div className="col-span-2 min-w-0 truncate text-slate-600">{t.department_id ? (deptName.get(t.department_id) ?? '…') : <span className="text-slate-400">—</span>}</div>
      <div className="col-span-2 min-w-0 truncate text-slate-600">
        {t.plan_template_id
          ? <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-700">{planName.get(t.plan_template_id) ?? 'Plan'}</span>
          : <span className="text-slate-400">Default</span>}
      </div>
      <div className="col-span-1 flex items-center justify-end gap-1">
        <span className="mr-2 hidden text-xs text-slate-400 xl:inline">{fmtDate(t.updated_at)}</span>
        <button type="button" onClick={() => setEditing(t)} title="Edit" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900">
          <Pencil className="h-4 w-4" />
        </button>
        {t.is_active ? (
          <button type="button" onClick={() => setActive(t, false)} title="Archive" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-red-600">
            <Archive className="h-4 w-4" />
          </button>
        ) : (
          <button type="button" onClick={() => setActive(t, true)} title="Restore" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-emerald-700">
            <ArchiveRestore className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">Job templates</h1>
          <p className="mt-1 text-sm text-slate-500">
            Reusable job recipes — fields, job description, compensation, interview plan and a draft posting.
            Pick one in the New Job form to prefill everything; the job is independent afterwards.
          </p>
        </div>
        <Button onClick={() => setEditing('new')}><Plus className="mr-1.5 h-4 w-4" />New template</Button>
      </div>

      <Card>
        <div className="flex items-center gap-2 rounded-t-2xl border-b border-slate-200 bg-[#d6f5e5] px-5 py-3">
          <LayoutTemplate className="h-4 w-4 text-[#059669]" />
          <span className="text-sm font-semibold text-[#065f46]">Active templates</span>
          <span className="rounded-md bg-[#bff0d8] px-1.5 py-0.5 text-xs font-medium text-[#047857]">{active.length}</span>
        </div>
        <CardContent className="p-0">
          {!loaded ? (
            <p className="px-5 py-8 text-sm text-slate-400">Loading…</p>
          ) : active.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm font-medium text-slate-700">No job templates yet</p>
              <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
                Create one here, or open a job and choose &ldquo;Save as template&rdquo; to snapshot its setup.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-12 gap-3 border-b border-slate-100 px-5 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                <div className="col-span-4">Template</div>
                <div className="col-span-3">Job title</div>
                <div className="col-span-2">Department</div>
                <div className="col-span-2">Interview plan</div>
                <div className="col-span-1 text-right">Updated</div>
              </div>
              <div className="divide-y divide-slate-100">
                {active.map(t => <Row key={t.id} t={t} />)}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {archived.length > 0 && (
        <Card>
          <button type="button" onClick={() => setShowArchived(v => !v)}
            className="flex w-full items-center gap-2 rounded-t-2xl px-5 py-3 text-left hover:bg-slate-50">
            {showArchived ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
            <span className="text-sm font-semibold text-slate-600">Archived</span>
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-500">{archived.length}</span>
          </button>
          {showArchived && (
            <CardContent className="border-t border-slate-100 p-0">
              <div className="divide-y divide-slate-100">
                {archived.map(t => <Row key={t.id} t={t} />)}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {editing !== null && (
        <JobTemplateEditor
          template={editing === 'new' ? null : editing}
          departments={departments}
          locations={locations}
          planTemplates={plans}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh() }}
        />
      )}
    </div>
  )
}
