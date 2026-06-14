import { describe, it, expect } from 'vitest'
import {
  resolveCapabilities,
  isCapability,
  ALL_CAPABILITIES,
  CAPABILITIES,
} from '@/lib/permissions'

describe('isCapability', () => {
  it('accepts registry capabilities and rejects unknowns', () => {
    expect(isCapability('payroll:edit')).toBe(true)
    expect(isCapability('okrs:view')).toBe(true)
    expect(isCapability('payroll:nuke')).toBe(false)
    expect(isCapability('')).toBe(false)
  })
})

describe('resolveCapabilities', () => {
  it('owner gets every capability regardless of roles/overrides', () => {
    const caps = resolveCapabilities({
      isOwner: true,
      roleCapabilities: [],
      overrides: [{ capability: 'payroll:edit', effect: 'deny' }],
    })
    expect(caps.size).toBe(CAPABILITIES.length)
    expect(caps).toEqual(new Set(ALL_CAPABILITIES))
    // even an explicit deny can't strip an owner
    expect(caps.has('payroll:edit')).toBe(true)
  })

  it('unions capabilities across roles', () => {
    const caps = resolveCapabilities({
      isOwner: false,
      roleCapabilities: ['recruiting:view', 'recruiting:edit', 'recruiting:view'],
      overrides: [],
    })
    expect(Array.from(caps).sort()).toEqual(['recruiting:edit', 'recruiting:view'])
  })

  it('allow override grants a capability not in any role', () => {
    const caps = resolveCapabilities({
      isOwner: false,
      roleCapabilities: ['recruiting:view'],
      overrides: [{ capability: 'okrs:edit', effect: 'allow' }],
    })
    expect(caps.has('okrs:edit')).toBe(true)
  })

  it('deny override wins over a role grant and an allow (deny > allow > role)', () => {
    const caps = resolveCapabilities({
      isOwner: false,
      roleCapabilities: ['payroll:view'],
      overrides: [
        { capability: 'payroll:view', effect: 'allow' },
        { capability: 'payroll:view', effect: 'deny' },
      ],
    })
    expect(caps.has('payroll:view')).toBe(false)
  })

  it('ignores unknown capability strings from roles and overrides', () => {
    const caps = resolveCapabilities({
      isOwner: false,
      roleCapabilities: ['bogus:cap', 'recruiting:view'],
      overrides: [{ capability: 'also:bogus', effect: 'allow' }],
    })
    expect(Array.from(caps)).toEqual(['recruiting:view'])
  })
})
