import { describe, it, expect } from 'vitest'
import { buildFormAnswer } from './CopilotForm'
import type { FormSpec } from './form-spec'

const spec: FormSpec = {
  steps: ['Draft requisition', 'Submit for approval'],
  fields: [
    { key: 'department', label: 'Department', type: 'department', required: true },
    { key: 'justification', label: 'Justification', type: 'rich_text', required: true },
    { key: 'location', label: 'Location', type: 'location' },
  ],
}

describe('buildFormAnswer', () => {
  it('labels each answer with its key, passes rich text through, and lists skipped optional fields', () => {
    const { message, display } = buildFormAnswer(spec, {
      department: 'Sales',
      justification: '<p>Expanding into <strong>MENA</strong></p>',
      location: '<p></p>',
    })
    expect(message).toContain('steps: Draft requisition → Submit for approval')
    expect(message).toContain('my approval')
    expect(message).toContain('- Department [department]: Sales')
    expect(message).toContain('- Justification [justification]: <p>Expanding into <strong>MENA</strong></p>')
    expect(message).toContain('Left blank (optional — leave unset): Location')
    expect(display).toBe('✓ Form submitted — Department: Sales · Justification ✓')
  })
})
