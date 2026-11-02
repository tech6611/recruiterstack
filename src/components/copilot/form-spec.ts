/**
 * Shared shape of the copilot's click-through form (ask_user_form). Plain
 * types + constants only — imported by both the server route and the client
 * CopilotForm, so keep it free of React / browser code.
 */

export const FORM_FIELD_TYPES = [
  'text', 'rich_text', 'number', 'date', 'yes_no', 'select',
  'department', 'location', 'level', 'employment_type', 'currency', 'person',
] as const
export type FormFieldType = (typeof FORM_FIELD_TYPES)[number]

export interface FormField {
  key:         string
  label:       string
  type:        FormFieldType
  required?:   boolean
  default?:    string
  options?:    string[]   // only for type 'select'
  help?:       string
  min_length?: number     // e.g. 50 for a requisition justification
}

export interface FormSpec {
  intro?: string
  steps:  string[]
  fields: FormField[]
}
