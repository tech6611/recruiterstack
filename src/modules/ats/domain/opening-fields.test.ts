import { describe, it, expect } from 'vitest'
import {
  OPENING_FIELDS,
  openingToolInputSchema,
  buildOpeningCreateInput,
  FieldResolutionError,
  type ResolveCtx,
} from './opening-fields'

/**
 * Minimal chainable Supabase stub. Each query resolves `.maybeSingle()` to the
 * preset row for whichever table `.from(table)` selected. Every builder method
 * returns `this` so the resolvers' `.eq().ilike()…` chains work unchanged.
 */
function stubSupabase(rows: Record<string, unknown>) {
  let table = ''
  const chain = {
    from(t: string) { table = t; return chain },
    select() { return chain },
    eq() { return chain },
    ilike() { return chain },
    maybeSingle() { return Promise.resolve({ data: rows[table] ?? null, error: null }) },
  }
  return chain
}

function ctxWith(rows: Record<string, unknown>): ResolveCtx {
  // The stub only needs to satisfy the calls the resolvers make.
  return { supabase: stubSupabase(rows) as unknown as ResolveCtx['supabase'], orgId: 'org_1' }
}

describe('opening field manifest', () => {
  it('exposes location and hiring_manager to the agent (Flavor-1 fix)', () => {
    const schema = openingToolInputSchema() as {
      type: string
      properties: Record<string, unknown>
      required: string[]
    }
    expect(schema.type).toBe('object')
    expect(Object.keys(schema.properties)).toEqual(expect.arrayContaining(['location', 'hiring_manager']))
    expect(schema.required).toEqual(['title'])
  })

  it('resolves location name and hiring-manager email to their ids', async () => {
    const ctx = ctxWith({
      locations:   { id: 'loc_1', name: 'Bangalore' },
      org_members: { users: { id: 'usr_1', full_name: 'Tech Team', email: 'tech@recruiterstack.in' } },
    })

    const input = await buildOpeningCreateInput(ctx, {
      title:          'Customer Success Manager',
      location:       'Bangalore',
      hiring_manager: 'tech@recruiterstack.in',
    })

    expect(input.title).toBe('Customer Success Manager')
    expect(input.locationId).toBe('loc_1')
    expect(input.hiringManagerId).toBe('usr_1')
  })

  it('returns a clear error when a location cannot be resolved', async () => {
    const ctx = ctxWith({ locations: null })
    await expect(
      buildOpeningCreateInput(ctx, { title: 'CSM', location: 'Atlantis' }),
    ).rejects.toBeInstanceOf(FieldResolutionError)
    await expect(
      buildOpeningCreateInput(ctx, { title: 'CSM', location: 'Atlantis' }),
    ).rejects.toThrow(/No location named "Atlantis"/)
  })

  it('refuses to silently drop an unknown field (Flavor-2 guard)', async () => {
    const ctx = ctxWith({})
    await expect(
      buildOpeningCreateInput(ctx, { title: 'CSM', not_a_real_field: 'oops' }),
    ).rejects.toThrow(/unknown field "not_a_real_field"/)
  })

  it('maps every manifest field to a distinct CreateOpeningInput key', () => {
    const inputKeys = OPENING_FIELDS.map(f => f.inputKey)
    expect(new Set(inputKeys).size).toBe(inputKeys.length)
  })
})
