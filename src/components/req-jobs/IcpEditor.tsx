'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2, Save, Sparkles, ShieldCheck, CheckCircle2, Target, RefreshCw, Library, BookmarkPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { ScoringCriterion } from '@/lib/types/database'
import type { Icp, IcpCompetency, IcpMustHave } from '@/lib/types/icp'
import { icpToScoringCriteria } from '@/lib/scoring'

const GATE_ATTRIBUTES = ['location', 'seniority', 'skill', 'min_experience'] as const
const GATE_OPERATORS = ['equals', 'gte', 'includes', 'one_of'] as const

/**
 * The Ideal Candidate Profile editor (Slice 1b). Generates a draft ICP by seeding
 * from the job's existing rubric + fields, lets the recruiter edit hard gates and
 * weighted competencies (with observable behaviours), and approves it. Approving
 * syncs the flat rubric back to the job, so the Scoring rubric card below stays in
 * step. Gates are captured now; they start being enforced in the Fit Engine.
 */
export function IcpEditor({
  jobId,
  onApproved,
}: {
  jobId: string
  onApproved?: (criteria: ScoringCriterion[]) => void
}) {
  const [icp, setIcp] = useState<Icp | null>(null)
  const [comps, setComps] = useState<IcpCompetency[]>([])
  const [gates, setGates] = useState<IcpMustHave[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [approving, setApproving] = useState(false)
  const [refining, setRefining] = useState(false)
  // Component 02 — reusable role templates.
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [applyingTemplate, setApplyingTemplate] = useState(false)
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [savingTemplate, setSavingTemplate] = useState(false)

  function loadTemplates() {
    fetch('/api/role-templates')
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => setTemplates((j.data ?? []).map((t: { id: string; name: string }) => ({ id: t.id, name: t.name }))))
      .catch(() => {})
  }

  const total = comps.reduce((s, c) => s + (c.weight || 0), 0)
  const canApprove = comps.some((c) => c.name.trim()) && total === 100

  function hydrate(next: Icp) {
    setIcp(next)
    setComps(next.competencies ?? [])
    setGates(next.must_haves ?? [])
  }

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}/icp`)
        if (!active) return
        if (res.ok) {
          const { data } = await res.json()
          if (data) hydrate(data as Icp)
        }
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [jobId])

  useEffect(() => { loadTemplates() }, [])

  // Seed a draft ICP from a saved role template (Component 02).
  async function applyTemplate() {
    if (!selectedTemplate) return
    setApplyingTemplate(true)
    const res = await fetch(`/api/jobs/${jobId}/icp/from-template`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template_id: selectedTemplate }),
    })
    setApplyingTemplate(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      toast.error(j.error ?? 'Could not start from that template')
      return
    }
    const { data } = await res.json()
    hydrate(data as Icp)
    toast.success('Draft ICP started from your saved role — review and approve.')
  }

  // Save the current ICP as a reusable role template.
  async function saveAsTemplate() {
    const name = templateName.trim()
    if (!name) {
      toast.error('Give the template a name')
      return
    }
    setSavingTemplate(true)
    const res = await fetch('/api/role-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: jobId, name }),
    })
    setSavingTemplate(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      toast.error(j.error ?? 'Could not save the template')
      return
    }
    setShowSaveTemplate(false)
    setTemplateName('')
    loadTemplates()
    toast.success(`Saved "${name}" as a reusable role template.`)
  }

  async function generate() {
    setGenerating(true)
    const res = await fetch(`/api/jobs/${jobId}/icp/generate`, { method: 'POST' })
    setGenerating(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      toast.error(j.error ?? 'Could not generate an ICP')
      return
    }
    const { data } = await res.json()
    hydrate(data as Icp)
    toast.success('Draft ICP generated from this role — review and approve.')
  }

  /** Persist the working copy as a draft; returns the saved ICP (or null). */
  async function saveDraft(): Promise<Icp | null> {
    const named = comps.filter((c) => c.name.trim())
    if (named.length === 0) {
      toast.error('Add at least one competency')
      return null
    }
    const payload = { must_haves: gates, competencies: named }
    // A draft edits in place; an approved ICP branches a new draft version.
    const editingDraft = icp && icp.status === 'draft'
    const res = await fetch(
      editingDraft ? `/api/jobs/${jobId}/icp/${icp!.id}` : `/api/jobs/${jobId}/icp`,
      {
        method: editingDraft ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    )
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      toast.error(j.error ?? 'Save failed')
      return null
    }
    const { data } = await res.json()
    hydrate(data as Icp)
    return data as Icp
  }

  async function handleSave() {
    setSaving(true)
    const saved = await saveDraft()
    setSaving(false)
    if (saved) toast.success('Draft saved.')
  }

  async function handleApprove() {
    if (total !== 100) {
      toast.error(`Competency weights must sum to 100% (currently ${total}%)`)
      return
    }
    setApproving(true)
    const draft = await saveDraft()
    if (!draft) {
      setApproving(false)
      return
    }
    const res = await fetch(`/api/jobs/${jobId}/icp/${draft.id}/approve`, { method: 'POST' })
    setApproving(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      toast.error(j.error ?? 'Approve failed')
      return
    }
    const { data } = await res.json()
    hydrate(data as Icp)
    toast.success('ICP approved — the scoring rubric is now in sync.')
    onApproved?.(icpToScoringCriteria(data as Icp))
  }

  // Propose an ICP refinement from accumulated recruiter Yes/No decisions. Loads
  // the resulting draft for review; a human still approves it.
  async function refineFromFeedback() {
    setRefining(true)
    const res = await fetch(`/api/jobs/${jobId}/icp/refine-from-feedback`, { method: 'POST' })
    setRefining(false)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast.error(body.error ?? 'Could not refine the ICP')
      return
    }
    const data = body.data
    if (data?.status === 'insufficient') {
      toast(`${data.decided}/${data.needed} candidate decisions so far — mark a few more Yes/No, then refine.`)
      return
    }
    if (data?.icp) {
      hydrate(data.icp as Icp)
      toast.success(`Refined from feedback — review draft v${data.icp.version}${data.change_summary ? `: ${data.change_summary}` : ''}`)
    }
  }

  // ── competency editing ──────────────────────────────────────────────────────
  const setComp = (i: number, patch: Partial<IcpCompetency>) =>
    setComps((prev) => prev.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  const setWeight = (i: number, w: number) => setComp(i, { weight: Math.max(0, Math.min(100, w)) })
  const removeComp = (i: number) => setComps((prev) => prev.filter((_, j) => j !== i))
  const addComp = () =>
    setComps((prev) => [
      ...prev,
      { id: `c-${prev.length}-${Date.now()}`, name: '', weight: 0, behaviours: [] },
    ])
  const setBehaviour = (ci: number, bi: number, val: string) =>
    setComp(ci, { behaviours: comps[ci].behaviours.map((b, j) => (j === bi ? val : b)) })
  const addBehaviour = (ci: number) => setComp(ci, { behaviours: [...comps[ci].behaviours, ''] })
  const removeBehaviour = (ci: number, bi: number) =>
    setComp(ci, { behaviours: comps[ci].behaviours.filter((_, j) => j !== bi) })

  // ── gate editing ────────────────────────────────────────────────────────────
  const setGate = (i: number, patch: Partial<IcpMustHave>) =>
    setGates((prev) => prev.map((g, j) => (j === i ? { ...g, ...patch } : g)))
  const removeGate = (i: number) => setGates((prev) => prev.filter((_, j) => j !== i))
  const addGate = () =>
    setGates((prev) => [
      ...prev,
      { id: `g-${prev.length}-${Date.now()}`, label: '', attribute: 'skill', operator: 'includes', value: '' },
    ])

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-slate-400">Loading ICP…</CardContent>
      </Card>
    )
  }

  if (!icp) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Target className="h-4 w-4 text-slate-500" /> Ideal Candidate Profile
          </CardTitle>
          <CardDescription>
            A living, role-specific profile the AI scores candidates against — hard must-haves plus
            weighted competencies with observable behaviours. Generate a draft from this role to start.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center">
            <p className="text-sm text-slate-500">No ICP yet for this role.</p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <Button size="sm" onClick={generate} loading={generating}>
                <Sparkles className="h-3.5 w-3.5" /> Generate ICP
              </Button>
              {templates.length > 0 && (
                <>
                  <span className="text-xs text-slate-300">or</span>
                  <select
                    value={selectedTemplate}
                    onChange={(e) => setSelectedTemplate(e.target.value)}
                    className="h-8 rounded border border-slate-200 bg-white px-2 text-xs text-slate-600"
                    title="Start from a saved role calibration"
                  >
                    <option value="">Start from a saved role…</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  <Button size="sm" variant="outline" onClick={applyTemplate} loading={applyingTemplate} disabled={!selectedTemplate}>
                    <Library className="h-3.5 w-3.5" /> Use
                  </Button>
                </>
              )}
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Seeds from your scoring rubric, location, and level — or reuse a saved role. Nothing is applied until you approve.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const isApproved = icp.status === 'approved'

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Target className="h-4 w-4 text-slate-500" /> Ideal Candidate Profile
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              isApproved ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
            }`}
          >
            {isApproved ? 'Approved' : 'Draft'} · v{icp.version}
          </span>
        </CardTitle>
        <CardDescription>
          Must-haves are hard gates (captured now, enforced by the Fit Engine). Competencies are the
          weighted rubric — approving syncs them to the Scoring rubric below.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* ── Must-haves ── */}
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <ShieldCheck className="h-3.5 w-3.5 text-slate-400" /> Must-haves (hard gates)
          </div>
          {gates.length === 0 ? (
            <p className="text-xs text-slate-400">No gates — every candidate is scored on competencies alone.</p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 divide-y divide-slate-100">
              {gates.map((g, i) => (
                <div key={g.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                  <Input
                    value={g.label}
                    onChange={(e) => setGate(i, { label: e.target.value })}
                    placeholder="e.g. 5+ years backend"
                    className="h-8 min-w-[10rem] flex-1 text-sm"
                  />
                  <select
                    value={g.attribute}
                    onChange={(e) => setGate(i, { attribute: e.target.value })}
                    className="h-8 rounded border border-slate-200 bg-white px-2 text-xs text-slate-600"
                  >
                    {GATE_ATTRIBUTES.map((a) => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                  <select
                    value={g.operator}
                    onChange={(e) => setGate(i, { operator: e.target.value })}
                    className="h-8 rounded border border-slate-200 bg-white px-2 text-xs text-slate-600"
                  >
                    {GATE_OPERATORS.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                  <Input
                    value={Array.isArray(g.value) ? g.value.join(', ') : String(g.value ?? '')}
                    onChange={(e) => setGate(i, { value: e.target.value })}
                    placeholder="value"
                    className="h-8 w-32 text-sm"
                  />
                  <button type="button" onClick={() => removeGate(i)} className="text-slate-300 hover:text-red-500">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <Button size="sm" variant="outline" onClick={addGate}>
            <Plus className="h-3.5 w-3.5" /> Add must-have
          </Button>
        </section>

        {/* ── Competencies ── */}
        <section className="space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
            <span>Weighted competencies</span>
            <span className={total === 100 ? 'text-emerald-600' : 'text-amber-600'}>
              Total: {total}%{total === 100 ? ' ✓' : ' — must equal 100%'}
            </span>
          </div>
          <div className="space-y-2">
            {comps.map((c, i) => (
              <div key={c.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-center gap-2">
                  <Input
                    value={c.name}
                    onChange={(e) => setComp(i, { name: e.target.value })}
                    placeholder="Competency name"
                    className="h-8 flex-1 text-sm font-medium"
                  />
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setWeight(i, (c.weight || 0) - 5)}
                      className="h-6 w-6 rounded font-bold text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={c.weight}
                      onChange={(e) => setWeight(i, parseInt(e.target.value) || 0)}
                      className={`h-8 w-12 rounded border text-center text-xs font-semibold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none ${
                        total === 100 ? 'border-slate-200 text-slate-700' : 'border-amber-300 text-amber-600'
                      }`}
                    />
                    <span className={`text-xs font-semibold ${total === 100 ? 'text-slate-500' : 'text-amber-600'}`}>%</span>
                    <button
                      type="button"
                      onClick={() => setWeight(i, (c.weight || 0) + 5)}
                      className="h-6 w-6 rounded font-bold text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    >
                      +
                    </button>
                  </div>
                  <button type="button" onClick={() => removeComp(i)} className="text-slate-300 hover:text-red-500">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* behaviours */}
                <div className="mt-2 space-y-1.5 pl-1">
                  {c.behaviours.map((b, bi) => (
                    <div key={bi} className="flex items-center gap-2">
                      <span className="text-slate-300">•</span>
                      <Input
                        value={b}
                        onChange={(e) => setBehaviour(i, bi, e.target.value)}
                        placeholder="An observable behaviour of a strong candidate"
                        className="h-7 flex-1 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => removeBehaviour(i, bi)}
                        className="text-slate-300 hover:text-red-500"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addBehaviour(i)}
                    className="ml-4 text-xs font-medium text-slate-400 hover:text-slate-600"
                  >
                    + behaviour
                  </button>
                </div>
              </div>
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={addComp}>
            <Plus className="h-3.5 w-3.5" /> Add competency
          </Button>
        </section>
      </CardContent>

      <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-6 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {isApproved && (
            <Button size="sm" variant="outline" onClick={refineFromFeedback} loading={refining}
              title="Propose an updated ICP from recruiter Yes/No decisions on scored candidates">
              <RefreshCw className="h-3.5 w-3.5" /> Refine from feedback
            </Button>
          )}
          {showSaveTemplate ? (
            <div className="flex items-center gap-1">
              <Input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Template name"
                className="h-8 w-40 text-sm"
                autoFocus
              />
              <Button size="sm" onClick={saveAsTemplate} loading={savingTemplate}>Save</Button>
              <button type="button" onClick={() => setShowSaveTemplate(false)} className="text-slate-400 hover:text-slate-600 text-xs px-1">Cancel</button>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setShowSaveTemplate(true)}
              title="Save this calibration as a reusable role template">
              <BookmarkPlus className="h-3.5 w-3.5" /> Save as template
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleSave} loading={saving}>
            <Save className="h-3.5 w-3.5" /> Save draft
          </Button>
          <Button size="sm" onClick={handleApprove} loading={approving} disabled={!canApprove}>
            <CheckCircle2 className="h-3.5 w-3.5" /> {isApproved ? 'Re-approve' : 'Approve ICP'}
          </Button>
        </div>
      </div>
    </Card>
  )
}
