import { z } from 'zod'

// Mirrors the CHECK constraint in migration 072 and ScreeningFieldType in database.ts.
export const screeningFieldTypeSchema = z.enum([
  'short_text',
  'long_text',
  'yes_no',
  'single_select',
  'multi_select',
  'number',
  'date',
  'file',
  'url',
])

export const screeningOperatorSchema = z.enum(['eq', 'neq', 'in', 'not_in'])

// A reusable library question (create/update payload).
export const screeningQuestionInputSchema = z.object({
  label:      z.string().trim().min(1).max(300),
  help_text:  z.string().trim().max(1000).nullable().optional().or(z.literal('').transform(() => null)),
  field_type: screeningFieldTypeSchema,
  options:    z.array(z.string().trim().min(1).max(200)).max(50).default([]),
  is_eeo:     z.boolean().default(false),
  archived:   z.boolean().default(false),
})
  .refine(
    q => !['single_select', 'multi_select'].includes(q.field_type) || q.options.length > 0,
    { message: 'Select questions need at least one choice', path: ['options'] },
  )

const ruleValueSchema = z.union([z.string(), z.array(z.string())])

const knockoutSchema = z.object({
  operator: screeningOperatorSchema,
  value:    ruleValueSchema,
}).nullable()

const visibilitySchema = z.object({
  field_id: z.string().min(1),
  operator: screeningOperatorSchema,
  value:    ruleValueSchema,
}).nullable()

// One field inside a form (org template or per-job).
export const screeningFieldSchema = z.object({
  id:           z.string().min(1),
  question_id:  z.string().uuid().nullable(),
  label:        z.string().trim().min(1).max(300),
  help_text:    z.string().trim().max(1000).nullable(),
  field_type:   screeningFieldTypeSchema,
  options:      z.array(z.string().trim().min(1).max(200)).max(50),
  required:     z.boolean(),
  is_eeo:       z.boolean(),
  knockout:     knockoutSchema,
  visible_when: visibilitySchema,
})

// A whole form (the org default template, or a per-job override).
export const screeningFormSchema = z.object({
  fields: z.array(screeningFieldSchema).max(100),
})

// A single candidate answer submitted on the public apply page.
export const screeningAnswerSchema = z.object({
  field_id: z.string().min(1),
  label:    z.string().min(1).max(300),
  value:    z.union([z.string(), z.array(z.string()), z.null()]),
})

export const screeningAnswersSchema = z.array(screeningAnswerSchema).max(100)

export type ScreeningQuestionInput = z.infer<typeof screeningQuestionInputSchema>
export type ScreeningFormInput = z.infer<typeof screeningFormSchema>
