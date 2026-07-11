'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { ApiError, apiFetch } from '@/lib/api';
import { fetchMe, tokenStore } from '@/lib/auth';
import { Skeleton } from './Skeleton';

interface Row {
  id: string;
  kind: string;
  topicTag: string | null;
  dueAt: string | null;
  status: string;
  cardCount: number;
  submittedCount: number;
  studentName?: string;
  result: { overall: number | null; completion: number; motivationTier: string } | null;
}

// Cabinet section for the Skyeng-style content homework (ContentAssignment).
// Students see their assigned homework; tutors see what they handed out.
export function AssignmentsView() {
  const t = useTranslations('assignments');
  const tApp = useTranslations('app');
  const locale = useLocale();
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
      setIsStudent(me.role === 'student');
      setRows(await apiFetch<Row[]>('/assignments', { token, locale }));
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
      <h2>{t('title')}</h2>
      {rows.length === 0 ? (
        <p className="note">{t('empty')}</p>
      ) : (
        <ul className="assign-list">
          {rows.map((r) => (
            <li key={r.id}>
              <Link className="assign-row" href={`/assignments/${r.id}`}>
                <div className="assign-row-main">
                  <strong>{r.topicTag || t(r.kind === 'homework' ? 'homework' : 'lesson')}</strong>
                  <span className="muted">
                    {!isStudent && r.studentName ? `${r.studentName} · ` : ''}
                    {r.submittedCount}/{r.cardCount} · {t('tasks')}
                    {r.dueAt ? ` · ${t('due')} ${new Date(r.dueAt).toLocaleDateString(locale)}` : ''}
                  </span>
                </div>
                <div className="assign-row-side">
                  {r.result && r.result.overall !== null && (
                    <span className="mono-num result-pill">{r.result.overall}</span>
                  )}
                  <span className={`chip status-${r.status}`}>{t(`status_${r.status}`)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
