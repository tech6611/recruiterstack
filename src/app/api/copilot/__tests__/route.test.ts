import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabase, createMockRequest } from '@/test/helpers'
import { createAdminClient } from '@/lib/supabase/server'

vi.mock('@/lib/ai/llm', () => ({
  copilotConfig: vi.fn(() => ({})),
  messagesToContents: vi.fn(() => []),
  functionResultsContent: vi.fn(() => ({ role: 'user', parts: [] })),
  CopilotTurn: class MockCopilotTurn {
    model = 'gemini-2.5-pro'
    calls: unknown[] = []
    usage = { input_tokens: 0, output_tokens: 0 }
    async *stream() {
      yield { type: 'text', delta: 'Hello' }
    }
    get text() { return 'Hello' }
    get modelContent() { return { role: 'model', parts: [{ text: 'Hello' }] } }
  },
}))

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
