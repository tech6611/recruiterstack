// Pulls a representative brand colour out of an uploaded logo, so the careers
// page's CTA buttons can auto-match the logo instead of a hand-picked hex.
// Runs in the browser: draws the logo to a canvas, then picks the most common
// vivid colour, ignoring transparent padding and near-white/near-black pixels
// (which are usually background or plain text, not the brand mark).

const ALPHA_THRESHOLD = 8   // ignore transparent padding
const NEAR_WHITE = 236      // channels above this on every axis read as background
const NEAR_BLACK = 24       // channels below this on every axis read as plain text
const MIN_SATURATION = 0.18 // skip washed-out greys with no real hue
const MAX_SAMPLE = 160      // downscale longest side to this for a fast scan

interface Bucket { r: number; g: number; b: number; weight: number }

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

function toHex(r: number, g: number, b: number): string {
  const h = (n: number) => n.toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

// Saturation on a 0–1 scale (max channel minus min channel, normalized).
function saturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return max === 0 ? 0 : (max - min) / max
}

// Returns a hex colour representing the logo's dominant vivid hue, or null if
// the logo has no usable colour (e.g. a pure black-and-white mark). Any failure
// returns null so a bad read never blocks the upload.
export async function extractLogoColor(file: File): Promise<string | null> {
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    const nw = img.naturalWidth
    const nh = img.naturalHeight
    if (!nw || !nh) return null

    const scale = Math.min(1, MAX_SAMPLE / Math.max(nw, nh))
    const w = Math.max(1, Math.round(nw * scale))
    const h = Math.max(1, Math.round(nh * scale))

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, w, h)

    const { data } = ctx.getImageData(0, 0, w, h)
    // Bucket colours into a coarse 4-bits-per-channel grid, weighting each by its
    // saturation so a small patch of vivid brand colour outvotes a large flat wash.
    const buckets = new Map<number, Bucket>()
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const a = data[i + 3]
      if (a <= ALPHA_THRESHOLD) continue
      if (r >= NEAR_WHITE && g >= NEAR_WHITE && b >= NEAR_WHITE) continue
      if (r <= NEAR_BLACK && g <= NEAR_BLACK && b <= NEAR_BLACK) continue
      const sat = saturation(r, g, b)
      if (sat < MIN_SATURATION) continue

      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
      const entry = buckets.get(key) ?? { r: 0, g: 0, b: 0, weight: 0 }
      entry.r += r * sat
      entry.g += g * sat
      entry.b += b * sat
      entry.weight += sat
      buckets.set(key, entry)
    }

    if (buckets.size === 0) return null
    const entries = Array.from(buckets.values())
    let best: Bucket = entries[0]
    for (let i = 1; i < entries.length; i++) {
      if (entries[i].weight > best.weight) best = entries[i]
    }
    if (best.weight === 0) return null

    return toHex(
      Math.round(best.r / best.weight),
      Math.round(best.g / best.weight),
      Math.round(best.b / best.weight),
    )
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}
