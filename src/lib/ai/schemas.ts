import { z } from 'zod'

/**
 * Zod schemas for validating AI-generated responses.
 * Uses .catch() for graceful degradation — if a field is missing or invalid,
 * a safe default is used instead of rejecting the entire response.
 */

// ── Job Scorer Response ──────────────────────────────────────────────────────

export const jobScoreResponseSchema = z.object({
  score: z.number().min(0).max(100),
  recommendation: z.enum(['strong_yes', 'yes', 'maybe', 'no']).catch('maybe'),
  strengths: z.array(z.string()).catch([]),
  gaps: z.array(z.string()).catch([]),
  reasoning: z.string().catch(''),
  criterion_scores: z.array(z.object({
    name: z.string(),
    rating: z.number().min(1).max(4),
    weight: z.number(),
  })).optional().catch(undefined),
}).strip()

export type JobScoreResponse = z.infer<typeof jobScoreResponseSchema>

// ── Matcher Response ─────────────────────────────────────────────────────────

export const matchResponseSchema = z.object({
  score: z.number().min(0).max(100),
  recommendation: z.enum(['strong_yes', 'yes', 'maybe', 'no']).catch('maybe'),
  strengths: z.array(z.string()).catch([]),
  gaps: z.array(z.string()).catch([]),
  reasoning: z.string().catch(''),
}).strip()

export type MatchResponse = z.infer<typeof matchResponseSchema>

// ── Email Draft Response ─────────────────────────────────────────────────────

export const emailDraftResponseSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
}).strip()

export type EmailDraftResponse = z.infer<typeof emailDraftResponseSchema>

// ── Parsed CV / Resume ───────────────────────────────────────────────────────

export const parsedCvSchema = z.object({
  current_title:    z.string().nullable().catch(null),
  location:         z.string().nullable().catch(null),
  experience_years: z.number().min(0).max(60).nullable().catch(null),
  skills:           z.array(z.string()).catch([]),
  linkedin_url:     z.string().nullable().catch(null),
  phone:            z.string().nullable().catch(null),
}).strip()

export type ParsedCv = z.infer<typeof parsedCvSchema>
