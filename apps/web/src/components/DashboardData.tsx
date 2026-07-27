'use client';

import { useCallback, useEffect, useState } from 'react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { ApiError, apiFetch } from '@/lib/api';
import { fetchMe, Me, tokenStore } from '@/lib/auth';
import { ScoreRing } from './ScoreRing';
import { EmptyState } from './EmptyState';
import { Skeleton } from './Skeleton';

interface Lesson {
  id: string;
  title?: string | null;
  startsAt: string;
  status: string;
}
interface Homework {
  id: string;
  title?: string | null;
  status: string;
  dueAt?: string | null;
}
interface Progress {
  cefrLevel: string | null;
  lessonsCompleted: number;
  attendanceRate: number | null;
}
interface CourseProgress {
  courseId: string;
  title: string;
  level: string;
  courseCompletion: number; // 0–100 %
  lessonsDone: number;
  lessonsRequired: number;
}
interface ContentProgress {
  overall: { goalProgress: number | null };
  courses: CourseProgress[];
}

type State = 'loading' | 'unauth' | 'error' | 'ready';

// Editorial Overview: one primary action (join the next lesson), the signature
// goal ring, a few metrics, then homework + upcoming — all from real endpoints.
export function DashboardData() {
  const tApp = useTranslations('app');
  const tDash = useTranslations('dashboard');
  const locale = useLocale();
  const format = useFormatter();

  const [me, setMe] = useState<Me | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [homework, setHomework] = useState<Homework[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [goal, setGoal] = useState<number | null>(null);
  const [courses, setCourses] = useState<CourseProgress[]>([]);
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
        if (profile.role === 'student') {
          const [hw, pr, cp] = await Promise.all([
            apiFetch<Homework[]>('/homework', { token, locale }).catch(() => [] as Homework[]),
            apiFetch<Progress>('/analytics/progress', { token, locale }).catch(() => null),
            apiFetch<ContentProgress>('/content/progress', { token, locale }).catch(() => null)
          ]);
          setHomework(hw);
          setProgress(pr);
          setGoal(cp?.overall.goalProgress ?? null);
          setCourses(cp?.courses ?? []);
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
    // Re-fetch when the tab/page regains focus so a lesson deleted elsewhere
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
  // The hero is the soonest upcoming lesson; if none, a just-started one still
  // showing within its 24h window (so you can still join a lesson you're late to).
  const next = relevant.find((l) => new Date(l.startsAt).getTime() >= now) ?? relevant[0];
  const rest = relevant
    .filter((l) => l.id !== next?.id && new Date(l.startsAt).getTime() >= now)
    .slice(0, 3);
  const pendingHw = homework.filter((h) => h.status !== 'graded');
  const dt = (s: string) => format.dateTime(new Date(s), { dateStyle: 'medium', timeStyle: 'short' });
  const isStudent = me?.role === 'student';
  // Courses the student has started but not finished — the Skyeng «continue»
  // entry point back into a course, most-progressed first.
  const continuing = courses
    .filter((c) => c.courseCompletion > 0 && c.courseCompletion < 100)
    .sort((a, b) => b.courseCompletion - a.courseCompletion);

  return (
    <div className="content">
      <div className="overview-head">
        <h2>{tDash('greeting', { name: me?.firstName ?? '' })}</h2>
      </div>

      {next && (
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
      )}

      {!next && (
        <div className="card">
          {/* Students don't self-book — the tutor schedules lessons. They only
              need to see upcoming ones, so no booking CTA here. */}
          <EmptyState
            title={tDash('noLessons')}
            action={isStudent ? undefined : { label: tDash('bookLesson'), href: '/schedule' }}
          />
        </div>
      )}

      {isStudent && (
        <div className="card stats-row">
          <ScoreRing
            value={(goal ?? 0) * 10}
            display={goal === null ? '—' : String(goal)}
            label={tDash('goal')}
          />
          <div className="stats-metrics">
            <div className="metric">
              <span className="metric-value">{progress?.cefrLevel ?? '—'}</span>
              <span className="metric-label">{tDash('level')}</span>
            </div>
            <div className="metric">
              <span className="metric-value">{progress?.lessonsCompleted ?? 0}</span>
              <span className="metric-label">{tDash('lessonsDone')}</span>
            </div>
            <div className="metric">
              <span className="metric-value">
                {progress?.attendanceRate == null ? '—' : `${progress.attendanceRate}%`}
              </span>
              <span className="metric-label">{tDash('attendance')}</span>
            </div>
          </div>
        </div>
      )}

      {isStudent && continuing.length > 0 && (
        <div className="card">
          <div className="row-between">
            <strong>{tDash('continueLearning')}</strong>
            <Link href="/courses" className="link">
              {tDash('seeAll')}
            </Link>
          </div>
          <div className="continue-row">
            {continuing.map((c) => (
              <Link key={c.courseId} href={`/courses/${c.courseId}`} className="continue-card">
                <div className="continue-cover">
                  <span className="continue-level">{c.level}</span>
                  <span className="continue-pct mono-num">{c.courseCompletion}%</span>
                </div>
                <div className="continue-body">
                  <strong className="continue-title">{c.title}</strong>
                  <div className="result-bar">
                    <div
                      className="result-bar-fill"
                      style={{ inlineSize: `${c.courseCompletion}%` }}
                    />
                  </div>
                  <span className="muted continue-meta">
                    {c.lessonsDone}/{c.lessonsRequired}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {isStudent && pendingHw.length > 0 && (
        <div className="card">
          <div className="row-between">
            <strong>{tDash('homework')}</strong>
            <Link href="/homework" className="link">
              {tDash('seeAll')}
            </Link>
          </div>
          <ul className="assign-list">
            {pendingHw.slice(0, 3).map((h) => (
              <li key={h.id} className="assign-row" style={{ cursor: 'default' }}>
                <div className="assign-row-main">
                  <span>{h.title ?? h.id}</span>
                </div>
                <div className="assign-row-side">
                  <span className={`chip status-${h.status}`}>{h.status}</span>
                  {h.dueAt && <span className="mono-num muted">{dt(h.dueAt)}</span>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {rest.length > 0 && (
        <div className="card">
          <strong>{tDash('upcoming')}</strong>
          <ul className="lesson-list">
            {rest.map((l) => (
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
