// Tight-crops a logo to its real artwork and re-pads it evenly on all sides, so
// its optical center matches its box center both horizontally and vertically.
// Logos often ship with uneven or excessive transparent padding, which makes
// them look off-center AND opens an oversized gap to whatever sits below them.
// Runs in the browser so it can measure true rendered bounds — including SVG
// <text>, which needs a font engine to size.
//
// The result is centered on both axes and fills its display box, so phantom
// padding no longer inflates the spacing around it. Any failure returns the
// original file untouched, so a normalization hiccup never blocks an upload.

const ALPHA_THRESHOLD = 8 // treat pixels below this alpha as empty padding
const MARGIN_RATIO = 0.05 // even breathing room, as a fraction of the larger side

function round(n: number): number {
  return Math.round(n * 100) / 100
}

export async function recenterLogo(file: File): Promise<File> {
  try {
    if (file.type === 'image/svg+xml') return await recenterSvg(file)
    if (file.type === 'image/png' || file.type === 'image/webp') return await recenterRaster(file)
    return file // opaque formats (jpeg) have no transparent padding to trim
  } catch {
    return file
  }
}

async function recenterSvg(file: File): Promise<File> {
  const text = await file.text()
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
  if (doc.querySelector('parsererror')) return file
  const svg = doc.documentElement as unknown as SVGSVGElement
  if (svg.nodeName.toLowerCase() !== 'svg') return file

  // Attach an offscreen clone so getBBox() reflects real rendered geometry.
  const holder = document.createElement('div')
  holder.setAttribute('style', 'position:absolute;left:-99999px;top:0;opacity:0;pointer-events:none')
  const live = svg.cloneNode(true) as SVGSVGElement
  holder.appendChild(live)
  document.body.appendChild(holder)
  try {
    if (document.fonts?.ready) await document.fonts.ready
    const bbox = live.getBBox()
    if (!bbox || bbox.width <= 0 || bbox.height <= 0) return file

    // Tight-crop to the artwork, then re-pad evenly so it's centered on both axes.
    const pad = round(Math.max(bbox.width, bbox.height) * MARGIN_RATIO)
    const vx = round(bbox.x - pad)
    const vy = round(bbox.y - pad)
    const vw = round(bbox.width + pad * 2)
    const vh = round(bbox.height + pad * 2)
    svg.setAttribute('viewBox', `${vx} ${vy} ${vw} ${vh}`)
    svg.setAttribute('width', String(vw))
    svg.setAttribute('height', String(vh))
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')

    const out = new XMLSerializer().serializeToString(svg)
    return new File([out], file.name, { type: 'image/svg+xml' })
  } finally {
    document.body.removeChild(holder)
  }
}

async function recenterRaster(file: File): Promise<File> {
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    const w = img.naturalWidth
    const h = img.naturalHeight
    if (!w || !h) return file

    const src = document.createElement('canvas')
    src.width = w
    src.height = h
    const sctx = src.getContext('2d')
    if (!sctx) return file
    sctx.drawImage(img, 0, 0)

    const { data } = sctx.getImageData(0, 0, w, h)
    let minX = w
    let minY = h
    let maxX = -1
    let maxY = -1
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > ALPHA_THRESHOLD) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }
    if (maxX < minX || maxY < minY) return file // fully transparent

    const contentW = maxX - minX + 1
    const contentH = maxY - minY + 1
    // Already flush and full-bleed (e.g. an opaque image): nothing to trim.
    if (minX === 0 && minY === 0 && contentW === w && contentH === h) return file

    // Tight-crop to the artwork, then re-pad evenly so it's centered on both axes.
    const pad = Math.round(Math.max(contentW, contentH) * MARGIN_RATIO)
    const out = document.createElement('canvas')
    out.width = contentW + pad * 2
    out.height = contentH + pad * 2
    const octx = out.getContext('2d')
    if (!octx) return file
    octx.drawImage(src, minX, minY, contentW, contentH, pad, pad, contentW, contentH)

    const blob = await new Promise<Blob | null>(res => out.toBlob(res, 'image/png'))
    if (!blob) return file
    const base = file.name.replace(/\.[^.]+$/, '')
    return new File([blob], `${base}.png`, { type: 'image/png' })
  } finally {
    URL.revokeObjectURL(url)
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}
