import { z } from 'zod'

const optionSchema = z.object({
  value: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(120),
})

const baseShape = z.object({
  object_type:  z.enum(['opening', 'job', 'posting']),
  field_key:    z.string().trim().regex(/^[a-z][a-z0-9_]*$/, 'lowercase letters, numbers, underscore (start with letter)').max(60),
  label:        z.string().trim().min(1).max(120),
  field_type:   z.enum(['text', 'number', 'select', 'multi_select', 'date', 'boolean', 'user']),
  options:      z.array(optionSchema).nullable().optional(),
  required:     z.boolean().optional().default(false),
  order_index:  z.number().int().min(0).optional().default(0),
  is_active:    z.boolean().optional().default(true),
})

// On create, select/multi_select must come with at least one option.
export const customFieldCreateSchema = baseShape.refine(
  d => (d.field_type !== 'select' && d.field_type !== 'multi_select') || (d.options && d.options.length > 0),
  { message: 'Select fields need at least one option', path: ['options'] },
)
export const customFieldUpdateSchema = baseShape.partial()

export type CustomFieldCreateInput = z.infer<typeof customFieldCreateSchema>
