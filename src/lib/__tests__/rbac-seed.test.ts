import { describe, it, expect } from 'vitest'
import { ensureSystemRoles } from '@/lib/rbac'

/**
 * Minimal stateful fake of the Supabase client covering exactly the chains
 * ensureSystemRoles uses against rbac_roles / rbac_role_capabilities:
 *   - select('name'|'id').eq(...).eq(...)[.maybeSingle()]   (awaited or single)
 *   - upsert(payload, { onConflict, ignoreDuplicates })      (insert-if-absent)
 * Keeps rows in memory so a second call exercises the idempotent short-circuit.
 */
type Role = { id: string; org_id: string; name: string; is_system: boolean; is_owner: boolean }
type Cap = { role_id: string; capability: string }

function makeDb(initialRoles: Role[] = []) {
  const roles = [...initialRoles]
  const caps: Cap[] = []
  let idc = 1

  function matches<T extends Record<string, unknown>>(row: T, filters: Record<string, unknown>) {
    return Object.entries(filters).every(([k, v]) => row[k] === v)
  }

  function rolesBuilder() {
    const filters: Record<string, unknown> = {}
    const b: Record<string, unknown> = {
      select: () => b,
      eq: (col: string, val: unknown) => { filters[col] = val; return b },
      upsert: (payload: Record<string, unknown> | Record<string, unknown>[]) => {
        const arr = Array.isArray(payload) ? payload : [payload]
        for (const p of arr) {
          if (!roles.find(r => r.org_id === p.org_id && r.name === p.name)) {
            roles.push({ id: `role-${idc++}`, ...(p as Omit<Role, 'id'>) })
          }
        }
        return b
      },
      maybeSingle: () => {
        const m = roles.find(r => matches(r, filters))
        return Promise.resolve({ data: m ? { id: m.id } : null, error: null })
      },
      then: (resolve: (v: unknown) => void) => {
        const r = { data: roles.filter(x => matches(x, filters)), error: null }
        resolve(r)
        return Promise.resolve(r)
      },
    }
    return b
  }

  function capsBuilder() {
    const b: Record<string, unknown> = {
      upsert: (payload: Cap | Cap[]) => {
        const arr = Array.isArray(payload) ? payload : [payload]
        for (const p of arr) {
          if (!caps.find(c => c.role_id === p.role_id && c.capability === p.capability)) caps.push(p)
        }
        return b
      },
      then: (resolve: (v: unknown) => void) => { const r = { data: null, error: null }; resolve(r); return Promise.resolve(r) },
    }
    return b
  }

  const client = {
    from: (t: string) => (t === 'rbac_roles' ? rolesBuilder() : t === 'rbac_role_capabilities' ? capsBuilder() : (() => { throw new Error(`unexpected table ${t}`) })()),
  }
  return { client, roles, caps }
}

describe('ensureSystemRoles', () => {
  it('seeds the three system roles with correct owner flag + capabilities for a fresh org', async () => {
    const db = makeDb()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ensureSystemRoles(db.client as any, 'org_new')

    const byName = Object.fromEntries(db.roles.map(r => [r.name, r]))
    expect(Object.keys(byName).sort()).toEqual(['Hiring Manager', 'Owner', 'Recruiter'])
    expect(byName['Owner'].is_owner).toBe(true)
    expect(byName['Recruiter'].is_owner).toBe(false)
    expect(byName['Hiring Manager'].is_owner).toBe(false)
    db.roles.forEach(r => expect(r.is_system).toBe(true))

    const capsFor = (name: string) => db.caps.filter(c => c.role_id === byName[name].id).map(c => c.capability).sort()
    // Owner needs no capability rows — the resolver grants owners everything.
    expect(capsFor('Owner')).toEqual([])
    expect(capsFor('Recruiter')).toEqual(['analytics:view', 'openings:edit', 'openings:view', 'recruiting:edit', 'recruiting:view'])
    expect(capsFor('Hiring Manager')).toEqual(['approvals:approve', 'approvals:view', 'openings:approve', 'openings:view'])
  })

  it('is idempotent: a second run adds no duplicate roles or capabilities', async () => {
    const db = makeDb()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ensureSystemRoles(db.client as any, 'org_new')
    const rolesAfterFirst = db.roles.length
    const capsAfterFirst = db.caps.length

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ensureSystemRoles(db.client as any, 'org_new')
    expect(db.roles.length).toBe(rolesAfterFirst)
    expect(db.caps.length).toBe(capsAfterFirst)
  })
})
