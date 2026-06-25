/**
 * The RecruiterStack mark — a layered "stack" glyph in a warm cream tile
 * (Direction "Logo B"). Reads cleanly on the espresso sidebar and on light.
 */
export function BrandMark({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <div className={`flex shrink-0 items-center justify-center rounded-lg bg-[#f6efe3] ${className}`}>
      <svg
        viewBox="0 0 24 24"
        className="h-[60%] w-[60%]"
        fill="none"
        stroke="#221b14"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 3 3 8l9 5 9-5-9-5Z" />
        <path d="m3 13 9 5 9-5" />
        <path d="m3 18 9 5 9-5" opacity="0.5" />
      </svg>
    </div>
  )
}
