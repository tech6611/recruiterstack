'use client'

import { useState } from 'react'
import { companyInitials, companyLogoUrl } from '@/lib/company-logo'

/**
 * A company logo fetched on the fly (Clearbit public endpoint, via companyLogoUrl),
 * falling back to a coloured initial badge when the domain guess 404s. Shared by the
 * persona tabs and the ideal-profile tiles.
 */
export function CompanyLogo({ name, size = 16 }: { name: string; size?: number }) {
  const [failed, setFailed] = useState(false)
  const url = failed ? null : companyLogoUrl(name)
  const px = `${size}px`
  if (!url) {
    return (
      <span
        style={{ width: px, height: px }}
        className="grid shrink-0 place-items-center rounded-[4px] bg-slate-200 text-[8px] font-bold text-slate-500"
      >
        {companyInitials(name)}
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      onError={() => setFailed(true)}
      style={{ width: px, height: px }}
      className="shrink-0 rounded-[4px] object-contain"
    />
  )
}
