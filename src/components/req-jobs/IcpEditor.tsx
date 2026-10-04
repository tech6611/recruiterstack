'use client'

import { useEffect, useState } from 'react'
import { Trash2, Save, Sparkles, ShieldCheck, CheckCircle2, Target, RefreshCw, Library, BookmarkPlus, Lock, MoveHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { ScoringCriterion } from '@/lib/types/database'
import type { Icp, IcpCompetency, IcpMustHave } from '@/lib/types/icp'
import type { SearchCriterion } from '@/lib/types/search-spec'
import { icpToScoringCriteria } from '@/lib/scoring'
import { BriefGlance } from '@/components/req-jobs/BriefGlance'
import { BriefChat } from '@/components/req-jobs/BriefChat'
import type { BriefChatMessage, BriefChatReply } from '@/lib/ai/brief-chat'
import { CompetencyWeights } from '@/components/req-jobs/CompetencyWeights'
import { isCriterion, toCriterion, mustHaveFromCriterion, criterionLabel, isBetOverride, betProfile, saveBetRow, removeBetRow, moveBet } from '@/lib/icp-gates'
import { IdealProfileTiles, BetProfile } from '@/components/req-jobs/IdealProfileTiles'
import { BetCards, BetsPanel, BetSplitRow } from '@/components/req-jobs/BetCards'
import { BetSampleCard, liveBetSampleClient } from '@/components/req-jobs/BetSampleCard'



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
  // Phase 1 (niche recruiter) — the recruiter's corrections to the brief, now written by
  // talking to it (BriefChat); house knowledge fed into every Regenerate.
  const [savingCorrections, setSavingCorrections] = useState(false)

  function loadTemplates() {
    fetch('/api/role-templates')
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => setTemplates((j.data ?? []).map((t: { id: string; name: string }) => ({ id: t.id, name: t.name }))))
      .catch(() => {})
  }

  /** Save one edited profile row (a tile, or a bet card's At / As line). */
  function updateGate(next: SearchCriterion) {
    setGates((prev) => prev.map((g) => {
      if (g.id !== next.id) return g
      // Gate results are keyed by label, so keep a hand-written / AI label —
      // but rebuild one that was auto-made (e.g. a new tile's "Current employer: ").
      const was = toCriterion(g)
      const auto = !g.label || (was != null && g.label === criterionLabel(was)) || was?.exclude !== next.exclude
      return { ...mustHaveFromCriterion(auto ? { ...next, label: null } : next), relax_at: next.relax_at ?? null }
    }))
  }

  const [sampleClient] = useState(() => liveBetSampleClient(jobId))
  const saveForBet = (bet: number, betLabel: string, next: SearchCriterion, allBets: boolean) =>
    setGates((prev) => saveBetRow(prev, bet, betLabel, next, allBets))
  const removeForBet = (c: SearchCriterion) => setGates((prev) => removeBetRow(prev, c))

  const total = comps.reduce((s, c) => s + (c.weight || 0), 0)
  const canApprove = comps.some((c) => c.name.trim()) && total === 100

  function hydrate(next: Icp) {
    setIcp(next)
    setComps(next.competencies ?? [])
    setGates(next.must_haves ?? [])
  }

  /** One turn of the brief chat: what the AI understood + the notes rewritten. Saves nothing. */
  async function askBrief(messages: BriefChatMessage[]): Promise<BriefChatReply> {
    const res = await fetch(`/api/jobs/${jobId}/icp/brief-chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(j.error ?? 'Could not reach the AI')
    return j.data as BriefChatReply
  }

  /** Save the chat's notes as the brief's corrections (allowed on any status — house
   *  knowledge, not an edit to gates or weights), then rebuild the profile from them. */
  async function applyBriefNotes(notes: string): Promise<boolean> {
    if (!icp) return false
    setSavingCorrections(true)
    const res = await fetch(`/api/jobs/${jobId}/icp/${icp.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recruiter_corrections: notes }),
    })
    setSavingCorrections(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      toast.error(j.error ?? 'Could not save your notes')
      return false
    }
    return generate()
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

  async function generate(): Promise<boolean> {
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
      return false
    }
    const { data } = await res.json()
    hydrate(data as Icp)
    toast.success('Draft ICP generated from this role — review and approve.')
    return true
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
  // Organised into bets: each bet shows its own profile under its card, so the shared
  // rows are edited there and the single profile list below is not shown.
  const organised = gates.some((g) => isCriterion(g) && g.bet != null && !isBetOverride(g))
  // How many bet cards show: one per archetype, or per bet when there are more bets.
  const betCount = Math.max(new Set(gates.filter((g) => g.bet != null).map((g) => g.bet)).size, icp.sourcing_map?.archetypes?.length ?? 0)

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

      <CardContent className="space-y-4">
        {/* ── Part 1: the recruiter brief at a glance, the scoring weights at its foot. ── */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          {icp.sourcing_map && (
            <BriefGlance
              brief={icp.sourcing_map.recruiter_brief ?? null}
              reasoning={icp.sourcing_map.reasoning}
              reasoningShort={icp.sourcing_map.reasoning_short}
              // ONLY the screen_later rows: /api/internal/screen-context turns these into
              // what the AI screen probes. The other two buckets were never read by any
              // route, query or scorer, so they are not shown as if they filtered.
              probes={(icp.sourcing_map.requirement_decomposition ?? []).filter((r) => r.bucket === 'screen_later' && r.requirement)}
              editor={(close) => (
                <BriefChat
                  notes={icp.sourcing_map?.recruiter_brief?.corrections ?? ''}
                  ask={askBrief}
                  onApply={applyBriefNotes}
                  applying={savingCorrections || generating}
                  onClose={close}
                />
              )}
            />
          )}
          <div className={icp.sourcing_map ? 'mt-4 border-t border-slate-100 pt-4' : ''}>
            <CompetencyWeights
              comps={comps}
              total={total}
              onName={(i, name) => setComp(i, { name })}
              onWeight={setWeight}
              onRemove={removeComp}
              onAdd={addComp}
              onBehaviour={setBehaviour}
              onAddBehaviour={addBehaviour}
              onRemoveBehaviour={removeBehaviour}
            />
          </div>
        </section>

        {/* ── Part 2: the bets the brief gives birth to — each bet and the person it
            finds in ONE card, all inside the Bets card. ── */}
        {icp.sourcing_map && ((icp.sourcing_map.archetypes?.length ?? 0) > 0 || gates.some((g) => g.bet != null)) && (
          <BetsPanel count={betCount}>
            <BetCards
              archetypes={icp.sourcing_map.archetypes ?? []}
              brief={icp.sourcing_map.recruiter_brief}
              bets={gates.filter((g) => isCriterion(g) && g.bet != null).map((g) => toCriterion(g)!)}
              onChange={updateGate}
              onRemoveBet={(ids) => setGates((prev) => prev.filter((g) => !ids.includes(g.id)))}
              onAddRow={(row) => setGates((prev) => [...prev.filter((g) => g.id !== row.id), mustHaveFromCriterion({ ...row, label: null })])}
              onSuggestTitles={async (n, label, rows) => {
                const res = await fetch(`/api/jobs/${jobId}/bets/suggest-titles`, {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ bet: n, bet_label: label, criteria: rows }),
                })
                const j = await res.json().catch(() => ({}))
                if (!res.ok) throw new Error(j.error ?? 'Could not suggest titles')
                return j.data
              }}
              renderRow={(row) => <BetSplitRow row={row} />}
              onMoveBet={(n, step) => setGates((prev) => moveBet(prev, n, step))}
              {...(organised ? {
                renderProfile: (n: number, label: string) => (
                  <BetProfile
                    bet={n}
                    criteria={betProfile(gates.filter(isCriterion).map((g) => toCriterion(g)!), n)}
                    onSave={(next, all) => saveForBet(n, label, next, all)}
                    onRemove={removeForBet}
                  />
                ),
                renderCandidate: (n: number, label: string) => {
                  const all = gates.filter(isCriterion).map((g) => toCriterion(g)!)
                  return (
                    <BetSampleCard
                      bare
                      client={sampleClient}
                      bet={n}
                      betLabel={label}
                      icpId={icp.id}
                      criteria={[...all.filter((c) => c.bet === n && !isBetOverride(c)), ...betProfile(all, n)]}
                    />
                  )
                },
              } : {})}
            />
          </BetsPanel>
        )}

        {/* ── Ideal profile (docs/ideal-profile-plan.md) ── */}
        <section className="space-y-2">
          {!organised && <div className="flex items-center gap-2 text-xs font-semibold text-slate-600"
            title="Who we are looking for, as filters. This is the one place to edit it: it becomes the first lines of the Search plan on the Source tab, and every candidate is checked against it. Changes reach sourcing when you approve.">
            <ShieldCheck className="h-3.5 w-3.5 text-slate-400" /> Ideal profile
            <span className="ml-auto flex items-center gap-3 text-[10px] font-normal text-slate-400">
              <span className="flex items-center gap-1"><Lock className="h-3 w-3" /> never relaxed</span>
              <span className="flex items-center gap-1"><MoveHorizontal className="h-3 w-3" /> widens later</span>
            </span>
          </div>}
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
                        const dropped = gates.filter((g) => !isCriterion(g)).length
                        setGates((prev) => [...fromBrief, ...prev.filter((g) => isCriterion(g))])
                        setFromBrief(null)
                        setCovered(new Set())
                        toast.success(`Filled from the recruiter brief${dropped ? ` and removed ${dropped} old text question${dropped === 1 ? '' : 's'}` : ''} — review, then approve to use it.`)
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
                        // Old text questions go too: the bets and shared rows do their job,
                        // and they filtered, rejected and screened nobody.
                        const dropped = gates.filter((g) => !isCriterion(g)).length
                        setGates((prev) => [...prev.filter((g) => isCriterion(g) && !toBets.replaces.includes(g.id)), ...toBets.rows])
                        setToBets(null)
                        setCovered(new Set())
                        toast.success(`Organised into bets${dropped ? ` and removed ${dropped} old text question${dropped === 1 ? '' : 's'}` : ''} — review, then approve to use them.`)
                      }}
                    >
                      Organise into bets from the brief
                    </Button>
                  </div>
                )}
                {profile.length === 0 && legacy.length === 0 && !fromBrief && (
                  <p className="text-xs text-slate-400">No ideal profile yet — Regenerate to build it from the JD and the recruiter brief.</p>
                )}
                {/* Always shown (unless each bet shows its own), so a must-have can be added even to an empty profile. */}
                {!organised && <IdealProfileTiles
                    criteria={profile.map((g) => toCriterion(g)!)}
                    onChange={updateGate}
                    onAdd={(c) => setGates((prev) => [...prev, mustHaveFromCriterion({ ...c, label: null })])}
                    onRemove={(id) => setGates((prev) => prev.filter((g) => g.id !== id))}
                  />}
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
                      <button
                        type="button"
                        onClick={() => setGates((prev) => prev.filter((x) => !legacy.some((g) => g.id === x.id)))}
                        className="ml-auto text-[11px] text-slate-500 underline decoration-slate-300 hover:text-red-600"
                      >
                        Remove all {legacy.length}
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Yes/no questions written before the ideal profile existed. One tagged &ldquo;covered&rdquo; filters and
                      rejects no one — the profile does its job. Any other is still turned into a filter where the text
                      allows. The AI phone screen does not ask them. Remove them, then approve to save.
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

