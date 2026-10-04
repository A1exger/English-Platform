'use client';

import { useCallback, useEffect, useState } from 'react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { ApiError, apiFetch } from '@/lib/api';
import { fetchMe, tokenStore } from '@/lib/auth';
import { Skeleton } from './Skeleton';
import { PageHeader } from './PageHeader';
import { DataList } from './DataList';

interface Row {
  id: string;
  kind: string;
  topicTag: string | null;
  dueAt: string | null;
  status: string;
  cardCount: number;
  submittedCount: number;
  /** Handed-in essays with no score yet — the tutor's own to-do count. */
  awaitingReview: number;
  studentName?: string;
  result: { overall: number | null; completion: number; motivationTier: string } | null;
  /** Where the row opens. Content assignments and legacy homework differ. */
  href: string;
}

/** A homework from the older, exercise-based system, as the API returns it. */
interface LegacyHomework {
  id: string;
  title: string;
  status: 'assigned' | 'submitted' | 'graded' | string;
  dueAt?: string | null;
  createdAt?: string;
  studentName?: string;
  submissions: { grade?: string | null }[];
  exercises?: { status: string }[];
}

/**
 * Fold a legacy homework into an Assignments row.
 *
 * The status mapping is the one the dashboard's "graded" figure uses —
 * submitted is waiting on the tutor, graded is done — so the list and the
 * percentage can never disagree about what is left: every row that keeps the
 * figure below 100% is a row this list shows as waiting.
 */
function fromLegacy(h: LegacyHomework): Row {
  const exercises = h.exercises ?? [];
  const total = exercises.length || 1;
  const done = exercises.length
    ? exercises.filter((e) => e.status !== 'open').length
    : h.status === 'assigned'
      ? 0
      : 1;
  const grade = h.submissions[0]?.grade;
  const overall = grade != null && grade !== '' && !Number.isNaN(Number(grade)) ? Number(grade) : null;
  return {
    id: `hw-${h.id}`,
    href: `/homework/${h.id}`,
    kind: 'homework',
    topicTag: h.title,
    dueAt: h.dueAt ?? null,
    status: h.status === 'submitted' ? 'needs_review' : h.status === 'graded' ? 'done' : 'assigned',
    cardCount: total,
    submittedCount: done,
    awaitingReview: h.status === 'submitted' ? 1 : 0,
    studentName: h.studentName,
    result: overall === null ? null : { overall, completion: 100, motivationTier: '' }
  };
}

// Cabinet section for homework. Students see their content assignments; tutors
// see everything they handed out — content assignments AND homework from the
// older exercise system, which has no other way into a tutor's menu. Leaving it
// out made the dashboard's "graded" figure stick below 100% with every row in
// this list marked done.
export function AssignmentsView() {
  const t = useTranslations('assignments');
  const tApp = useTranslations('app');
  const locale = useLocale();
  const format = useFormatter();
  const router = useRouter();

  const [rows, setRows] = useState<Row[]>([]);
  const [isStudent, setIsStudent] = useState(false);
  const [phase, setPhase] = useState<'loading' | 'error' | 'ready'>('loading');

  const load = useCallback(async () => {
    const token = tokenStore.get();
    if (!token) {
      router.push('/');
      return;
    }
    try {
      const me = await fetchMe(token, locale);
      const student = me.role === 'student';
      setIsStudent(student);
      const [content, legacy] = await Promise.all([
        apiFetch<Omit<Row, 'href'>[]>('/assignments', { token, locale }),
        // Students already get legacy homework on their own Homework page.
        student ? Promise.resolve([]) : apiFetch<LegacyHomework[]>('/homework', { token, locale })
      ]);
      const contentRows: Row[] = content.map((r) => ({ ...r, href: `/assignments/${r.id}` }));
      setRows([...contentRows, ...legacy.map(fromLegacy)]);
      setPhase('ready');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        router.push('/');
        return;
      }
      setPhase('error');
    }
  }, [locale, router]);

  useEffect(() => {
    void load();
  }, [load]);

  if (phase === 'loading') return <div className="content"><Skeleton lines={5} /></div>;
  if (phase === 'error') return <div className="content"><p className="error">{tApp('loadError')}</p></div>;

  return (
    <div className="content">
      <PageHeader title={t('title')} />
      <DataList
        items={rows}
        getKey={(r) => r.id}
        listClassName="assign-list"
        searchText={(r) => `${r.topicTag ?? ''} ${r.studentName ?? ''} ${r.kind}`}
        sorts={[
          { key: 'due', label: t('due'), value: (r) => r.dueAt ?? '9999-12-31' },
          {
            key: 'progress',
            label: t('tasks'),
            value: (r) => (r.cardCount ? r.submittedCount / r.cardCount : 0),
            dir: 'desc'
          },
          // A tutor's actual working order: what is waiting to be read, first.
          ...(isStudent
            ? []
            : [
                {
                  key: 'review',
                  label: t('sortReview'),
                  value: (r: Row) => r.awaitingReview,
                  dir: 'desc' as const
                }
              ])
        ]}
        empty={{ title: t('empty') }}
        renderRow={(r) => (
          <Link className="assign-row" href={r.href}>
            <div className="assign-row-main">
              <strong>{r.topicTag || t(r.kind === 'homework' ? 'homework' : 'lesson')}</strong>
              <span className="muted">
                {!isStudent && r.studentName ? `${r.studentName} · ` : ''}
                {r.submittedCount}/{r.cardCount} · {t('tasks')}
                {r.dueAt ? ` · ${t('due')} ${format.dateTime(new Date(r.dueAt), { dateStyle: 'medium' })}` : ''}
              </span>
            </div>
            <div className="assign-row-side">
              {!isStudent && r.awaitingReview > 0 && (
                <span className="chip review-pill">
                  {t('awaitingReview', { count: r.awaitingReview })}
                </span>
              )}
              {r.result && r.result.overall !== null && (
                <span className="mono-num result-pill">{r.result.overall}</span>
              )}
              <span className={`chip status-${r.status}`}>{t(`status_${r.status}`)}</span>
            </div>
          </Link>
        )}
      />
    </div>
  );
}
