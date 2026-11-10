import { describe, it, expect } from 'vitest'
import { syncMemberRbacRole } from '@/lib/rbac'

/**
 * In-memory fake of the Supabase chains syncMemberRbacRole (and the
 * ensureSystemRoles it calls) use: select/eq/in, maybeSingle, upsert, delete.
 * System roles are pre-seeded so ensureSystemRoles short-circuits.
 */
type Row = Record<string, unknown>

function makeDb(memberRoles: Row[]) {
  const tables: Record<string, Row[]> = {
    rbac_roles: [
      { id: 'owner', org_id: 'o1', name: 'Owner', is_system: true, is_owner: true },
      { id: 'rec', org_id: 'o1', name: 'Recruiter', is_system: true, is_owner: false },
      { id: 'hm', org_id: 'o1', name: 'Hiring Manager', is_system: true, is_owner: false },
      { id: 'ta', org_id: 'o1', name: 'Talent Acquisition', is_system: false, is_owner: false },
    ],
    rbac_member_roles: [...memberRoles],
    rbac_role_capabilities: [],
  }

  function builder(table: string) {
    const filters: Array<(r: Row) => boolean> = []
    let mode: 'select' | 'delete' = 'select'
    const rows = () => tables[table].filter(r => filters.every(f => f(r)))
    const b: Record<string, unknown> = {
      select: () => b,
      eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return b },
      in: (c: string, v: unknown[]) => { filters.push(r => v.includes(r[c])); return b },
      upsert: (p: Row | Row[]) => {
        for (const row of Array.isArray(p) ? p : [p]) {
          const dup = tables[table].some(r => Object.keys(row).every(k => r[k] === row[k]))
          if (!dup) tables[table].push(row)
        }
        return b
      },
      delete: () => { mode = 'delete'; return b },
      maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => void) => {
        if (mode === 'delete') {
          const keep = tables[table].filter(r => !filters.every(f => f(r)))
          tables[table] = keep
          resolve({ data: null, error: null })
        } else {
          resolve({ data: rows(), error: null })
        }
      },
    }
    return b
  }

  return {
    client: { from: (t: string) => builder(t) },
    held: () => tables.rbac_member_roles.filter(r => r.user_id === 'u1').map(r => r.role_id).sort(),
  }
}

const placeholder = [{ org_id: 'o1', user_id: 'u1', role_id: 'rec' }]

describe('syncMemberRbacRole', () => {
  it('upgrades a bootstrapped admin from the placeholder Recruiter role to Owner', async () => {
    const db = makeDb(placeholder)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await syncMemberRbacRole(db.client as any, 'o1', 'u1', 'admin')
    expect(db.held()).toEqual(['owner'])
  })

  it('is idempotent', async () => {
    const db = makeDb(placeholder)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await syncMemberRbacRole(db.client as any, 'o1', 'u1', 'admin')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await syncMemberRbacRole(db.client as any, 'o1', 'u1', 'admin')
    expect(db.held()).toEqual(['owner'])
  })

  it('swaps the placeholder for Hiring Manager', async () => {
    const db = makeDb(placeholder)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await syncMemberRbacRole(db.client as any, 'o1', 'u1', 'hiring_manager')
    expect(db.held()).toEqual(['hm'])
  })

  it('does not clobber an invited custom role for a hiring manager', async () => {
    const db = makeDb([{ org_id: 'o1', user_id: 'u1', role_id: 'ta' }])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await syncMemberRbacRole(db.client as any, 'o1', 'u1', 'hiring_manager')
    expect(db.held()).toEqual(['ta'])
  })

  it('leaves recruiters alone', async () => {
    const db = makeDb(placeholder)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await syncMemberRbacRole(db.client as any, 'o1', 'u1', 'recruiter')
    expect(db.held()).toEqual(['rec'])
  })
})
