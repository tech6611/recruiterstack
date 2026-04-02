import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabase, createMockRequest } from '@/test/helpers'
import { createAdminClient } from '@/lib/supabase/server'

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = {
        stream: vi.fn().mockReturnValue({
          [Symbol.asyncIterator]: async function* () {
            yield { type: 'message_start', message: { content: [] } }
            yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } }
            yield { type: 'message_stop' }
          },
          finalMessage: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'Hello' }], stop_reason: 'end_turn' }),
        }),
      }
    },
  }
})

vi.mock('@/lib/api/rate-limit', () => ({
  checkAuthRateLimit: vi.fn(() => Promise.resolve(null)),
}))

vi.mock('@/lib/copilot-tools', () => ({
  COPILOT_TOOLS: [],
  executeTool: vi.fn(),
}))

import { POST } from '../route'

describe('/api/copilot', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabase = createMockSupabase()
    vi.mocked(createAdminClient).mockReturnValue(mockSupabase.client as never)
  })

  it('returns 400 for invalid JSON body', async () => {
    const req = new Request('http://localhost:3000/api/copilot', {
      method: 'POST',
      body: 'not json',
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req as never)
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toBe('Invalid JSON')
  })

  it('returns 400 for empty messages array', async () => {
    const req = createMockRequest('POST', 'http://localhost:3000/api/copilot', {
      messages: [],
    })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toBe('messages array is required')
  })

  it('returns 400 when messages is not provided', async () => {
    const req = createMockRequest('POST', 'http://localhost:3000/api/copilot', {})
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toBe('messages array is required')
  })

  it('returns 200 streaming response for valid input', async () => {
    const req = createMockRequest('POST', 'http://localhost:3000/api/copilot', {
      messages: [{ role: 'user', content: 'Hello' }],
    })
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/event-stream')
  })
})
