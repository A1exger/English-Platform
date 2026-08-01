// Answer progress for the current page, as a ring in the corner of the course
// page. Correct answers fill it in the platform's teal; wrong ones fill it in
// bordeaux, so how the page is going reads at a glance without a number.
//
//   <AnswerGauge correct={2} wrong={1} total={5} />

interface AnswerGaugeProps {
  /** Tasks answered correctly (or completed, for ungraded ones). */
  correct: number;
  /** Tasks answered wrong / partially. */
  wrong: number;
  /** Tasks on the page. 0 renders nothing. */
  total: number;
  /** Outer diameter in px. Default 44. */
  size?: number;
  label?: string;
}

export function AnswerGauge({ correct, wrong, total, size = 44, label }: AnswerGaugeProps) {
  if (total <= 0) return null;
  const done = Math.min(correct + wrong, total);
  const stroke = Math.max(3, Math.round(size * 0.1));
  const c = size / 2;
  const r = c - stroke / 2 - 1;
  const circumference = 2 * Math.PI * r;
  const seg = (n: number) => (Math.min(n, total) / total) * circumference;
  // The two arcs share one circle: correct starts at 12 o'clock, wrong picks up
  // where it ends (a negative dash offset walks the stroke forward).
  const okLen = seg(correct);
  const badLen = seg(wrong);

  return (
    <div className="answer-gauge" title={label}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={label ?? `${done} / ${total}`}
      >
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        {wrong > 0 && (
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
        {correct > 0 && (
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
          {done}/{total}
        </text>
      </svg>
    </div>
  );
}
