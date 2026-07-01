/**
 * Central LLM client for RecruiterStack (Next.js side).
 *
 * Mirrors the Django `ai/llm.py` wrapper: every AI call routes through here so
 * the provider can be swapped in one place. We migrated from Anthropic (Claude)
 * to Google (Gemini); call sites still pass the old Claude model names and we
 * translate them here, so a rollback only touches this file.
 *
 * Note: in production the Next.js `/api/*` AI routes are proxied to the Django
 * backend (see next.config.mjs), so this module is primarily the local-dev
 * path. It is kept fully migrated so running without the proxy never silently
 * falls back to Claude.
 */
import { GoogleGenAI, type Content, type Part, type GenerateContentConfig } from '@google/genai'

// Map the old Claude tiers to their Gemini equivalents. Call sites still pass
// the Claude name (e.g. "claude-sonnet-4-6"); we translate here so swapping a
// tier is a one-line change in this table.
const MODEL_MAP: Record<string, string> = {
  'claude-opus-4-6': 'gemini-2.5-pro',
  'claude-sonnet-4-6': 'gemini-2.5-pro',
  'claude-haiku-4-5-20251001': 'gemini-2.5-flash',
}

const DEFAULT_MODEL = 'gemini-2.5-flash'

export function resolveModel(model: string): string {
  if (model.startsWith('gemini-')) return model
  return MODEL_MAP[model] ?? DEFAULT_MODEL
}

/** Token usage in the Anthropic-compatible shape `trackUsage` expects. */
export interface Usage {
  input_tokens: number
  output_tokens: number
}

export interface LLMResult {
  text: string
  usage: Usage
  /** The resolved Gemini model, for accurate cost logging. */
  model: string
}

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured')
  return new GoogleGenAI({ apiKey })
}

function toUsage(response: { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } }): Usage {
  const meta = response.usageMetadata ?? {}
  return {
    input_tokens: meta.promptTokenCount ?? 0,
    output_tokens: meta.candidatesTokenCount ?? 0,
  }
}

interface GenerateTextOptions {
  model?: string
  maxTokens?: number
  system?: string
  temperature?: number
  /** When true, ask Gemini to return strictly JSON (responseMimeType) AND turn
   *  off the model's hidden "thinking" tokens. Use for callers that immediately
   *  `JSON.parse` the reply: JSON mode stops prose/markdown wrapping, and
   *  disabling thinking stops those hidden tokens from eating the output budget
   *  and truncating the JSON mid-object (the "AI returned invalid JSON" bug). */
  json?: boolean
}

/** Single-shot text generation. Returns text + usage + resolved model. */
export async function generateText(
  prompt: string,
  opts: GenerateTextOptions = {},
): Promise<LLMResult> {
  const { model = DEFAULT_MODEL, maxTokens = 1024, system, temperature, json } = opts
  const resolved = resolveModel(model)
  const ai = getClient()

  const response = await ai.models.generateContent({
    model: resolved,
    contents: prompt,
    config: {
      maxOutputTokens: maxTokens,
      ...(json
        ? { responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } }
        : {}),
      ...(system ? { systemInstruction: system } : {}),
      ...(temperature != null ? { temperature } : {}),
    },
  })

  const text = response.text
  if (!text) throw new Error('Empty response from Gemini')
  return { text, usage: toUsage(response), model: resolved }
}

interface GenerateFromPdfOptions {
  model?: string
  maxTokens?: number
  mimeType?: string
}

/**
 * Document understanding over a PDF (or other supported file).
 * The JS SDK takes base64-encoded bytes via `inlineData`.
 */
export async function generateFromPdf(
  prompt: string,
  pdfBase64: string,
  opts: GenerateFromPdfOptions = {},
): Promise<LLMResult> {
  const { model = DEFAULT_MODEL, maxTokens = 2048, mimeType = 'application/pdf' } = opts
  const resolved = resolveModel(model)
  const ai = getClient()

  const response = await ai.models.generateContent({
    model: resolved,
    contents: [
      { inlineData: { mimeType, data: pdfBase64 } },
      { text: prompt },
    ],
    config: { maxOutputTokens: maxTokens },
  })

  const text = response.text
  if (!text) throw new Error('Empty response from Gemini')
  return { text, usage: toUsage(response), model: resolved }
}

// ── Tool-calling / streaming copilot support ──────────────────────────────────
//
// Claude and Gemini differ in tool-schema shape and streaming. These helpers
// hide the differences so the copilot route stays readable.

export type ClaudeTool = {
  name: string
  description?: string
  input_schema?: Record<string, unknown>
}

const GEMINI_TYPE: Record<string, string> = {
  string: 'STRING',
  number: 'NUMBER',
  integer: 'INTEGER',
  boolean: 'BOOLEAN',
  array: 'ARRAY',
  object: 'OBJECT',
}

function toGeminiSchema(schema: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!schema) return undefined
  const out: Record<string, unknown> = {}
  const t = schema.type as string | undefined
  if (t) out.type = GEMINI_TYPE[t] ?? t.toUpperCase()
  if (schema.description) out.description = schema.description
  if (schema.enum) out.enum = schema.enum
  if (t === 'object') {
    const props = (schema.properties as Record<string, Record<string, unknown>>) ?? {}
    const converted: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(props)) converted[k] = toGeminiSchema(v)
    // Gemini rejects an object schema with no properties; omit so the tool is
    // declared as taking no arguments.
    if (Object.keys(converted).length === 0) return undefined
    out.properties = converted
    if (schema.required) out.required = schema.required
  }
  if (t === 'array' && schema.items) {
    out.items = toGeminiSchema(schema.items as Record<string, unknown>)
  }
  return out
}

/** Convert Claude tool defs into a Gemini tool (functionDeclarations array). */
export function claudeToolsToGemini(tools: ClaudeTool[]) {
  return {
    functionDeclarations: tools.map((t) => ({
      name: t.name,
      description: t.description ?? '',
      parameters: toGeminiSchema(t.input_schema),
    })),
  }
}

export interface ChatMessage {
  role: string
  content: string
}

/** Convert frontend [{role, content}] history into Gemini Content objects. */
export function messagesToContents(messages: ChatMessage[]): Content[] {
  return messages
    .filter((m) => typeof m.content === 'string')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))
}

/** Build the Gemini `config` for a tool-calling turn. We disable the SDK's
 *  automatic function calling — every call site drives the tool loop itself. */
export function copilotConfig(opts: {
  system: string
  tools: ClaudeTool[]
  maxTokens?: number
}): GenerateContentConfig {
  return {
    maxOutputTokens: opts.maxTokens ?? 4096,
    systemInstruction: opts.system,
    tools: [claudeToolsToGemini(opts.tools)],
    automaticFunctionCalling: { disable: true },
  }
}

/** Wrap executed tool results as a Gemini `user` turn of functionResponse parts. */
export function functionResultsContent(
  results: { name: string; result: string }[],
): Content {
  return {
    role: 'user',
    parts: results.map((r) => ({
      functionResponse: { name: r.name, response: { result: r.result } },
    })),
  }
}

export interface ToolLoopOptions {
  model: string
  system: string
  tools: ClaudeTool[]
  /** The natural-language task to run. */
  task: string
  maxTokens?: number
  maxIterations?: number
  /** Executes one tool call and returns its result string. */
  executeTool: (name: string, args: Record<string, unknown>) => Promise<string>
}

/**
 * Non-streaming tool loop. Runs the model with the given tools + system prompt,
 * executes any function calls via `executeTool`, feeds results back, and returns
 * the model's final text. Mirrors the Anthropic tool-use loop the sub-agents
 * used to run inline.
 */
export async function runToolLoop(opts: ToolLoopOptions): Promise<string> {
  const ai = getClient()
  const resolved = resolveModel(opts.model)
  const config = copilotConfig({
    system: opts.system,
    tools: opts.tools,
    maxTokens: opts.maxTokens ?? 2048,
  })
  const contents: Content[] = [{ role: 'user', parts: [{ text: opts.task }] }]
  const maxIterations = opts.maxIterations ?? 8

  for (let i = 0; i < maxIterations; i++) {
    const response = await ai.models.generateContent({ model: resolved, contents, config })
    const calls = response.functionCalls ?? []
    const modelContent = response.candidates?.[0]?.content
    if (modelContent) contents.push(modelContent)

    if (calls.length === 0) {
      return (response.text ?? '').trim()
    }

    const results: { name: string; result: string }[] = []
    for (const call of calls) {
      const name = call.name ?? ''
      const args = (call.args ?? {}) as Record<string, unknown>
      results.push({ name, result: await opts.executeTool(name, args) })
    }
    contents.push(functionResultsContent(results))
  }

  return '(sub-agent reached iteration limit without finishing)'
}

export interface CopilotEvent {
  type: 'text' | 'call'
  delta?: string
  id?: string
  name?: string
  args?: Record<string, unknown>
}

/**
 * One streaming tool-calling turn against Gemini. Drives the orchestrator's SSE
 * loop: iterate `stream()` for text deltas and tool calls, then read `usage`,
 * `calls`, and `modelContent` to continue the conversation. Mirrors the Python
 * `CopilotTurn` on the Django side.
 */
export class CopilotTurn {
  readonly model: string
  calls: { id: string; name: string; args: Record<string, unknown> }[] = []
  usage: Usage = { input_tokens: 0, output_tokens: 0 }
  private _text = ''
  private _modelParts: Part[] = []

  constructor(
    private readonly contents: Content[],
    private readonly config: GenerateContentConfig,
    model: string,
  ) {
    this.model = resolveModel(model)
  }

  async *stream(): AsyncGenerator<CopilotEvent> {
    const ai = getClient()
    const responseStream = await ai.models.generateContentStream({
      model: this.model,
      contents: this.contents,
      config: this.config,
    })

    let textAccum = ''
    const functionParts: Part[] = []

    for await (const chunk of responseStream) {
      const parts = chunk.candidates?.[0]?.content?.parts ?? []
      for (const part of parts) {
        if (typeof part.text === 'string' && part.text.length) {
          textAccum += part.text
          yield { type: 'text', delta: part.text }
        } else if (part.functionCall) {
          const name = part.functionCall.name ?? ''
          const args = (part.functionCall.args ?? {}) as Record<string, unknown>
          const id = `${name}-${this.calls.length}`
          this.calls.push({ id, name, args })
          functionParts.push({ functionCall: { name, args } })
          yield { type: 'call', id, name, args }
        }
      }
      if (chunk.usageMetadata) {
        this.usage = {
          input_tokens: chunk.usageMetadata.promptTokenCount ?? 0,
          output_tokens: chunk.usageMetadata.candidatesTokenCount ?? 0,
        }
      }
    }

    this._text = textAccum
    this._modelParts = []
    if (textAccum) this._modelParts.push({ text: textAccum })
    this._modelParts.push(...functionParts)
  }

  /** Accumulated assistant text (available after `stream()` completes). */
  get text(): string {
    return this._text
  }

  /** The model's turn, to append to `contents` before the next iteration. */
  get modelContent(): Content {
    return { role: 'model', parts: this._modelParts }
  }
}

export { getClient as getGeminiClient }
