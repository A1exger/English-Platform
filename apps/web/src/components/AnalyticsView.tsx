'use client';

import { useEffect, useState } from 'react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { ApiError, apiFetch } from '@/lib/api';
import { tokenStore } from '@/lib/auth';
import { Skeleton } from './Skeleton';

interface Overview {
  revenueCents: number;
  currency: string;
  lessonsCompleted: number;
  lessonsUpcoming: number;
  activeStudents: number;
  attendanceRate: number | null;
  trialConversionRate: number | null;
}

export function AnalyticsView() {
  const t = useTranslations('analytics');
  const tApp = useTranslations('app');
  const locale = useLocale();
  const format = useFormatter();
  const router = useRouter();

  const [data, setData] = useState<Overview | null>(null);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');

  useEffect(() => {
    const token = tokenStore.get();
    if (!token) {
      router.push('/');
      return;
    }
    apiFetch<Overview>('/analytics/overview', { token, locale })
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

  if (state === 'loading') return <div className="content"><Skeleton lines={5} /></div>;
  if (state === 'error' || !data) return <div className="content"><p className="error">{tApp('loadError')}</p></div>;

  const pct = (v: number | null) => (v === null ? '—' : `${v}%`);

  const cards = [
    { label: t('revenue'), value: format.number(data.revenueCents / 100, { style: 'currency', currency: data.currency }) },
    { label: t('lessonsCompleted'), value: format.number(data.lessonsCompleted) },
    { label: t('lessonsUpcoming'), value: format.number(data.lessonsUpcoming) },
    { label: t('activeStudents'), value: format.number(data.activeStudents) },
    { label: t('attendance'), value: pct(data.attendanceRate) },
    { label: t('conversion'), value: pct(data.trialConversionRate) }
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
    </div>
  );
}
