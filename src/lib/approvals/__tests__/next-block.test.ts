import { describe, it, expect } from 'vitest'

// nextBlock isn't exported (it's a private helper in engine.ts) but we test
// equivalent behavior here against an inlined copy. Keeping the helper internal
// avoids exposing engine internals.
function nextBlock<T extends { id: string; step_index: number; status: string; parallel_group_id: string | null; activated_at: string | null }>(
  steps: T[],
): T[] {
  const candidates = steps
    .filter(s => s.status === 'pending' && s.activated_at == null)
    .sort((a, b) => a.step_index - b.step_index)
  if (candidates.length === 0) return []
  const head = candidates[0]
  if (head.parallel_group_id == null) return [head]
  return candidates.filter(s => s.parallel_group_id === head.parallel_group_id)
}

const make = (id: string, step_index: number, opts: Partial<{ status: string; parallel_group_id: string | null; activated_at: string | null }> = {}) => ({
  id, step_index,
  status:        opts.status        ?? 'pending',
  parallel_group_id: opts.parallel_group_id ?? null,
  activated_at:  opts.activated_at  ?? null,
})

describe('nextBlock', () => {
  it('returns empty when no pending+inactive steps', () => {
    const steps = [make('a', 0, { status: 'approved', activated_at: '2026-01-01' })]
    expect(nextBlock(steps)).toEqual([])
  })

  it('returns a single step for sequential steps', () => {
    const steps = [
      make('a', 0, { status: 'approved', activated_at: '2026-01-01' }),
      make('b', 1),
      make('c', 2),
    ]
    expect(nextBlock(steps).map(s => s.id)).toEqual(['b'])
  })

  it('groups together steps with the same parallel_group_id', () => {
    const steps = [
      make('a', 0, { parallel_group_id: 'g1' }),
      make('b', 1, { parallel_group_id: 'g1' }),
      make('c', 2),
    ]
    expect(nextBlock(steps).map(s => s.id).sort()).toEqual(['a', 'b'])
  })

  it('includes all parallel siblings even if non-consecutive in step_index', () => {
    const steps = [
      make('a', 0, { parallel_group_id: 'g1' }),
      make('b', 1),                         // singleton in between (shouldn't really happen but be defensive)
      make('c', 2, { parallel_group_id: 'g1' }),
    ]
    expect(nextBlock(steps).map(s => s.id).sort()).toEqual(['a', 'c'])
  })

  it('skips not_applicable steps when finding the head', () => {
    const steps = [
      make('a', 0, { status: 'not_applicable', activated_at: null }),
      make('b', 1, { parallel_group_id: 'g2' }),
      make('c', 2, { parallel_group_id: 'g2' }),
    ]
    expect(nextBlock(steps).map(s => s.id).sort()).toEqual(['b', 'c'])
  })

  it('returns empty when all steps are activated (mid-block)', () => {
    const steps = [
      make('a', 0, { activated_at: '2026-01-01' }),
      make('b', 1, { activated_at: '2026-01-01' }),
    ]
    // both are mid-flight, none waiting to be activated
    expect(nextBlock(steps)).toEqual([])
  })
})
