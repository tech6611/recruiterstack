import { describe, it, expect } from 'vitest'
import {
  ZONE_SEQUENCE,
  zoneRank,
  isForwardZoneMove,
  defaultZoneForStageName,
  LEAD_STAGE_SEEDS,
} from './zones'

describe('pipeline zones', () => {
  it('orders zones lead → active → offer → completed', () => {
    expect(ZONE_SEQUENCE).toEqual(['lead', 'active', 'offer', 'completed'])
    expect(zoneRank('lead')).toBe(0)
    expect(zoneRank('completed')).toBe(3)
  })

  it('allows forward and same-zone moves, blocks backward ones', () => {
    expect(isForwardZoneMove('lead', 'active')).toBe(true)
    expect(isForwardZoneMove('active', 'active')).toBe(true)
    expect(isForwardZoneMove('offer', 'completed')).toBe(true)
    expect(isForwardZoneMove('active', 'lead')).toBe(false)
    expect(isForwardZoneMove('completed', 'offer')).toBe(false)
  })

  describe('defaultZoneForStageName', () => {
    it('maps the seeded default names to their zones (case-insensitive)', () => {
      expect(defaultZoneForStageName('New lead')).toBe('lead')
      expect(defaultZoneForStageName('reached out')).toBe('lead')
      expect(defaultZoneForStageName('Replied')).toBe('lead')
      expect(defaultZoneForStageName('Applied')).toBe('active')
      expect(defaultZoneForStageName('Phone Screen')).toBe('active')
      expect(defaultZoneForStageName('Offer')).toBe('offer')
      expect(defaultZoneForStageName('Hired')).toBe('completed')
      expect(defaultZoneForStageName('Archived')).toBe('completed')
    })

    it('falls back to active for custom stage names', () => {
      expect(defaultZoneForStageName('Take-home')).toBe('active')
      expect(defaultZoneForStageName('Founder chat')).toBe('active')
    })
  })

  describe('LEAD_STAGE_SEEDS', () => {
    it('are three lead-zone stages ordered ahead of the active zone', () => {
      expect(LEAD_STAGE_SEEDS).toHaveLength(3)
      expect(LEAD_STAGE_SEEDS.map(s => s.name)).toEqual(['New lead', 'Reached out', 'Replied'])
      expect(LEAD_STAGE_SEEDS.every(s => s.zone === 'lead')).toBe(true)
      // Negative order_index keeps them ahead of active stages (which start at 0)
      // without renumbering existing rows.
      expect(LEAD_STAGE_SEEDS.every(s => s.order_index < 0)).toBe(true)
    })

    it('marks exactly "Replied" as the promotion gate', () => {
      const gates = LEAD_STAGE_SEEDS.filter(s => s.is_promotion_gate)
      expect(gates).toHaveLength(1)
      expect(gates[0].name).toBe('Replied')
    })
  })
})
