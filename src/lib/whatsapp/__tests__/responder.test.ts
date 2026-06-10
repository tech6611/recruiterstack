import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  getMessageById: vi.fn(),
  getConversationById: vi.fn(),
  getConversationHistory: vi.fn(async () => []),
  markMessageProcessed: vi.fn(async () => {}),
  updateConversation: vi.fn(async () => {}),
  sendWhatsApp: vi.fn(async () => ({ ok: true, message: 'sent' })),
  notify: vi.fn(async () => {}),
  runSubAgent: vi.fn(async () => 'replied'),
  insert: vi.fn(async () => ({ error: null })),
}))

vi.mock('@/modules/crm/domain/whatsapp', () => ({
  getMessageById: mocks.getMessageById,
  getConversationById: mocks.getConversationById,
  getConversationHistory: mocks.getConversationHistory,
  markMessageProcessed: mocks.markMessageProcessed,
  updateConversation: mocks.updateConversation,
}))
vi.mock('../send', () => ({ sendWhatsApp: mocks.sendWhatsApp }))
vi.mock('@/lib/notifications', () => ({ notify: mocks.notify }))
vi.mock('@/lib/agents/sub-agent', () => ({ runSubAgent: mocks.runSubAgent }))
vi.mock('@/lib/copilot-tools', () => ({ COPILOT_TOOLS: [] }))
vi.mock('@anthropic-ai/sdk', () => ({ default: class MockAnthropic {} }))
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({ from: () => ({ insert: mocks.insert }) }),
}))

import { handleWhatsAppInbound } from '../responder'
import type { QueuedJob } from '@/lib/api/job-queue'

const JOB: QueuedJob = {
  id: 'job-1',
  org_id: 'org-1',
  job_type: 'whatsapp_inbound',
  payload: { messageId: 'msg-1', conversationId: 'conv-1' },
  status: 'processing',
  attempts: 1,
  max_attempts: 3,
  error: null,
  scheduled_at: '',
  started_at: null,
  completed_at: null,
  created_at: '',
}

function message(overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg-1',
    conversation_id: 'conv-1',
    org_id: 'org-1',
    direction: 'inbound',
    body: 'Hi, tell me more about the role',
    metadata: {},
    ...overrides,
  }
}

function conversation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'conv-1',
    org_id: 'org-1',
    person_id: 'person-1',
    candidate_id: 'cand-1',
    application_id: 'app-1',
    wa_phone: '+919876543210',
    status: 'active',
    agent_enabled: true,
    agent_turns: 0,
    context: {},
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')
  mocks.getConversationHistory.mockResolvedValue([])
})

describe('handleWhatsAppInbound guardrails', () => {
  it('runs the responder agent for a normal active conversation', async () => {
    mocks.getMessageById.mockResolvedValue(message())
    mocks.getConversationById.mockResolvedValue(conversation())

    await handleWhatsAppInbound(JOB)

    expect(mocks.runSubAgent).toHaveBeenCalledTimes(1)
    expect(mocks.updateConversation).toHaveBeenCalledWith(
      expect.anything(), 'org-1', 'conv-1',
      expect.objectContaining({ agent_turns: 1 }),
    )
    expect(mocks.markMessageProcessed).toHaveBeenCalledWith(
      expect.anything(), 'msg-1',
      expect.objectContaining({ processed: true, outcome: 'responded' }),
    )
  })

  it.each(['STOP', 'stop', ' Unsubscribe ', 'opt out', 'STOP.'])(
    'opts out on "%s" without calling the model',
    async (text) => {
      mocks.getMessageById.mockResolvedValue(message({ body: text }))
      mocks.getConversationById.mockResolvedValue(conversation())

      await handleWhatsAppInbound(JOB)

      expect(mocks.runSubAgent).not.toHaveBeenCalled()
      // Confirmation is sent before status flips to opted_out
      expect(mocks.sendWhatsApp).toHaveBeenCalledTimes(1)
      expect(mocks.updateConversation).toHaveBeenCalledWith(
        expect.anything(), 'org-1', 'conv-1',
        expect.objectContaining({ status: 'opted_out', agent_enabled: false }),
      )
      expect(mocks.notify).toHaveBeenCalled()
    },
  )

  it('does not opt out when STOP appears mid-sentence', async () => {
    mocks.getMessageById.mockResolvedValue(message({ body: 'Please stop by the office' }))
    mocks.getConversationById.mockResolvedValue(conversation())

    await handleWhatsAppInbound(JOB)
    expect(mocks.runSubAgent).toHaveBeenCalledTimes(1)
  })

  it('escalates unknown senders without auto-replying', async () => {
    mocks.getMessageById.mockResolvedValue(message())
    mocks.getConversationById.mockResolvedValue(conversation({ person_id: null, candidate_id: null }))

    await handleWhatsAppInbound(JOB)

    expect(mocks.runSubAgent).not.toHaveBeenCalled()
    expect(mocks.sendWhatsApp).not.toHaveBeenCalled()
    expect(mocks.updateConversation).toHaveBeenCalledWith(
      expect.anything(), 'org-1', 'conv-1',
      expect.objectContaining({ status: 'escalated', agent_enabled: false }),
    )
    expect(mocks.notify).toHaveBeenCalled()
  })

  it('stores + notifies only when the AI responder is muted', async () => {
    mocks.getMessageById.mockResolvedValue(message())
    mocks.getConversationById.mockResolvedValue(conversation({ agent_enabled: false }))

    await handleWhatsAppInbound(JOB)

    expect(mocks.runSubAgent).not.toHaveBeenCalled()
    expect(mocks.sendWhatsApp).not.toHaveBeenCalled()
    expect(mocks.notify).toHaveBeenCalled()
  })

  it('escalates with a handoff message at the turn cap', async () => {
    mocks.getMessageById.mockResolvedValue(message())
    mocks.getConversationById.mockResolvedValue(conversation({ agent_turns: 10 }))

    await handleWhatsAppInbound(JOB)

    expect(mocks.runSubAgent).not.toHaveBeenCalled()
    expect(mocks.sendWhatsApp).toHaveBeenCalledTimes(1) // "recruiter will follow up"
    expect(mocks.updateConversation).toHaveBeenCalledWith(
      expect.anything(), 'org-1', 'conv-1',
      expect.objectContaining({ status: 'escalated', agent_enabled: false }),
    )
  })

  it('skips outbound messages and already-processed messages', async () => {
    mocks.getMessageById.mockResolvedValue(message({ direction: 'outbound' }))
    mocks.getConversationById.mockResolvedValue(conversation())
    await handleWhatsAppInbound(JOB)
    expect(mocks.runSubAgent).not.toHaveBeenCalled()
    expect(mocks.markMessageProcessed).not.toHaveBeenCalled()

    mocks.getMessageById.mockResolvedValue(message({ metadata: { processed: true } }))
    await handleWhatsAppInbound(JOB)
    expect(mocks.runSubAgent).not.toHaveBeenCalled()
  })
})
