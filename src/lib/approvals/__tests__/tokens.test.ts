import { describe, it, expect, beforeEach } from 'vitest'
import { mintStepTokens, resolveStepToken, consumeStepToken } from '../tokens'

/**
 * Stateful in-memory fake for the single `approval_step_access_tokens` table.
 * It actually stores rows and honors eq/is/gt filters + insert/update, so the
 * one-time-consume and expiry semantics are exercised for real (not just
 * canned return values).
 */
function makeStore() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = []

  function from() {
    const filters: Array<[string, string, unknown]> = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let op: 'select' | 'insert' | 'update' = 'select'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let updateValues: any = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {}

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    b.insert = (payload: any) => {
      op = 'insert'
      const arr = Array.isArray(payload) ? payload : [payload]
      for (const r of arr) rows.push({ used_at: null, ...r })
      return b
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    b.update = (vals: any) => { op = 'update'; updateValues = vals; return b }
    b.select = () => b
    b.eq = (col: string, val: unknown) => { filters.push(['eq', col, val]); return b }
    b.is = (col: string, val: unknown) => { filters.push(['is', col, val]); return b }
    b.gt = (col: string, val: unknown) => { filters.push(['gt', col, val]); return b }
    b.maybeSingle = () => b

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function matches(r: any): boolean {
      return filters.every(([f, col, val]) => {
        if (f === 'eq' || f === 'is') return r[col] === val
        if (f === 'gt') return new Date(r[col]).getTime() > new Date(val as string).getTime()
        return true
      })
    }
    function execute() {
      if (op === 'insert') return { data: null, error: null }
      const matched = rows.filter(matches)
      if (op === 'update') {
        for (const r of matched) Object.assign(r, updateValues)
        return { data: matched[0] ?? null, error: null }
      }
      return { data: matched[0] ?? null, error: null }
    }
    b.then = (resolve: (v: unknown) => void) => {
      const r = execute()
      resolve(r)
      return Promise.resolve(r)
    }
    return b
  }

  return { client: { from: () => from() }, rows }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asClient = (c: unknown) => c as any

const BASE = { orgId: 'org1', approvalId: 'appr1', stepId: 'step1' }

describe('mintStepTokens', () => {
  it('mints one token per approver and returns a user→token map', async () => {
    const store = makeStore()
    const map = await mintStepTokens(asClient(store.client), { ...BASE, userIds: ['u1', 'u2'] })
    expect(Object.keys(map)).toEqual(['u1', 'u2'])
    expect(map.u1).toMatch(/^[0-9a-f]{64}$/)
    expect(map.u2).not.toBe(map.u1)
    expect(store.rows).toHaveLength(2)
  })

  it('dedupes user ids and skips an empty list without inserting', async () => {
    const store = makeStore()
    expect(await mintStepTokens(asClient(store.client), { ...BASE, userIds: [] })).toEqual({})
    expect(store.rows).toHaveLength(0)

    const map = await mintStepTokens(asClient(store.client), { ...BASE, userIds: ['u1', 'u1'] })
    expect(Object.keys(map)).toEqual(['u1'])
    expect(store.rows).toHaveLength(1)
  })
})

describe('resolveStepToken', () => {
  let store: ReturnType<typeof makeStore>
  let token: string
  beforeEach(async () => {
    store = makeStore()
    const map = await mintStepTokens(asClient(store.client), { ...BASE, userIds: ['u1'] })
    token = map.u1
  })

  it('returns the bound identity, unexpired and unused', async () => {
    const r = await resolveStepToken(asClient(store.client), token)
    expect(r).toMatchObject({ orgId: 'org1', approvalId: 'appr1', stepId: 'step1', userId: 'u1', expired: false, used: false })
  })

  it('returns null for an unknown token', async () => {
    expect(await resolveStepToken(asClient(store.client), 'nope')).toBeNull()
  })

  it('reports expired when the TTL has passed', async () => {
    store.rows[0].expires_at = new Date(Date.now() - 1000).toISOString()
    const r = await resolveStepToken(asClient(store.client), token)
    expect(r?.expired).toBe(true)
  })
})

describe('consumeStepToken', () => {
  let store: ReturnType<typeof makeStore>
  let token: string
  beforeEach(async () => {
    store = makeStore()
    const map = await mintStepTokens(asClient(store.client), { ...BASE, userIds: ['u1'] })
    token = map.u1
  })

  it('spends the token once and returns its bound identity', async () => {
    const first = await consumeStepToken(asClient(store.client), token)
    expect(first).toEqual({ orgId: 'org1', approvalId: 'appr1', stepId: 'step1', userId: 'u1' })
  })

  it('returns null on a second (replayed) consume — one-time use', async () => {
    await consumeStepToken(asClient(store.client), token)
    expect(await consumeStepToken(asClient(store.client), token)).toBeNull()
    // And resolve now reports it used.
    expect((await resolveStepToken(asClient(store.client), token))?.used).toBe(true)
  })

  it('refuses to consume an expired token', async () => {
    store.rows[0].expires_at = new Date(Date.now() - 1000).toISOString()
    expect(await consumeStepToken(asClient(store.client), token)).toBeNull()
    expect(store.rows[0].used_at).toBeNull()
  })
})
