'use client';

import { useEffect, useState } from 'react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { ApiError, apiFetch } from '@/lib/api';
import { fetchMe, Me, tokenStore } from '@/lib/auth';

interface Lesson {
  id: string;
  title?: string | null;
  startsAt: string;
  status: string;
}

type State = 'loading' | 'unauth' | 'error' | 'ready';

// Client component: reads the stored token and loads the signed-in user's real
// profile + lessons from the API. Every label is localized; the lesson times
// are formatted in the user's locale.
export function DashboardData() {
  const tApp = useTranslations('app');
  const tDash = useTranslations('dashboard');
  const locale = useLocale();
  const format = useFormatter();
  const router = useRouter();

  const [me, setMe] = useState<Me | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [hwPending, setHwPending] = useState(0);
  const [state, setState] = useState<State>('loading');

  useEffect(() => {
    const token = tokenStore.get();
    if (!token) {
      setState('unauth');
      return;
    }
    (async () => {
      try {
        const profile = await fetchMe(token, locale);
        setMe(profile);
        const list = await apiFetch<Lesson[]>('/lessons', { token, locale });
        setLessons(list);
        if (profile.role === 'student') {
          const hw = await apiFetch<{ status: string }[]>('/homework', { token, locale }).catch(() => []);
          setHwPending(hw.filter((h) => h.status !== 'graded').length);
        }
        setState('ready');
      } catch (e) {
        setState(e instanceof ApiError && e.status === 401 ? 'unauth' : 'error');
      }
    })();
  }, [locale]);

  if (state === 'loading') {
    return <p className="note">…</p>;
  }
  if (state === 'unauth') {
    return (
      <p className="note">
        {tApp('loginPrompt')} <Link href="/">→</Link>
      </p>
    );
  }
  if (state === 'error') {
    return <p className="error">{tApp('loadError')}</p>;
  }

  return (
    <div className="content">
      <h2>{tDash('greeting', { name: me?.firstName ?? '' })}</h2>

      {hwPending > 0 && (
        <Link href="/homework" className="banner">
          🔔 {tDash('homeworkPending', { count: hwPending })}
        </Link>
      )}

      <div className="card">
        <strong>{tApp('upcomingLessons')}</strong>
        {lessons.length === 0 ? (
          <p className="note">{tApp('noLessons')}</p>
        ) : (
          <ul className="lesson-list">
            {lessons.map((l) => (
              <li key={l.id}>
                <span>{l.title ?? l.id}</span>
                <span className="muted">
                  {format.dateTime(new Date(l.startsAt), {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}{' '}
                  · {l.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="note">{tDash('everyoneOwnLanguage')}</p>
    </div>
  );
}
