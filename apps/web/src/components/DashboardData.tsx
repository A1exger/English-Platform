'use client';

import { useCallback, useEffect, useState } from 'react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { ApiError, apiFetch } from '@/lib/api';
import { fetchMe, Me, tokenStore } from '@/lib/auth';
import { EmptyState } from './EmptyState';
import { Skeleton } from './Skeleton';
import { Icon } from './Icon';

interface Lesson {
  id: string;
  title?: string | null;
  startsAt: string;
  status: string;
}
// Teacher KPI trio from GET /analytics/overview.
interface Overview {
  activeStudents: number;
  hoursThisWeek: number;
  assignmentsGradedPct: number | null;
}

type State = 'loading' | 'unauth' | 'error' | 'ready';

// Broadsheet Overview. Teachers get a workload dashboard (stats + upcoming +
// quick actions); students see only their upcoming lesson(s) — progress, courses
// and homework each live on their own tab.
export function DashboardData() {
  const tApp = useTranslations('app');
  const tDash = useTranslations('dashboard');
  const locale = useLocale();
  const format = useFormatter();

  const [me, setMe] = useState<Me | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [state, setState] = useState<State>('loading');

  const load = useCallback(
    async (silent = false) => {
      const token = tokenStore.get();
      if (!token) {
        if (!silent) setState('unauth');
        return;
      }
      try {
        const profile = await fetchMe(token, locale);
        setMe(profile);
        const list = await apiFetch<Lesson[]>('/lessons', { token, locale });
        setLessons(list);
        // Teacher/admin stat cards; students don't need them here.
        if (profile.role !== 'student') {
          setOverview(
            await apiFetch<Overview>('/analytics/overview', { token, locale }).catch(() => null)
          );
        }
        setState('ready');
      } catch (e) {
        if (!silent) setState(e instanceof ApiError && e.status === 401 ? 'unauth' : 'error');
      }
    },
    [locale]
  );

  useEffect(() => {
    void load();
    // Re-fetch when the tab/page regains focus so a lesson changed elsewhere
    // (e.g. on the schedule) is reflected here without a hard reload.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load(true);
    };
    const onFocus = () => void load(true);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  if (state === 'loading') return <div className="content"><Skeleton lines={4} /></div>;
  if (state === 'unauth')
    return (
      <p className="note">
        {tApp('loginPrompt')} <Link href="/">→</Link>
      </p>
    );
  if (state === 'error') return <p className="error">{tApp('loadError')}</p>;

  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  // A lesson stays on the overview until 24h after it starts, then drops off.
  const relevant = [...lessons]
    .filter((l) => new Date(l.startsAt).getTime() >= now - DAY)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  // Soonest upcoming lesson (or a just-started one still in its 24h window).
  const next = relevant.find((l) => new Date(l.startsAt).getTime() >= now) ?? relevant[0];
  const upcoming = relevant.filter((l) => new Date(l.startsAt).getTime() >= now);
  const dt = (s: string) => format.dateTime(new Date(s), { dateStyle: 'medium', timeStyle: 'short' });
  const greeting = tDash('greeting', { name: me?.firstName ?? '' });

  // ——— Student: only the upcoming lesson(s) ———
  if (me?.role === 'student') {
    return (
      <div className="content">
        <div className="overview-head">
          <h2>{greeting}</h2>
        </div>
        {next ? (
          <div className="card hero-lesson">
            <div className="hero-lesson-main">
              <span className="hero-kicker">{tDash('nextLesson')}</span>
              <strong className="hero-title">{next.title ?? next.id}</strong>
              <span className="muted">{dt(next.startsAt)}</span>
            </div>
            <Link href={`/lessons/${next.id}/room`} className="cta-primary">
              {tDash('joinLesson')}
            </Link>
          </div>
        ) : (
          <div className="card">
            <EmptyState title={tDash('noLessons')} />
          </div>
        )}
        {upcoming.length > 1 && (
          <div className="card">
            <div className="card-kicker">{tDash('upcomingLessons')}</div>
            <ul className="lesson-list">
              {upcoming.slice(1, 5).map((l) => (
                <li key={l.id}>
                  <span>{l.title ?? l.id}</span>
                  <span className="muted">{dt(l.startsAt)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  // ——— Teacher / admin: stats + upcoming + quick actions ———
  const pct = overview?.assignmentsGradedPct;
  return (
    <div className="content">
      <div className="overview-head">
        <h2>{greeting}</h2>
        <Link href="/schedule" className="cta-primary">
          <Icon name="calendar-plus" size={16} /> {tDash('bookLesson')}
        </Link>
      </div>

      <div className="stat-grid">
        <div className="card stat-card">
          <Icon name="users" size={26} className="stat-ic" />
          <div>
            <div className="stat-value">{overview?.activeStudents ?? 0}</div>
            <div className="stat-label">{tDash('activeStudents')}</div>
          </div>
        </div>
        <div className="card stat-card">
          <Icon name="clock" size={26} className="stat-ic" />
          <div>
            <div className="stat-value">{overview?.hoursThisWeek ?? 0}h</div>
            <div className="stat-label">{tDash('thisWeek')}</div>
          </div>
        </div>
        <div className="card stat-card">
          <Icon name="check-circle" size={26} className="stat-ic alt" />
          <div>
            <div className="stat-value">{pct == null ? '—' : `${pct}%`}</div>
            <div className="stat-label">{tDash('graded')}</div>
          </div>
        </div>
      </div>

      <div className="card-kicker">{tDash('upcomingLessons')}</div>
      {upcoming.length === 0 ? (
        <div className="card upcoming-empty" style={{ marginBlockEnd: 30 }}>
          <Icon name="calendar" size={20} />
          <span>{tDash('calendarClear')}</span>
        </div>
      ) : (
        <div className="card" style={{ marginBlockEnd: 30 }}>
          <ul className="lesson-list">
            {upcoming.slice(0, 5).map((l) => (
              <li key={l.id}>
                <span>{l.title ?? l.id}</span>
                <span className="lesson-list-side">
                  <span className="muted">{dt(l.startsAt)}</span>
                  <Link href={`/lessons/${l.id}/room`} className="link">
                    {tDash('joinLesson')}
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card-kicker">{tDash('quickActions')}</div>
      <div className="qa-grid">
        <Link href="/assignments" className="card qa-card">
          <Icon name="clipboard" size={22} className="qa-ic" />
          <span className="qa-label">{tDash('reviewAssignments')}</span>
        </Link>
        <Link href="/exercises" className="card qa-card">
          <Icon name="edit" size={22} className="qa-ic" />
          <span className="qa-label">{tDash('buildExercise')}</span>
        </Link>
        <Link href="/analytics" className="card qa-card">
          <Icon name="chart" size={22} className="qa-ic" />
          <span className="qa-label">{tDash('viewAnalytics')}</span>
        </Link>
      </div>
    </div>
  );
}
