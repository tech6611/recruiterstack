// Picks readable text colors for a solid background color, so hero text stays
// legible whether the brand color is light (dark text) or dark (white text).
// Uses the YIQ perceived-brightness formula with a mid threshold — good enough
// for choosing black-vs-white and cheaper than full WCAG contrast math.

export interface ReadableText {
  strong: string // headings
  muted: string // secondary text (e.g. tagline)
}

const ON_DARK: ReadableText = { strong: '#ffffff', muted: 'rgba(255,255,255,0.85)' }
const ON_LIGHT: ReadableText = { strong: '#0f172a', muted: 'rgba(15,23,42,0.72)' }

export function readableTextOn(bgHex: string): ReadableText {
  const rgb = hexToRgb(bgHex)
  if (!rgb) return ON_DARK
  const yiq = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000
  return yiq >= 140 ? ON_LIGHT : ON_DARK
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const raw = hex.replace('#', '').trim()
  const full = raw.length === 3 ? raw.split('').map(c => c + c).join('') : raw
  if (full.length !== 6 || /[^0-9a-fA-F]/.test(full)) return null
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  }
}
