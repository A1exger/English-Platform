'use client';

import { useTranslations } from 'next-intl';

export interface AssignmentResult {
  overall: number | null;
  perAspect: Record<string, number>;
  completion: number;
  motivationTier: string;
}

// Results screen (INV-4): overall + per-aspect breakdown + motivation tier.
// Scores are on the 0–10 scale; completion is a 0–100 %.
export function AssignmentResultView({ result }: { result: AssignmentResult }) {
  const t = useTranslations('assignments');
  const aspects = Object.entries(result.perAspect);

  return (
    <div className="card result-card">
      <div className={`result-tier tier-${result.motivationTier}`}>
        <span className="tier-emoji">
          {result.motivationTier === 'excellent'
            ? '🌟'
            : result.motivationTier === 'good'
              ? '👍'
              : '💪'}
        </span>
        <div>
          <strong>{t(`tier_${result.motivationTier}`)}</strong>
          <p className="muted">
            {t('completion')}: <span className="mono-num">{result.completion}%</span>
          </p>
        </div>
        <div className="result-overall">
          <span className="mono-num">{result.overall ?? '—'}</span>
          <small>/ 10</small>
        </div>
      </div>

      {aspects.length > 0 && (
        <div className="result-aspects">
          <strong>{t('perAspect')}</strong>
          {aspects.map(([aspect, score]) => (
            <div key={aspect} className="result-aspect-row">
              <span className={`chip aspect-${aspect.toLowerCase()}`}>
                <span className="dot" />
                {aspect}
              </span>
              <div className="result-bar">
                <div
                  className="result-bar-fill"
                  style={{ inlineSize: `${(score / 10) * 100}%` }}
                />
              </div>
              <span className="mono-num">{score}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
