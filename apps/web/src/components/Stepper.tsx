'use client';

import { useTranslations } from 'next-intl';

// Shared step navigation, extracted from LessonPlayerView's working stepper
// (Sprint 2.2). Used by both LessonPlayerView (pages) and AssignmentPlayerView
// (one task per step). Renders prev/next, a labelled step row, and a sticky
// mono progress indicator.
export interface Step {
  key: string;
  label: string;
}

export function Stepper({
  steps,
  current,
  onChange
}: {
  steps: Step[];
  current: number;
  onChange: (i: number) => void;
}) {
  const t = useTranslations('learn');
  const total = steps.length;

  return (
    <div className="stepper">
      <div className="learn-nav">
        <button
          type="button"
          className="ghost"
          disabled={current === 0}
          onClick={() => onChange(current - 1)}
        >
          ‹ {t('prev')}
        </button>
        <div className="learn-steps">
          {steps.map((s, i) => (
            <button
              key={s.key}
              type="button"
              className={`step${current === i ? ' active' : ''}`}
              aria-current={current === i ? 'step' : undefined}
              onClick={() => onChange(i)}
            >
              {s.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="ghost"
          disabled={current >= total - 1}
          onClick={() => onChange(current + 1)}
        >
          {t('next')} ›
        </button>
      </div>
      <span className="stepper-progress mono-num">
        {current + 1} / {total}
      </span>
    </div>
  );
}
