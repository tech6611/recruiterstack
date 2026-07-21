// Generates the extension's PNG icons with no external tools (pure Node + zlib).
// Design: rounded emerald square (#059669) + a white "person" silhouette
// (head + shoulders) — a recruiting/people mark, deliberately NOT a plus, which
// on green reads as a pharmacy/medical cross.
// Re-run to regenerate:  node extension/icons/generate-icon.mjs
//
// Tweak EMERALD or the person geometry below and re-run to restyle.

import { deflateSync } from 'zlib'
import { writeFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import { fileURLToPath } from 'url'

const HERE = dirname(fileURLToPath(import.meta.url))

const EMERALD = [5, 150, 105] // #059669 — same brand green used across the UI
const WHITE = [255, 255, 255]
const SIZES = [16, 32, 48, 128]

// --- tiny PNG encoder (RGBA, 8-bit) ---
const crcTable = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}
function encodePNG(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
  }
  const idat = deflateSync(raw, { level: 9 })
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

// --- render one icon at `size` with 4x supersampling for smooth edges ---
function renderIcon(size) {
  const SS = 4
  const S = size * SS
  const hi = Buffer.alloc(S * S * 4)
  const radius = S * 0.22

  // person silhouette: a head circle + a shoulders circle (only its top arc
  // shows inside the square, forming rounded shoulders)
  const headCx = S * 0.5, headCy = S * 0.37, headR = S * 0.155
  const shCx = S * 0.5, shCy = S * 0.99, shR = S * 0.32

  const insideRounded = (x, y) => {
    if (x < radius && y < radius) return Math.hypot(x - radius, y - radius) <= radius
    if (x > S - radius && y < radius) return Math.hypot(x - (S - radius), y - radius) <= radius
    if (x < radius && y > S - radius) return Math.hypot(x - radius, y - (S - radius)) <= radius
    if (x > S - radius && y > S - radius) return Math.hypot(x - (S - radius), y - (S - radius)) <= radius
    return true
  }
  const insidePerson = (x, y) =>
    Math.hypot(x - headCx, y - headCy) <= headR || Math.hypot(x - shCx, y - shCy) <= shR

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4
      const px = x + 0.5
      const py = y + 0.5
      if (!insideRounded(px, py)) {
        hi[i + 3] = 0 // transparent outside the rounded square
      } else if (insidePerson(px, py)) {
        hi[i] = WHITE[0]; hi[i + 1] = WHITE[1]; hi[i + 2] = WHITE[2]; hi[i + 3] = 255
      } else {
        hi[i] = EMERALD[0]; hi[i + 1] = EMERALD[1]; hi[i + 2] = EMERALD[2]; hi[i + 3] = 255
      }
    }
  }

  // downsample SSxSS blocks, premultiplied-alpha average for clean edges
  const out = Buffer.alloc(size * size * 4)
  const n = SS * SS
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let yy = 0; yy < SS; yy++) {
        for (let xx = 0; xx < SS; xx++) {
          const i = ((y * SS + yy) * S + (x * SS + xx)) * 4
          const alpha = hi[i + 3]
          r += hi[i] * alpha; g += hi[i + 1] * alpha; b += hi[i + 2] * alpha; a += alpha
        }
      }
      const oi = (y * size + x) * 4
      if (a === 0) {
        out[oi + 3] = 0
      } else {
        out[oi] = Math.round(r / a)
        out[oi + 1] = Math.round(g / a)
        out[oi + 2] = Math.round(b / a)
        out[oi + 3] = Math.round(a / n)
      }
    }
  }
  return out
}

mkdirSync(HERE, { recursive: true })
for (const size of SIZES) {
  const png = encodePNG(size, renderIcon(size))
  writeFileSync(`${HERE}/icon-${size}.png`, png)
  console.log(`  wrote icon-${size}.png (${png.length} bytes)`)
}
console.log('Done.')
