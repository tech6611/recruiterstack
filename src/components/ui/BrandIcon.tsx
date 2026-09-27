'use client'

import { useState } from 'react'
import { Briefcase } from 'lucide-react'
import { brandIconSrc, brandInitials, type BrandKind } from '@/lib/brand-icon'
import { avatarColor } from '@/lib/ui/avatar'

/**
 * The one mark used for every company and school in the product — result rows,
 * experience timelines, chips, persona tiles. Replaces <CompanyLogo>, whose provider
 * (Clearbit) no longer exists.
 *
 * THE MONOGRAM IS NOT AN ERROR STATE. Measured over our own data, roughly a fifth of
 * role and education rows will never resolve to a logo — long-tail employers, and the
 * K-12 schools that make up most of the education misses. So the fallback is styled as
 * a deliberate mark (the shared avatar palette, keyed off the name so it is stable) and
 * is chosen *before* any request whenever the resolver already knows no lookup is worth
 * making. A page of monograms should read as a design, not as a page of broken images.
 *
 * THE MONOGRAM IS ALWAYS DRAWN FIRST, with the logo layered over it. An <img> that is
 * still loading — or that has failed and not yet told us — occupies its box as a blank
 * hole, and a timeline of holes looks broken in exactly the way this component exists
 * to prevent. Painting the monogram underneath means there is never a gap: the logo
 * simply covers it when it arrives. The image carries its own white background so a
 * transparent favicon doesn't show the letters through it.
 *
 * A REAL LOGO IS NOT PUT IN A BOX. Once the image loads, the tile drops its background
 * entirely and the logo simply sits there. The coloured rounded square belongs to the
 * MONOGRAM, which needs a surface to be legible on; a logo brings its own — Rippling's
 * is a dark square, IBM's is blue, and a wordmark is transparent and wants nothing
 * behind it. Framing all of them alike made every one look stuffed into a box.
 *
 * Companies and schools are square-rounded; people are round. Same component, so the
 * iconography can't drift between surfaces.
 */
export function BrandIcon({
  name,
  kind = 'company',
  size = 16,
  rounded = 'square',
  className = '',
}: {
  name: string | null | undefined
  kind?: BrandKind
  size?: number
  rounded?: 'square' | 'full'
  className?: string
}) {
  const label = (name ?? '').trim()
  const [failed, setFailed] = useState(false)
  // The image stays invisible until it has actually decoded. Showing it earlier would
  // paint its own background over the monogram and recreate the blank box.
  const [loaded, setLoaded] = useState(false)
  const src = failed ? null : brandIconSrc(label, kind)
  const shape = rounded === 'full' ? 'rounded-full' : size >= 28 ? 'rounded-lg' : 'rounded-[4px]'
  const box = { width: `${size}px`, height: `${size}px` }

  // No employer recorded — a real gap in the data, not a logo we failed to find. An
  // empty filled square reads as a broken image; an outlined placeholder reads as
  // "a role with no company named", keeps the row aligned with the ones above it, and
  // never pretends to be a mark.
  if (!label) {
    return (
      <span
        style={box}
        className={`grid shrink-0 place-items-center border border-dashed border-slate-300 text-slate-300 ${shape} ${className}`}
        title="No employer recorded"
        aria-hidden
      >
        <Briefcase style={{ width: `${Math.round(size * 0.5)}px`, height: `${Math.round(size * 0.5)}px` }} />
      </span>
    )
  }

  return (
    <span
      style={{ ...box, fontSize: `${Math.max(8, Math.round(size * 0.42))}px` }}
      className={`relative grid shrink-0 place-items-center overflow-hidden font-bold ${shape} ${
        loaded ? '' : avatarColor(label)
      } ${className}`}
      title={label}
      aria-hidden
    >
      <span className={loaded ? 'opacity-0' : undefined}>{brandInitials(label)}</span>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          onLoad={(e) => setLoaded(e.currentTarget.naturalWidth > 0)}
          className={`absolute inset-0 h-full w-full object-contain transition-opacity ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}
    </span>
  )
}
