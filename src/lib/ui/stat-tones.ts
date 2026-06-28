/**
 * Warm tinted treatment for the summary stat / filter cards on the list pages
 * (Jobs, Candidates, Requisitions). Each card gets a soft, on-brand tint matched
 * to its meaning; the selected filter carries an espresso ring.
 *
 * Tones: slate (sand — neutral/total) · amber (honey — waiting) · pine (sage —
 * ready/positive) · gold (clay — live/milestone) · stone (muted — closed/inactive).
 */
export type StatTone = 'slate' | 'amber' | 'pine' | 'gold' | 'stone'

// "Lighter + distinct" warm tints (Variant C) — one notch lighter than the old
// "medium" set, and every tone is a separate hue so no two cards repeat. Still
// saturated enough to read against the cream page (#faf7f2). The neutral tone is
// a warm sand (NOT the page color); 'stone' is a cooler muted neutral for
// closed/inactive so it reads as distinct from 'slate'.
export const STAT_TONE: Record<StatTone, { fill: string; border: string; ink: string; sub: string }> = {
  slate: { fill: 'bg-[#f4eee1]', border: 'border-[#e7dcc6]', ink: 'text-[#2a2118]', sub: 'text-[#7a6f5d]' }, // sand
  amber: { fill: 'bg-[#fbe7bc]', border: 'border-[#f1d595]', ink: 'text-[#6f450f]', sub: 'text-[#8a5a14]' }, // honey
  pine:  { fill: 'bg-[#d9ece1]', border: 'border-[#bedccd]', ink: 'text-[#0c4634]', sub: 'text-[#15604a]' }, // sage
  gold:  { fill: 'bg-[#f7ddc6]', border: 'border-[#eec4a4]', ink: 'text-[#6b3d17]', sub: 'text-[#8a4f18]' }, // clay
  stone: { fill: 'bg-[#eae6dd]', border: 'border-[#d8d2c4]', ink: 'text-[#4f483d]', sub: 'text-[#8a7f6f]' }, // stone
}

/** Full wrapper className for a tinted stat/filter card button. */
export function statTileClass(tone: StatTone, active: boolean): string {
  const t = STAT_TONE[tone]
  return `rounded-xl border p-3.5 text-left transition-all ${t.fill} ${t.border} ${active ? 'ring-1 ring-[#221b14]' : ''}`
}
