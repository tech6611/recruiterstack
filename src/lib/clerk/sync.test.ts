import { describe, it, expect, vi, afterEach } from 'vitest'
import { decideSyncAction, clerkUserExists } from './sync'

describe('decideSyncAction — same email, different login', () => {
  it('relinks only when the old login is confirmed gone', () => {
    expect(decideSyncAction(false)).toBe('relink')
  })
  it('inserts a separate row when the old login still exists or the lookup is unknown', () => {
    expect(decideSyncAction(true)).toBe('insert')
    expect(decideSyncAction(null)).toBe('insert')
  })
})

describe('clerkUserExists', () => {
  const realFetch = global.fetch
  afterEach(() => { global.fetch = realFetch; delete process.env.CLERK_SECRET_KEY })
  it('maps 404 → false, 200 → true, other/failed → null', async () => {
    process.env.CLERK_SECRET_KEY = 'sk_test_x'
    global.fetch = vi.fn(async () => ({ status: 404, ok: false })) as unknown as typeof fetch
    expect(await clerkUserExists('user_old')).toBe(false)
    global.fetch = vi.fn(async () => ({ status: 200, ok: true })) as unknown as typeof fetch
    expect(await clerkUserExists('user_live')).toBe(true)
    global.fetch = vi.fn(async () => ({ status: 500, ok: false })) as unknown as typeof fetch
    expect(await clerkUserExists('user_x')).toBeNull()
    global.fetch = vi.fn(async () => { throw new Error('offline') }) as unknown as typeof fetch
    expect(await clerkUserExists('user_x')).toBeNull()
  })
  it('returns null (never relinks) without a secret key', async () => {
    expect(await clerkUserExists('user_x')).toBeNull()
  })
})
