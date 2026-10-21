'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { ScoreRing } from './ScoreRing';

export interface AssignmentResult {
  overall: number | null;
  perAspect: Record<string, number>;
  completion: number;
  motivationTier: string;
}

// The soonest upcoming lesson, surfaced under the result so the student can
// jump straight back into the course (Skyeng «Следующий урок»).
export interface NextLessonCard {
  id: string;
  title?: string | null;
  startsAt: string;
}

const TIER_EMOJI: Record<string, string> = {
  excellent: '🎉',
  good: '👍',
  keepGoing: '💪'
};

// Homework results (INV-4) — Skyeng-style: a celebratory hero with the big
// overall score, the per-aspect skill breakdown, and (for students) the next
// lesson to jump into. Scores are on the 0–10 scale; completion is a 0–100 %.
export function AssignmentResultView({
  result,
  nextLesson
}: {
  result: AssignmentResult;
  nextLesson?: NextLessonCard | null;
}) {
  const t = useTranslations('assignments');
  const format = useFormatter();
  const aspects = Object.entries(result.perAspect);
  const tier = result.motivationTier;

  return (
    <div className="hw-result">
      <div className={`card hw-hero tier-${tier}`}>
        <span className="hw-hero-emoji" aria-hidden="true">
          {TIER_EMOJI[tier] ?? '💪'}
        </span>
        <div className="hw-hero-text">
          <strong className="hw-hero-title">{t('allDone')}</strong>
          <p className="hw-hero-sub">{t(`tier_${tier}`)}</p>
          <p className="hw-hero-completion muted">
            {t('completion')}: <span className="mono-num">{result.completion}%</span>
          </p>
        </div>
        <ScoreRing
          value={(result.overall ?? 0) * 10}
          display={result.overall === null ? '—' : String(result.overall)}
          size={124}
          stroke={8}
          label={t('overallScore')}
        />
      </div>

      {aspects.length > 0 && (
        <div className="card hw-aspects">
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

      {nextLesson && (
        <div className="card hw-next">
          <div className="hw-next-main">
            <span className="hw-next-kicker">{t('nextLesson')}</span>
            <strong className="hw-next-title">{nextLesson.title ?? t('lesson')}</strong>
            <span className="muted">
              {format.dateTime(new Date(nextLesson.startsAt), {
                dateStyle: 'medium',
                timeStyle: 'short'
              })}
            </span>
          </div>
          <Link href={`/lessons/${nextLesson.id}/room`} className="cta-primary">
            {t('joinLesson')}
          </Link>
        </div>
      )}
    </div>
  );
}
