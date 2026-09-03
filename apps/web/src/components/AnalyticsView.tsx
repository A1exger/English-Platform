'use client';

import { useEffect, useMemo, useState } from 'react';
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
interface Lesson {
  id: string;
  startsAt: string;
  status: string;
  priceCents: number;
}

const PERIODS = [3, 6, 12] as const;
type Period = (typeof PERIODS)[number];
type Metric = 'revenue' | 'lessons';

export function AnalyticsView() {
  const t = useTranslations('analytics');
  const tApp = useTranslations('app');
  const locale = useLocale();
  const format = useFormatter();
  const router = useRouter();

  const [overview, setOverview] = useState<Overview | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [months, setMonths] = useState<Period>(6);
  const [metric, setMetric] = useState<Metric>('revenue');

  useEffect(() => {
    const token = tokenStore.get();
    if (!token) {
      router.push('/');
      return;
    }
    Promise.all([
      apiFetch<Overview>('/analytics/overview', { token, locale }),
      apiFetch<Lesson[]>('/lessons', { token, locale }).catch(() => [] as Lesson[])
    ])
      .then(([o, l]) => {
        setOverview(o);
        setLessons(l);
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

  // Month buckets for the selected window plus the preceding window (delta base).
  const buckets = useMemo(() => {
    const now = new Date();
    const out = Array.from({ length: months * 2 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (months * 2 - 1 - i), 1);
      return { date: d, key: `${d.getFullYear()}-${d.getMonth()}`, revenue: 0, lessons: 0 };
    });
    const map = new Map(out.map((b) => [b.key, b]));
    for (const l of lessons) {
      if (l.status !== 'completed') continue;
      const d = new Date(l.startsAt);
      const b = map.get(`${d.getFullYear()}-${d.getMonth()}`);
      if (b) {
        b.revenue += l.priceCents;
        b.lessons += 1;
      }
    }
    return out;
  }, [lessons, months]);

  if (state === 'loading') return <div className="content"><Skeleton lines={5} /></div>;
  if (state === 'error' || !overview) return <div className="content"><p className="error">{tApp('loadError')}</p></div>;

  const currency = overview.currency ?? 'EUR';
  const windowB = buckets.slice(months);
  const prevB = buckets.slice(0, months);
  const sum = (arr: typeof buckets, k: Metric) => arr.reduce((s, b) => s + b[k], 0);
  const cur = sum(windowB, metric);
  const prev = sum(prevB, metric);
  const delta = prev === 0 ? null : Math.round(((cur - prev) / prev) * 100);
  const heroValue = metric === 'revenue' ? format.number(cur / 100, { style: 'currency', currency }) : format.number(cur);
  const deltaTier = delta === null ? '' : delta > 0 ? 'tier-high' : delta < 0 ? 'tier-low' : '';

  const chart = windowB.map((b) => ({ date: b.date, v: b[metric] }));
  const max = Math.max(1, ...chart.map((c) => c.v));
  const W = 640;
  const H = 200;
  const pad = 24;
  const barGap = 10;
  const barW = (W - pad * 2 - barGap * (chart.length - 1)) / chart.length;

  const pct = (v: number | null) => (v === null ? '—' : `${v}%`);
  const cards = [
    { label: t('revenue'), value: format.number(overview.revenueCents / 100, { style: 'currency', currency }) },
    { label: t('lessonsCompleted'), value: format.number(overview.lessonsCompleted) },
    { label: t('lessonsUpcoming'), value: format.number(overview.lessonsUpcoming) },
    { label: t('activeStudents'), value: format.number(overview.activeStudents) },
    { label: t('attendance'), value: pct(overview.attendanceRate) },
    { label: t('conversion'), value: pct(overview.trialConversionRate) }
  ];

  return (
    <div className="content">
      <div className="row-between page-head">
        <h2>{t('title')}</h2>
        <div className="tabs tabs-inline filter-chips" role="tablist" aria-label={t('period')}>
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={months === p}
              className={months === p ? 'active' : ''}
              onClick={() => setMonths(p)}
            >
              {t('periodMonths', { count: p })}
            </button>
          ))}
        </div>
      </div>

      <div className="card analytics-hero">
        <div className="analytics-hero-main">
          <div className="tabs tabs-inline" role="tablist" aria-label={t('metric')}>
            <button type="button" role="tab" aria-selected={metric === 'revenue'} className={metric === 'revenue' ? 'active' : ''} onClick={() => setMetric('revenue')}>
              {t('revenue')}
            </button>
            <button type="button" role="tab" aria-selected={metric === 'lessons'} className={metric === 'lessons' ? 'active' : ''} onClick={() => setMetric('lessons')}>
              {t('lessons')}
            </button>
          </div>
          <div className="analytics-hero-value">{heroValue}</div>
          <div className="analytics-hero-sub">
            <span className="muted">{t('thisPeriod')}</span>
            {delta !== null && (
              <span className={`delta ${deltaTier}`}>
                {delta > 0 ? '▲' : delta < 0 ? '▼' : ''} {Math.abs(delta)}% {t('vsPrevious')}
              </span>
            )}
          </div>
        </div>

        <div className="analytics-chart">
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label={t('trend')}>
            {chart.map((c, i) => {
              const h = Math.round(((H - pad * 2) * c.v) / max);
              const x = pad + i * (barW + barGap);
              const y = H - pad - h;
              return (
                <g key={i}>
                  <rect x={x} y={y} width={barW} height={h} rx="3" className="chart-bar" />
                  <text x={x + barW / 2} y={H - 8} textAnchor="middle" className="chart-label">
                    {format.dateTime(c.date, { month: 'narrow' })}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

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
