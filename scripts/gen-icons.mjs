/**
 * Generates the PWA icons as real PNGs, with no image-library dependency.
 *
 * Everything is drawn at 4x and box-downsampled, which is what gives the rounded corners
 * and the clock ring clean edges instead of staircase aliasing.
 *
 * Run: node scripts/gen-icons.mjs
 */

import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')
const SS = 4 // supersample factor

// --- PNG encoding -----------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typeAndData), 0)
  return Buffer.concat([len, typeAndData, crc])
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  // Each scanline needs a leading filter byte; 0 means "none".
  const raw = Buffer.alloc(height * (width * 4 + 1))
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1)
    raw[rowStart] = 0
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4)
  }

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// --- drawing ----------------------------------------------------------------

const hexToRgb = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
]

const lerp = (a, b, t) => a + (b - a) * t

/** Signed distance to a rounded rectangle, negative inside. */
function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r)
  const qy = Math.abs(py - cy) - (hh - r)
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0))
  return outside + Math.min(Math.max(qx, qy), 0) - r
}

/** Signed distance to a line segment. */
function sdSegment(px, py, ax, ay, bx, by) {
  const pax = px - ax
  const pay = py - ay
  const bax = bx - ax
  const bay = by - ay
  const h = Math.max(0, Math.min(1, (pax * bax + pay * bay) / (bax * bax + bay * bay)))
  return Math.hypot(pax - bax * h, pay - bay * h)
}

/**
 * Draw the icon: gradient rounded square, white clock ring, two hands.
 * `inset` shrinks the glyph for the maskable variant, whose outer 10% may be cropped.
 */
function drawIcon(size, { maskable = false } = {}) {
  const S = size * SS
  const buf = Buffer.alloc(S * S * 4)

  const from = hexToRgb('#5B5BEF')
  const to = hexToRgb('#7C6CF6')

  const cx = S / 2
  const cy = S / 2
  // A maskable icon is bled to the edges; a normal one keeps its rounded-square shape.
  const plateHalf = maskable ? S : S * 0.5
  const plateRadius = maskable ? 0 : S * 0.225

  const glyphScale = maskable ? 0.78 : 1
  const ringR = S * 0.26 * glyphScale
  const ringW = S * 0.075 * glyphScale
  const handW = S * 0.055 * glyphScale

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4

      const plate = sdRoundRect(x + 0.5, y + 0.5, cx, cy, plateHalf, plateHalf, plateRadius)
      // Coverage from the signed distance gives a 1px soft edge, i.e. anti-aliasing.
      const plateA = Math.max(0, Math.min(1, 0.5 - plate))
      if (plateA <= 0) continue

      const t = (x + y) / (2 * S)
      let r = lerp(from[0], to[0], t)
      let g = lerp(from[1], to[1], t)
      let b = lerp(from[2], to[2], t)

      // Clock ring
      const dRing = Math.abs(Math.hypot(x + 0.5 - cx, y + 0.5 - cy) - ringR) - ringW / 2
      const ringA = Math.max(0, Math.min(1, 0.5 - dRing))

      // Hands: one to 12, one to just past 3.
      const hourLen = ringR * 0.52
      const minLen = ringR * 0.72
      const dHand = Math.min(
        sdSegment(x + 0.5, y + 0.5, cx, cy, cx, cy - minLen),
        sdSegment(x + 0.5, y + 0.5, cx, cy, cx + hourLen, cy),
      )
      const handA = Math.max(0, Math.min(1, 0.5 - (dHand - handW / 2)))

      const white = Math.max(ringA, handA)
      if (white > 0) {
        r = lerp(r, 255, white)
        g = lerp(g, 255, white)
        b = lerp(b, 255, white)
      }

      buf[i] = Math.round(r)
      buf[i + 1] = Math.round(g)
      buf[i + 2] = Math.round(b)
      buf[i + 3] = Math.round(plateA * 255)
    }
  }

  // Box downsample from SS x to 1x.
  const out = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * S + (x * SS + sx)) * 4
          const alpha = buf[i + 3]
          // Weight colour by alpha so transparent edge pixels do not darken the result.
          r += buf[i] * alpha
          g += buf[i + 1] * alpha
          b += buf[i + 2] * alpha
          a += alpha
        }
      }
      const o = (y * size + x) * 4
      if (a > 0) {
        out[o] = Math.round(r / a)
        out[o + 1] = Math.round(g / a)
        out[o + 2] = Math.round(b / a)
      }
      out[o + 3] = Math.round(a / (SS * SS))
    }
  }

  return encodePng(size, size, out)
}

const targets = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['icon-512-maskable.png', 512, { maskable: true }],
  ['apple-touch-icon.png', 180, { maskable: true }],
]

for (const [name, size, opts] of targets) {
  writeFileSync(join(OUT_DIR, name), drawIcon(size, opts))
  console.log(`wrote public/${name} (${size}x${size})`)
}

// Matching favicon, as SVG so it stays crisp at any size.
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#5B5BEF"/><stop offset="1" stop-color="#7C6CF6"/>
  </linearGradient></defs>
  <rect width="64" height="64" rx="14" fill="url(#g)"/>
  <circle cx="32" cy="32" r="16.6" fill="none" stroke="#fff" stroke-width="4.8"/>
  <path d="M32 32V21M32 32h8.6" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/>
</svg>
`
writeFileSync(join(OUT_DIR, 'favicon.svg'), favicon)
console.log('wrote public/favicon.svg')
