import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { RichText } from '../RichText'

const ZWSP = '\u200B'

describe('RichText — trailing break fidelity', () => {
  it('keeps a break at the end of a paragraph as a visible blank line', () => {
    const { container } = render(
      <RichText html="<p><strong>First paragraph.<br></strong></p><p><strong>Second paragraph.</strong></p>" />,
    )
    // Trailing <br> (immediately before a closing tag) gets a zero-width space so
    // the blank line the editor shows is not collapsed by the browser.
    expect(container.innerHTML).toContain(`<br>${ZWSP}`)
  })

  it('leaves a break in the middle of text untouched', () => {
    const { container } = render(<RichText html="<p>Line one<br>Line two</p>" />)
    expect(container.innerHTML).not.toContain(`<br>${ZWSP}`)
    expect(container.innerHTML).toContain('<br>Line two')
  })

  it('renders legacy plain text unchanged (no HTML tags)', () => {
    const { container } = render(<RichText html={'Line one\nLine two'} />)
    expect(container.textContent).toBe('Line one\nLine two')
    expect(container.innerHTML).not.toContain(ZWSP)
  })
})
