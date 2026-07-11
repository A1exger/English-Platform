// The single user-facing grading scale: 0–10, mono (Sprint 2.4). Percentages
// are an internal detail; anything shown to a learner or tutor goes through here
// (or <ScoreRing> for a single aggregate).
export function Score({
  value,
  max = 10,
  suffix = true
}: {
  value: number;
  max?: number;
  suffix?: boolean;
}) {
  const v = Math.round(value * 10) / 10;
  return (
    <span className="score-value mono-num">
      {v}
      {suffix ? <span className="score-max"> / {max}</span> : null}
    </span>
  );
}
