import { generateText } from '@/lib/ai/llm'
import type { ThreadMessage } from '@/modules/crm/domain/email-inbox'

// System prompt shared by the recruiter "suggest a reply" button (Next.js) and,
// conceptually, the Django auto-responder. Kept intentionally conservative:
// the AI acts as a helpful recruiting coordinator, never invents commitments.
const SYSTEM = `You are a helpful recruiting coordinator replying to a candidate by email on behalf of the hiring team.

Rules:
- Write a concise, warm, professional reply to the candidate's most recent message.
- Only address what the candidate actually asked. Do NOT invent interview times, salary numbers, offer details, or commitments you were not given in the context.
- If the candidate asks something you cannot answer (specific scheduling, compensation, offer status), acknowledge it and say a member of the team will follow up shortly.
- Never fabricate names, dates, or facts. Keep it to 2-5 short sentences.
- Output ONLY the reply body text — no subject line, no "Subject:", no signature block, no placeholders like [Name].`

export interface ComposeReplyContext {
  candidateName?: string | null
  jobTitle?: string | null
  thread: ThreadMessage[]
}

function renderThread(thread: ThreadMessage[]): string {
  return thread
    .slice(-12) // most recent turns are what matter
    .map((m) => {
      const who = m.direction === 'inbound' ? 'Candidate' : 'Recruiting team'
      const text = (m.body || '').trim().slice(0, 1500)
      return `${who}: ${text}`
    })
    .join('\n\n')
}

// Generate a suggested reply body from the conversation history. Returns plain
// text suitable to drop into the reply composer (recruiter reviews before send).
export async function composeReply(ctx: ComposeReplyContext): Promise<string> {
  const parts: string[] = []
  if (ctx.candidateName) parts.push(`Candidate name: ${ctx.candidateName}`)
  if (ctx.jobTitle) parts.push(`Role they applied for: ${ctx.jobTitle}`)
  parts.push('\nConversation so far:\n' + renderThread(ctx.thread))
  parts.push('\nWrite the recruiting team\'s next reply to the candidate.')

  const { text } = await generateText(parts.join('\n'), {
    model: 'gemini-2.5-flash',
    system: SYSTEM,
    maxTokens: 512,
    temperature: 0.5,
  })

  return text.trim()
}
