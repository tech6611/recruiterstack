/**
 * Shared helpers for reading experience gates off an ICP. Used by the ICP generator
 * (to build the band gate), the Crustdata search plan (to send it as filters) and the
 * Fit Engine (to enforce it deterministically). PURE + tested.
 */
import type { IcpMustHave } from '@/lib/types/icp'

/** The attribute a structured experience-band gate carries: value = [min, max] years. */
export const EXPERIENCE_BAND_ATTRIBUTE = 'experience_band'
export const EXPERIENCE_BAND_GATE_ID = 'g-band'

/** A years floor from a plain-sentence gate ("at least 2 full years…", "5+ years"). */
export function yearsFloorFromLabel(label: string): number | null {
  if (!/\b(?:years?|yrs)\b/i.test(label)) return null
  const m = label.match(/(\d+(?:\.\d+)?)\s*\+?\s*(?:full[- ]?time\s+|full\s+)?(?:years?|yrs)/i)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 && n < 60 ? n : null
}

export interface ExperienceBand {
  min: number | null
  max: number | null
}

/** Read the [min, max] band off a structured experience_band gate, if that's what it is. */
export function experienceBandFromGate(g: Pick<IcpMustHave, 'attribute' | 'value'>): ExperienceBand | null {
  if ((g.attribute ?? '').toLowerCase() !== EXPERIENCE_BAND_ATTRIBUTE) return null
  const v = Array.isArray(g.value) ? g.value : typeof g.value === 'string' ? g.value.split(/[-–,]/) : [g.value]
  const num = (x: unknown) => {
    const t = String(x ?? '').trim()
    if (!t) return null
    const n = Number(t)
    return Number.isFinite(n) && n >= 0 && n < 80 ? n : null
  }
  const min = num(v[0])
  const max = num(v[1])
  if (min == null && max == null) return null
  return { min, max }
}

/** Build the structured band gate the ICP carries. Label is the plain question the judge reads. */
export function experienceBandGate(min: number | null, max: number | null): IcpMustHave | null {
  if (min == null && max == null) return null
  const label =
    min != null && max != null
      ? `Has between ${min} and ${max} years of professional experience — not over-senior for this role?`
      : min != null
        ? `Has at least ${min} years of professional experience?`
        : `Has no more than ${max} years of professional experience — not over-senior for this role?`
  return { id: EXPERIENCE_BAND_GATE_ID, label, attribute: EXPERIENCE_BAND_ATTRIBUTE, operator: 'between', value: [String(min ?? ''), String(max ?? '')] }
}
