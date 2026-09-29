'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2, Save, Sparkles, ShieldCheck, CheckCircle2, Target, RefreshCw, Library, BookmarkPlus, Brain, ChevronDown, ChevronRight, Compass, Lock, MoveHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { ScoringCriterion } from '@/lib/types/database'
import type { Icp, IcpCompetency, IcpMustHave } from '@/lib/types/icp'
import { icpToScoringCriteria } from '@/lib/scoring'
import { RecruiterBriefBody, RecruiterBriefChips } from '@/components/req-jobs/RecruiterBriefCard'
import { isCriterion, toCriterion, mustHaveFromCriterion, criterionLabel } from '@/lib/icp-gates'
import { IdealProfileTiles } from '@/components/req-jobs/IdealProfileTiles'
import { BetCards } from '@/components/req-jobs/BetCards'



/**
 * The Ideal Candidate Profile editor (Slice 1b). Generates a draft ICP by seeding
 * from the job's existing rubric + fields, lets the recruiter edit hard gates and
 * weighted competencies (with observable behaviours), and approves it. Approving
 * syncs the flat rubric back to the job, so the Overview's Scoring rubric card stays
 * in step. Gates are captured now; they start being enforced in the Fit Engine.
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
  // The profile the brief implies, offered when this ICP predates the ideal profile.
  const [fromBrief, setFromBrief] = useState<IcpMustHave[] | null>(null)
  // Old text questions the ideal profile covers — they no longer filter anyone.
  const [covered, setCovered] = useState<Set<string>>(new Set())
  // A pre-bet profile's bets, from its brief — offered, not saved.
  const [toBets, setToBets] = useState<{ rows: IcpMustHave[]; replaces: string[] } | null>(null)
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
  // Component 04 — optional intake-call notes to enrich generation with verbatim.
  const [intakeNotes, setIntakeNotes] = useState('')
  const [showIntake, setShowIntake] = useState(false)
  const [showReasoning, setShowReasoning] = useState(false)
  // Phase 1 (niche recruiter) — the recruiter's corrections to the brief the model
  // reasoned in (house knowledge fed into the next Regenerate).
  const [openComps, setOpenComps] = useState<Set<string>>(new Set())
  const [corrections, setCorrections] = useState('')
  const [savingCorrections, setSavingCorrections] = useState(false)

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
    setCorrections(next.sourcing_map?.recruiter_brief?.corrections ?? '')
  }

  /** Save the recruiter's corrections to the brief. Allowed on any status — they are
   *  house knowledge for the NEXT regenerate, not an edit to gates or weights. */
  async function saveCorrections() {
    if (!icp) return
    setSavingCorrections(true)
    const res = await fetch(`/api/jobs/${jobId}/icp/${icp.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recruiter_corrections: corrections }),
    })
    setSavingCorrections(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      toast.error(j.error ?? 'Could not save corrections')
      return
    }
    const { data } = await res.json()
    setIcp(data as Icp)
    toast.success('Corrections saved — they will shape the next Regenerate.')
  }

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}/icp?latest=1`)
        if (!active) return
        if (res.ok) {
          const { data, profile_from_brief, legacy_covered, bets_from_brief } = await res.json()
          setToBets(bets_from_brief ?? null)
          if (data) hydrate(data as Icp)
          setFromBrief(profile_from_brief ?? null)
          setCovered(new Set(legacy_covered ?? []))
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
    const res = await fetch(`/api/jobs/${jobId}/icp/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(intakeNotes.trim() ? { intake_notes: intakeNotes.trim() } : {}),
    })
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

  // One intake-notes box, shared by the empty state (Generate) and the editor (Regenerate).
  const intakeBox = (
    <div className="text-left">
      <label htmlFor="icp-intake-notes" className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        Intake call notes (optional, used when you {icp ? 'Regenerate' : 'Generate'})
      </label>
      <textarea
        id="icp-intake-notes"
        value={intakeNotes}
        onChange={(e) => setIntakeNotes(e.target.value)}
        rows={4}
        placeholder="Paste the hiring-manager intake call notes/transcript — the AI pulls their exact phrasing and must-haves."
        className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-xs text-slate-800 focus:border-emerald-500 focus:outline-none"
      />
    </div>
  )

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
            <div className="mt-3">
              {showIntake ? intakeBox : (
                <button type="button" onClick={() => setShowIntake(true)} className="text-xs font-medium text-slate-400 hover:text-slate-600">
                  + Paste intake call notes for sharper, verbatim competencies
                </button>
              )}
            </div>
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
        <CardDescription>Gates reject. Weights rank. Approving updates the scoring rubric on the Overview tab.</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* ── How this profile was reasoned — the recruiter brief + the JD breakdown,
            in one place (they used to be two panels, and the Source tab repeated them). ── */}
        {icp.sourcing_map && (
          <section className="rounded-xl border border-slate-200 bg-slate-50/60">
            {/* Leads with the bets (who we think will fit); everything else is under Details. */}
            <button type="button" onClick={() => setShowReasoning((s) => !s)}
              className="flex w-full flex-wrap items-center gap-2 px-3 py-2.5 text-left text-xs">
              <Brain className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
              <span className="font-semibold text-slate-700">{(icp.sourcing_map.archetypes?.length ?? 0) > 0 ? 'Who we’re betting on' : 'How this profile was reasoned'}</span>
              {icp.sourcing_map.recruiter_brief?.niche && <span className="text-slate-500">· {icp.sourcing_map.recruiter_brief.niche}</span>}
              <RecruiterBriefChips brief={icp.sourcing_map.recruiter_brief ?? null} compact={false} />
              <span className="ml-auto flex items-center gap-0.5 font-medium text-slate-500">
                Details {showReasoning ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </span>
            </button>
            {(icp.sourcing_map.archetypes?.length ?? 0) > 0 && (
              <div className="px-3 pb-3">
                <BetCards archetypes={icp.sourcing_map.archetypes!} brief={icp.sourcing_map.recruiter_brief} />
              </div>
            )}
            {showReasoning && (
              <div className="space-y-3 px-3 pb-3">
                {(icp.sourcing_map.recruiter_brief || icp.status === 'draft') && (
                  <div className="rounded-lg border border-slate-200 bg-white">
                    <div className="flex items-center gap-1.5 px-3 pt-2.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      <Compass className="h-3 w-3 text-indigo-600" /> Recruiter brief
                    </div>
                    <RecruiterBriefBody
                      brief={icp.sourcing_map.recruiter_brief ?? null}
                      corrections={corrections} onCorrectionsChange={setCorrections}
                      onSaveCorrections={saveCorrections} saving={savingCorrections}
                    />
                  </div>
                )}
                {icp.sourcing_map.reasoning && (
                  <p className="text-xs leading-relaxed text-slate-600">{icp.sourcing_map.reasoning}</p>
                )}

                {/*
                  ONLY THE screen_later ROWS. The generator sorts every requirement into
                  hard_filter / ranking_signal / screen_later, and this panel used to show
                  all three — the hard filters in red, next to a list of must-haves that
                  actually filter. Nothing read either of those two buckets: no route, no
                  query, no scorer. A red "HARD FILTER" badge on a line that filters nobody
                  is a claim the product does not honour, so they are gone.

                  screen_later stays because it is real: /api/internal/screen-context turns
                  these into what the AI probes, which is why the heading now says so
                  instead of calling them a breakdown.
                */}
                {(() => {
                  const probes = (icp.sourcing_map.requirement_decomposition ?? [])
                    .filter((r) => r.bucket === 'screen_later' && r.requirement)
                  if (!probes.length) return null
                  return (
                    <div>
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Asked in screening
                      </div>
                      <p className="mb-1.5 text-[11px] text-slate-400">
                        Requirements no profile can prove. They become probes in the AI screen
                        rather than filters.
                      </p>
                      <ul className="space-y-1">
                        {probes.map((r, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-xs text-slate-600">
                            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-300" />
                            <span>{r.requirement}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                })()}

                {/* The inferred "unwritten filters" used to sit here, with a confidence
                    percentage and an exclusion cost. They read as machinery and were
                    not: nothing gated, ranked or screened on them anywhere in the
                    chain. The generator still produces them and they are still on the
                    ICP row, so wiring them up later costs nothing — they are simply no
                    longer shown as if they were doing something. */}

              </div>
            )}
          </section>
        )}

        {/* ── Ideal profile (docs/ideal-profile-plan.md) ── */}
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-600"
            title="Who we are looking for, as filters. This is the one place to edit it: it becomes the first lines of the Search plan on the Source tab, and every candidate is checked against it. Changes reach sourcing when you approve.">
            <ShieldCheck className="h-3.5 w-3.5 text-slate-400" /> Ideal profile
            <span className="ml-auto flex items-center gap-3 text-[10px] font-normal text-slate-400">
              <span className="flex items-center gap-1"><Lock className="h-3 w-3" /> never relaxed</span>
              <span className="flex items-center gap-1"><MoveHorizontal className="h-3 w-3" /> widens later</span>
            </span>
          </div>
          {(() => {
            const profile = gates.filter((g) => isCriterion(g))
            const screening = gates.filter((g) => g.attribute === 'screening')
            const legacy = gates.filter((g) => !isCriterion(g) && g.attribute !== 'screening')
            return (
              <>
                {profile.length === 0 && fromBrief && (
                  // Written before the brief was turned into filters, so every field
                  // would read "not set" beside a brief that names them. Filling it is
                  // free (no AI) and only changes the working copy — approve to use it.
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    <span className="flex-1">
                      This profile was approved before the recruiter brief fed the filters. The brief already
                      names {fromBrief.length} of them — years, titles, companies{fromBrief.some((g) => g.kind === 'location') ? ', location' : ''}.
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        // Old questions the new rows cover go: kept, they only repeat the
                        // profile — and before supersedeLegacyGates they overrode it.
                        const dropped = gates.filter((g) => covered.has(g.id)).length
                        setGates((prev) => [...fromBrief, ...prev.filter((g) => !covered.has(g.id))])
                        setFromBrief(null)
                        setCovered(new Set())
                        toast.success(`Filled from the recruiter brief${dropped ? `, and removed ${dropped} old question${dropped === 1 ? '' : 's'} it covers` : ''} — review, then approve to use it.`)
                      }}
                    >
                      Fill from recruiter brief
                    </Button>
                  </div>
                )}
                {toBets && profile.some((g) => toBets.replaces.includes(g.id)) && (
                  // A profile from before bets: one title row and one company row, so it
                  // reads as "a Strategy Manager at McKinsey" — not the brief's first bet.
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                    <span className="flex-1">
                      This profile predates bets. The brief has {new Set(toBets.rows.map((g) => g.bet)).size} — each a group of
                      companies and the titles searched there (McKinsey for Associates, startups for Strategy Managers).
                      The role&apos;s own titles stay in the brief, used for the wider-location step.
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setGates((prev) => [...prev.filter((g) => !toBets.replaces.includes(g.id)), ...toBets.rows])
                        setToBets(null)
                        toast.success('Organised into bets — review, then approve to use them.')
                      }}
                    >
                      Organise into bets from the brief
                    </Button>
                  </div>
                )}
                {profile.length === 0 && legacy.length === 0 && !fromBrief && (
                  <p className="text-xs text-slate-400">No ideal profile yet — Regenerate to build it from the JD and the recruiter brief.</p>
                )}
                {/* Always shown, so a must-have can be added even to an empty profile. */}
                <IdealProfileTiles
                    criteria={profile.map((g) => toCriterion(g)!)}
                    onChange={(next) =>
                      setGates((prev) => prev.map((g) => {
                        if (g.id !== next.id) return g
                        // Gate results are keyed by label, so keep a hand-written / AI label —
                        // but rebuild one that was auto-made (e.g. a new tile's "Current employer: ").
                        const was = toCriterion(g)
                        const auto = !g.label || (was != null && g.label === criterionLabel(was)) || was?.exclude !== next.exclude
                        return { ...mustHaveFromCriterion(auto ? { ...next, label: null } : next), relax_at: next.relax_at ?? null }
                      }))
                    }
                    onAdd={(c) => setGates((prev) => [...prev, mustHaveFromCriterion({ ...c, label: null })])}
                    onRemove={(id) => setGates((prev) => prev.filter((g) => g.id !== id))}
                  />
                {screening.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Ask the candidate</div>
                    <p className="text-[11px] text-slate-400">Not verifiable from a profile, so never a filter and never a reject.</p>
                    <div className="overflow-hidden rounded-xl border border-dashed border-slate-200 divide-y divide-slate-100">
                      {screening.map((g) => (
                        <div key={g.id} className="flex items-center gap-2 px-3 py-2 text-xs text-slate-600">
                          <span className="flex-1">{g.label}</span>
                          <button type="button" onClick={() => setGates((prev) => prev.filter((x) => x.id !== g.id))} className="text-slate-300 hover:text-red-500" title="Remove">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {legacy.length > 0 && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Older text gates</div>
                      {legacy.some((g) => covered.has(g.id)) && (
                        <button
                          type="button"
                          onClick={() => setGates((prev) => prev.filter((x) => !covered.has(x.id)))}
                          className="ml-auto text-[11px] text-slate-500 underline decoration-slate-300 hover:text-red-600"
                        >
                          Remove the {legacy.filter((g) => covered.has(g.id)).length} the profile covers
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Written before the ideal profile existed. One the profile above already covers is only a
                      screening note — never a filter, never a reject. Any other is still turned into a filter where
                      the text allows. Approve after removing any to save the change.
                    </p>
                    <div className="overflow-hidden rounded-xl border border-slate-200 divide-y divide-slate-100">
                      {legacy.map((g) => (
                        <div key={g.id} className="flex items-center gap-2 px-3 py-2.5">
                          <Input value={g.label} onChange={(e) => setGates((prev) => prev.map((x) => (x.id === g.id ? { ...x, label: e.target.value } : x)))} className="h-8 min-w-[10rem] flex-1 text-sm" />
                          {covered.has(g.id) && (
                            <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500" title="The ideal profile above already does this, so this question no longer filters or rejects anyone.">
                              covered by the profile · not a filter
                            </span>
                          )}
                          <button type="button" onClick={() => setGates((prev) => prev.filter((x) => x.id !== g.id))} className="text-slate-300 hover:text-red-500">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )
          })()}
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

                {/* behaviours — folded by default; the weight row is what most people need */}
                <button type="button" onClick={() => setOpenComps((prev) => { const n = new Set(prev); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n })}
                  className="mt-1 ml-1 text-[11px] text-slate-400 hover:text-slate-600">
                  {openComps.has(c.id) ? '▾' : '▸'} {c.behaviours.filter((b) => b.trim()).length} behaviours
                </button>
                {openComps.has(c.id) && (
                <div className="mt-1 space-y-1.5 pl-1">
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
                )}
              </div>
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={addComp}>
            <Plus className="h-3.5 w-3.5" /> Add competency
          </Button>
        </section>
      </CardContent>

      {/* Component 04 — optional intake notes to fold into a Regenerate. */}
      {showIntake && <div className="border-t border-slate-100 px-6 py-3">{intakeBox}</div>}

      <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-6 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={generate} loading={generating}
            title="Rebuild the ICP from this role from scratch (creates a new draft)">
            <Sparkles className="h-3.5 w-3.5" /> Regenerate
          </Button>
          <button type="button" onClick={() => setShowIntake((s) => !s)}
            className="text-xs font-medium text-slate-400 hover:text-slate-600">
            {showIntake ? '− intake notes' : '+ intake notes'}
          </button>
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
