'use client'

import { useState } from 'react'
import { Plus, Trash2, Save, SlidersHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { ScoringCriterion } from '@/lib/types/database'
import { DEFAULT_SCORING_CRITERIA } from '@/lib/scoring'

/**
 * Set the weighted scoring rubric the AI grades candidates against. A deliberate
 * setup step (like the interview plan) — nothing is applied by default; a job
 * scores holistically until a rubric is saved here. Editable any time.
 */
export function ScoringTab({ jobId, initialCriteria, onSaved }: {
  jobId: string
  initialCriteria: ScoringCriterion[]
  onSaved: (criteria: ScoringCriterion[]) => void
}) {
  const [items, setItems] = useState<ScoringCriterion[]>(initialCriteria)
  const [saving, setSaving] = useState(false)
  const hadRubric = initialCriteria.length > 0

  const total = items.reduce((s, c) => s + (c.weight || 0), 0)

  const setWeight = (i: number, w: number) =>
    setItems(prev => prev.map((x, j) => (j === i ? { ...x, weight: Math.max(0, Math.min(100, w)) } : x)))
  const setName = (i: number, name: string) =>
    setItems(prev => prev.map((x, j) => (j === i ? { ...x, name } : x)))
  const remove = (i: number) => setItems(prev => prev.filter((_, j) => j !== i))
  const add = () => setItems(prev => [...prev, { id: `c-${prev.length}-${Date.now()}`, name: '', weight: 0, description: '' }])
  const loadDefault = () => setItems(DEFAULT_SCORING_CRITERIA.map(c => ({ ...c })))

  const save = async () => {
    const valid = items.filter(c => c.name.trim())
    if (valid.length === 0) { toast.error('Add at least one criterion'); return }
    if (total !== 100) { toast.error(`Weights must sum to 100% (currently ${total}%)`); return }
    setSaving(true)
    const res = await fetch(`/api/req-jobs/${jobId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ custom_fields: { scoring_criteria: valid } }),
    })
    setSaving(false)
    if (!res.ok) { const j = await res.json().catch(() => ({})); toast.error(j.error ?? 'Save failed'); return }
    toast.success('Scoring rubric saved.')
    onSaved(valid)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <SlidersHorizontal className="h-4 w-4 text-slate-500" /> Scoring rubric
        </CardTitle>
        <CardDescription>
          The weighted criteria the AI scores each candidate against — weights must total 100%.
          {!hadRubric && ' No rubric set yet: until you add one, candidates are scored holistically, with no per-criterion breakdown.'}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center">
            <p className="text-sm text-slate-500">No scoring criteria yet.</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <Button size="sm" variant="outline" onClick={loadDefault}>Use the standard template</Button>
              <Button size="sm" variant="outline" onClick={add}><Plus className="h-3.5 w-3.5" /> Add criterion</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-xl border border-slate-200 divide-y divide-slate-100">
              {items.map((c, i) => (
                <div key={c.id} className="flex items-center gap-2 px-3 py-2.5">
                  <Input
                    value={c.name}
                    onChange={e => setName(i, e.target.value)}
                    placeholder="Criterion name"
                    className="h-8 flex-1 text-sm"
                  />
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" onClick={() => setWeight(i, (c.weight || 0) - 5)}
                      className="h-6 w-6 rounded font-bold text-slate-400 hover:bg-slate-100 hover:text-slate-700">−</button>
                    <input
                      type="number" min={0} max={100} value={c.weight}
                      onChange={e => setWeight(i, parseInt(e.target.value) || 0)}
                      className={`h-8 w-12 rounded border text-center text-xs font-semibold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none ${total === 100 ? 'border-slate-200 text-slate-700' : 'border-amber-300 text-amber-600'}`}
                    />
                    <span className={`text-xs font-semibold ${total === 100 ? 'text-slate-500' : 'text-amber-600'}`}>%</span>
                    <button type="button" onClick={() => setWeight(i, (c.weight || 0) + 5)}
                      className="h-6 w-6 rounded font-bold text-slate-400 hover:bg-slate-100 hover:text-slate-700">+</button>
                  </div>
                  <button type="button" onClick={() => remove(i)} className="text-slate-300 hover:text-red-500">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between">
              <Button size="sm" variant="outline" onClick={add}><Plus className="h-3.5 w-3.5" /> Add criterion</Button>
              <span className={`text-xs font-semibold ${total === 100 ? 'text-emerald-600' : 'text-amber-600'}`}>
                Total: {total}%{total === 100 ? ' ✓' : ' — must equal 100%'}
              </span>
            </div>
          </>
        )}
      </CardContent>

      {items.length > 0 && (
        <div className="flex justify-end border-t border-slate-100 px-6 py-3">
          <Button size="sm" onClick={save} loading={saving} disabled={total !== 100}>
            <Save className="h-3.5 w-3.5" /> Save rubric
          </Button>
        </div>
      )}
    </Card>
  )
}
