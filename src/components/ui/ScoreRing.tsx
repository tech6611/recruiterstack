/**
 * SVG circular score indicator (0-100).
 * Consolidates identical ScoreRing from SummaryTab.tsx and VoiceCallDetailModal.tsx.
 */

export function ScoreRing({ score, size = 72 }: { score: number; size?: number }) {
  const radius = (size / 2) - 8
  const circ   = 2 * Math.PI * radius
  const offset = circ - (score / 100) * circ
  const color  = score >= 70 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444'
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e2e8f0" strokeWidth="6" />
      <circle
        cx={size / 2} cy={size / 2} r={radius} fill="none"
        stroke={color} strokeWidth="6"
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
      <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central"
        fill={color} fontSize="14" fontWeight="700">
        {score}
      </text>
    </svg>
  )
}
