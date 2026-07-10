'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { ApiError, apiFetch } from '@/lib/api';
import { tokenStore } from '@/lib/auth';
import { ScoreRing } from './ScoreRing';

interface Achievement { key: string; earned: boolean }
interface Progress {
  cefrLevel: string | null;
  lessonsCompleted: number;
  lessonsUpcoming: number;
  attendanceRate: number | null;
  homeworkGraded: number;
  achievements: Achievement[];
}
interface CourseProgress {
  courseId: string;
  title: string;
  level: string;
  courseCompletion: number;
  goalProgress: number | null;
  forecast: { projected: number | null; remaining: number };
  lessonsRequired: number;
  lessonsDone: number;
}
interface ContentProgress {
  courses: CourseProgress[];
  overall: { goalProgress: number | null; forecast: { projected: number | null; remaining: number } };
}

export function ProgressView() {
  const t = useTranslations('progress');
  const tApp = useTranslations('app');
  const locale = useLocale();
  const router = useRouter();
  const [data, setData] = useState<Progress | null>(null);
  const [content, setContent] = useState<ContentProgress | null>(null);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');

  useEffect(() => {
    const token = tokenStore.get();
    if (!token) {
      router.push('/');
      return;
    }
    apiFetch<Progress>('/analytics/progress', { token, locale })
      .then((d) => {
        setData(d);
        setState('ready');
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) {
          router.push('/');
          return;
        }
        setState('error');
      });
    // Course progress: both counters + goal forecast (INV-3). Students only.
    apiFetch<ContentProgress>('/content/progress', { token, locale })
      .then(setContent)
      .catch(() => undefined);
  }, [locale, router]);

  if (state === 'loading') return <div className="content"><p className="note">…</p></div>;
  if (state === 'error' || !data) return <div className="content"><p className="error">{tApp('loadError')}</p></div>;

  const cards = [
    { label: t('level'), value: data.cefrLevel ?? '—' },
    { label: t('lessonsCompleted'), value: String(data.lessonsCompleted) },
    { label: t('lessonsUpcoming'), value: String(data.lessonsUpcoming) },
    { label: t('attendance'), value: data.attendanceRate === null ? '—' : `${data.attendanceRate}%` },
    { label: t('homework'), value: String(data.homeworkGraded) }
  ];

  return (
    <div className="content">
      <h2>{t('title')}</h2>
      <div className="metrics">
        {cards.map((c) => (
          <div key={c.label} className="metric card">
            <span className="metric-value">{c.value}</span>
            <span className="metric-label">{c.label}</span>
          </div>
        ))}
      </div>

      {content && content.courses.length > 0 && (
        <div className="card">
          <div className="progress-overall">
            <ScoreRing
              value={(content.overall.goalProgress ?? 0) * 10}
              display={content.overall.goalProgress === null ? '—' : String(content.overall.goalProgress)}
              label={t('goal')}
            />
            <div>
              <strong>{t('courseProgress')}</strong>
              {content.overall.forecast.projected !== null && (
                <p className="muted">
                  {t('projected')}: <span className="mono-num">{content.overall.forecast.projected}</span>
                </p>
              )}
            </div>
          </div>
          <div className="course-progress-list">
            {content.courses.map((c) => (
              <div key={`${c.courseId}:${c.level}`} className="course-progress-row">
                <div className="course-progress-head">
                  <strong>{c.title}</strong>
                  <span className="muted">{c.level}</span>
                </div>
                <div className="course-progress-bars">
                  <div className="cp-metric">
                    <span className="muted">{t('structural')}</span>
                    <div className="result-bar">
                      <div className="result-bar-fill" style={{ inlineSize: `${c.courseCompletion}%` }} />
                    </div>
                    <span className="mono-num">
                      {c.courseCompletion}% · {c.lessonsDone}/{c.lessonsRequired}
                    </span>
                  </div>
                  <div className="cp-metric">
                    <span className="muted">{t('goal')}</span>
                    <div className="result-bar">
                      <div
                        className="result-bar-fill goal"
                        style={{ inlineSize: `${((c.goalProgress ?? 0) / 10) * 100}%` }}
                      />
                    </div>
                    <span className="mono-num">{c.goalProgress ?? '—'}</span>
                  </div>
                </div>
                <p className="muted cp-forecast">
                  {t('forecast')}: {t('projected')} <span className="mono-num">{c.forecast.projected ?? '—'}</span> ·{' '}
                  {c.forecast.remaining} {t('remaining')}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <strong>{t('achievements')}</strong>
        <ul className="badges">
          {data.achievements.map((a) => (
            <li key={a.key} className={`badge${a.earned ? ' earned' : ''}`}>
              <span className="badge-icon">{a.earned ? '🏅' : '🔒'}</span>
              {t(`badge_${a.key}`)}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
