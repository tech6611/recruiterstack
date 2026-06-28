'use client'

// Shared screening-question renderer + conditional-visibility logic.
//
// This is the single source of truth for how a candidate-facing screening
// question looks and behaves. Both the live public application page
// (`app/apply/[token]/page.tsx`) and the in-app branded preview
// (`components/apply/BrandedApplyPreview.tsx`) import from here, so the preview
// can never drift from what a real candidate actually sees.
import type {
  ScreeningFieldType,
  ScreeningOperator,
  ScreeningVisibility,
} from '@/lib/types/database'

export type { ScreeningFieldType, ScreeningOperator, ScreeningVisibility }

// The public-safe shape of a screening field — no knockout/scoring internals,
// only what's needed to render the question to a candidate.
export interface PublicScreeningField {
  id: string
  label: string
  help_text: string | null
  field_type: ScreeningFieldType
  options: string[]
  required: boolean
  is_eeo: boolean
  visible_when: ScreeningVisibility | null
}

export type AnswerValue = string | string[]

// Mirror of the server-side rule check (modules/ats/domain/screening.ts) so the
// form can show/hide conditional questions live as the candidate answers.
export function answerMatches(answer: AnswerValue | undefined, rule: ScreeningVisibility): boolean {
  const answerSet = Array.isArray(answer) ? answer : answer == null || answer === '' ? [] : [answer]
  const ruleSet = Array.isArray(rule.value) ? rule.value : [rule.value]
  switch (rule.operator) {
    case 'eq':     return answerSet.length === 1 && answerSet[0] === ruleSet[0]
    case 'neq':    return !(answerSet.length === 1 && answerSet[0] === ruleSet[0])
    case 'in':     return answerSet.some(a => ruleSet.includes(a))
    case 'not_in': return !answerSet.some(a => ruleSet.includes(a))
    default:       return false
  }
}

export function isFieldVisible(
  field: { visible_when: ScreeningVisibility | null },
  answers: Record<string, AnswerValue>,
): boolean {
  if (!field.visible_when) return true
  return answerMatches(answers[field.visible_when.field_id], field.visible_when)
}

export const FIELD_INPUT_CLASS =
  'w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent'

export function ScreeningQuestion({
  field, value, onChange,
}: { field: PublicScreeningField; value: AnswerValue | undefined; onChange: (v: AnswerValue) => void }) {
  const str = typeof value === 'string' ? value : ''
  const arr = Array.isArray(value) ? value : []

  function renderInput() {
    switch (field.field_type) {
      case 'long_text':
        return <textarea rows={4} value={str} onChange={e => onChange(e.target.value)} className={`${FIELD_INPUT_CLASS} resize-none`} />
      case 'number':
        return <input type="number" value={str} onChange={e => onChange(e.target.value)} className={FIELD_INPUT_CLASS} />
      case 'date':
        return <input type="date" value={str} onChange={e => onChange(e.target.value)} className={FIELD_INPUT_CLASS} />
      case 'url':
        return <input type="url" value={str} onChange={e => onChange(e.target.value)} placeholder="https://…" className={FIELD_INPUT_CLASS} />
      case 'file':
        return <input type="url" value={str} onChange={e => onChange(e.target.value)} placeholder="Paste a link to your file (Drive, Dropbox…)" className={FIELD_INPUT_CLASS} />
      case 'yes_no':
        return (
          <div className="flex gap-5">
            {['yes', 'no'].map(opt => (
              <label key={opt} className="inline-flex items-center gap-1.5 text-sm capitalize text-slate-700">
                <input type="radio" name={field.id} checked={str === opt} onChange={() => onChange(opt)} />
                {opt}
              </label>
            ))}
          </div>
        )
      case 'single_select':
        return (
          <select value={str} onChange={e => onChange(e.target.value)} className={FIELD_INPUT_CLASS}>
            <option value="">Select…</option>
            {field.options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        )
      case 'multi_select':
        return (
          <div className="space-y-1.5">
            {field.options.map(o => (
              <label key={o} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={arr.includes(o)}
                  onChange={e => onChange(e.target.checked ? [...arr, o] : arr.filter(x => x !== o))}
                />
                {o}
              </label>
            ))}
          </div>
        )
      default: // short_text
        return <input type="text" value={str} onChange={e => onChange(e.target.value)} className={FIELD_INPUT_CLASS} />
    }
  }

  return (
    <div>
      <label className="block text-sm font-semibold text-slate-700 mb-1.5">
        {field.label}
        {field.required && <span className="text-red-500"> *</span>}
        {field.is_eeo && <span className="ml-2 text-xs font-normal text-slate-400">(voluntary)</span>}
      </label>
      {field.help_text && <p className="text-xs text-slate-400 mb-1.5">{field.help_text}</p>}
      {renderInput()}
    </div>
  )
}
