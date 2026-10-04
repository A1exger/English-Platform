'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { tokenStore } from '@/lib/auth';

interface Progress {
  streakDays: number;
  achievements: { key: string; earned: boolean }[];
}

/** One emoji per achievement. Earned ones are shown; the rest stay unearned. */
const BADGE_ICON: Record<string, string> = {
  first_lesson: '🎯',
  five_lessons: '⭐',
  ten_lessons: '🏅',
  homework_hero: '📚',
  perfect_attendance: '🎖️',
  week_streak: '🔥'
};

/**
 * The strip above a lesson: how far through it the student is, how many days
 * in a row they have shown up, and what they have earned.
 *
 * It answers the one question a flat list of pages never did — "how much is
 * left?" — and it is the only place on a student's screen that says anything
 * about them rather than about the material.
 *
 * Deliberately not shown to a tutor: the same component in a teaching view
 * would be a progress bar for someone else's progress.
 */
export function QuestBar({ step, total }: { step: number; total: number }) {
  const t = useTranslations('learn');
  // The badge names already exist on the progress page; one list, one wording.
  const tp = useTranslations('progress');
  const locale = useLocale();
  const [progress, setProgress] = useState<Progress | null>(null);

  useEffect(() => {
    const token = tokenStore.get();
    if (!token) return;
    let alive = true;
    apiFetch<Progress>('/analytics/progress', { token, locale })
      .then((p) => alive && setProgress(p))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [locale]);

  // `step` is the index of the page being read, so the ring fills as pages are
  // left behind: on the last page it reads full.
  const done = Math.min(step + 1, total);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const left = Math.max(0, total - done);
  const earned = (progress?.achievements ?? []).filter((a) => a.earned);
  const streak = progress?.streakDays ?? 0;

  return (
    <div className="quest-bar">
      <div
        className="quest-ring"
        style={{ '--pct': `${pct}%` } as React.CSSProperties}
        role="img"
        aria-label={t('questProgress', { done, total })}
      >
        <span className="mono-num">
          {done}/{total}
        </span>
      </div>
      <div className="quest-main">
        <b>{left === 0 ? t('questDone') : t('questLeft', { count: left })}</b>
        {streak > 0 && <small>{t('questStreak', { days: streak })}</small>}
      </div>
      {earned.length > 0 && (
        <ul className="quest-badges" aria-label={t('questBadges')}>
          {earned.map((a) => (
            <li key={a.key} title={tp(`badge_${a.key}` as 'badge_first_lesson')}>
              <span aria-hidden="true">{BADGE_ICON[a.key] ?? '🏆'}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
