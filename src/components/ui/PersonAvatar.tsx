'use client'

import { useState } from 'react'
import { avatarColor, initials } from '@/lib/ui/avatar'

/**
 * A candidate's portrait, falling back to their initials.
 *
 * THE INITIALS ARE THE COMMON CASE, not a failure. The only photo we can show honestly
 * is a GitHub avatar, which exists for a minority of people; LinkedIn's sit behind
 * their authentication and their terms forbid taking them. So this is built around the
 * circle being what you usually see, with a photo as the happy exception.
 *
 * The initials are painted first and the photo layered over, invisible until it has
 * decoded — otherwise a slow or broken image leaves a hole where a face should be, the
 * same bug <BrandIcon> had.
 */
export function PersonAvatar({
  name,
  src,
  size = 64,
  className = '',
}: {
  name: string
  src?: string | null
  size?: number
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const show = src && !failed

  return (
    <span
      style={{ width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.34)}px` }}
      className={`relative grid shrink-0 place-items-center overflow-hidden rounded-full font-bold ${avatarColor(name)} ${className}`}
      title={name}
    >
      <span className={loaded ? 'opacity-0' : undefined}>{initials(name)}</span>
      {show && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          onLoad={(e) => setLoaded(e.currentTarget.naturalWidth > 0)}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}
    </span>
  )
}
