'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { ApiError, apiFetch } from '@/lib/api';
import { tokenStore } from '@/lib/auth';

interface Achievement { key: string; earned: boolean }
interface Progress {
  cefrLevel: string | null;
  lessonsCompleted: number;
  lessonsUpcoming: number;
  attendanceRate: number | null;
  homeworkGraded: number;
  achievements: Achievement[];
}

export function ProgressView() {
  const t = useTranslations('progress');
  const tApp = useTranslations('app');
  const locale = useLocale();
  const router = useRouter();
  const [data, setData] = useState<Progress | null>(null);
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
