import { describe, it, expect } from 'vitest'
import { offerInsertSchema } from '../offers'

// Valid RFC-4122 v4 UUIDs (zod v4's .uuid() checks the version/variant nibbles).
const base = {
  application_id: '06df2584-543a-42b8-92ea-3372d564e7f9',
  candidate_id:   '3f79afb5-0865-4a7d-b6c6-f94d95789178',
  position_title: 'Engineering Manager',
}

describe('offerInsertSchema — canonical offers', () => {
  it('accepts an offer with no hiring_request_id (canonical candidacy)', () => {
    const r = offerInsertSchema.safeParse(base)
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.hiring_request_id ?? null).toBeNull()
  })

  it('coerces an empty-string hiring_request_id to null', () => {
    const r = offerInsertSchema.safeParse({ ...base, hiring_request_id: '' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.hiring_request_id ?? null).toBeNull()
  })

  it('still accepts a legacy uuid hiring_request_id', () => {
    const hr = '0c3a4a39-82ad-46ca-af4a-a967ccbcfd69'
    const r = offerInsertSchema.safeParse({ ...base, hiring_request_id: hr })
    expect(r.success && r.data.hiring_request_id).toBe(hr)
  })

  it('still requires position_title', () => {
    const { position_title, ...noTitle } = base
    void position_title
    expect(offerInsertSchema.safeParse(noTitle).success).toBe(false)
  })
})
