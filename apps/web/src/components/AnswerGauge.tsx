// Progress ring used wherever work is scored — the lesson page and the homework
// list. The arc length is how much of the work is finished; the split inside it
// is how well it went, taken from the AVERAGE score of what was answered, so
// partial credit counts properly rather than tallying right/wrong tasks.
//
// Teal = the marks earned, bordeaux = the marks lost, track = not attempted.
//
//   <AnswerGauge done={3} total={5} pct={80} />   // 3 of 5 done, averaging 8.0

interface AnswerGaugeProps {
  /** Tasks finished. */
  done: number;
  /** Tasks in the page / homework. 0 renders nothing. */
  total: number;
  /** Average success over the finished tasks, 0–100. null = not scored yet. */
  pct?: number | null;
  /** Outer diameter in px. Default 44. */
  size?: number;
  label?: string;
}

/** The user-facing scale is 0–10 (see <Score>); percentages stay internal. */
const toTen = (pct: number) => Math.round(pct) / 10;

export function AnswerGauge({ done, total, pct = null, size = 44, label }: AnswerGaugeProps) {
  if (total <= 0) return null;
  const finished = Math.min(Math.max(done, 0), total);
  const stroke = Math.max(3, Math.round(size * 0.1));
  const c = size / 2;
  const r = c - stroke / 2 - 1;
  const circumference = 2 * Math.PI * r;

  const progress = (finished / total) * circumference;
  // With no score yet (nothing answered, or manual-only work) the whole
  // finished arc counts as earned — there is nothing to have got wrong.
  const share = pct === null ? 1 : Math.min(Math.max(pct, 0), 100) / 100;
  const okLen = progress * share;
  const badLen = progress - okLen;

  const center = pct === null ? `${finished}/${total}` : toTen(pct).toFixed(1);

  return (
    <div className="answer-gauge" title={label}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={label ? `${label}: ${center}` : center}
      >
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        {badLen > 0 && (
          <circle
            cx={c}
            cy={c}
            r={r}
            fill="none"
            stroke="var(--gauge-wrong)"
            strokeWidth={stroke}
            strokeDasharray={`${badLen} ${circumference}`}
            strokeDashoffset={-okLen}
            transform={`rotate(-90 ${c} ${c})`}
          />
        )}
        {okLen > 0 && (
          <circle
            cx={c}
            cy={c}
            r={r}
            fill="none"
            stroke="var(--gauge-ok)"
            strokeWidth={stroke}
            strokeDasharray={`${okLen} ${circumference}`}
            transform={`rotate(-90 ${c} ${c})`}
          />
        )}
        <text
          x={c}
          y={c}
          textAnchor="middle"
          dominantBaseline="central"
          style={{ fontFamily: 'var(--font-mono)', fontSize: size * 0.28, fill: 'var(--ink)' }}
        >
          {center}
        </text>
      </svg>
    </div>
  );
}
