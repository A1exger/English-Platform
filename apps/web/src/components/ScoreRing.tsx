// Score ring — the product signature. Thin circular gauge whose arc is
// tier-coloured by the score band (high / mid / low). Reads design tokens
// from globals.css, so it re-skins with the theme. RTL-safe (purely centred).
//
// Usage:
//   <ScoreRing value={72} label="Цель курса" />          // shows "72%"
//   <ScoreRing value={86} display="8.6" label="Балл" />  // arc at 86%, shows "8.6"

interface ScoreRingProps {
  /** 0–100. Drives the arc length and tier colour. Clamped. */
  value: number;
  /** Center text override. Defaults to `${value}%`. Use for 0–10 grades. */
  display?: string;
  /** Outer diameter in px. Default 88. */
  size?: number;
  /** Ring thickness in px. Default 5. */
  stroke?: number;
  /** Optional caption rendered under the ring. */
  label?: string;
}

function tierColor(v: number): string {
  if (v >= 80) return 'var(--high)';
  if (v >= 50) return 'var(--mid)';
  return 'var(--low)';
}

export function ScoreRing({ value, display, size = 88, stroke = 5, label }: ScoreRingProps) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const c = size / 2;
  const r = c - stroke / 2 - 1;
  const circumference = 2 * Math.PI * r;
  const dash = (v / 100) * circumference;
  const center = display ?? `${v}%`;

  return (
    <div className="score-ring">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={label ? `${label}: ${center}` : center}
      >
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke={tierColor(v)}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          transform={`rotate(-90 ${c} ${c})`}
        />
        <text
          x={c}
          y={c}
          textAnchor="middle"
          dominantBaseline="central"
          style={{ fontFamily: 'var(--font-mono)', fontSize: size * 0.24, fill: 'var(--ink)' }}
        >
          {center}
        </text>
      </svg>
      {label && <span className="score-ring-label">{label}</span>}
    </div>
  );
}
