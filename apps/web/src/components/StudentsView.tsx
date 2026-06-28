'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { ApiError, apiFetch } from '@/lib/api';
import { fetchMe, tokenStore } from '@/lib/auth';

interface Row {
  studentProfileId: string;
  name: string;
  email: string;
  country?: string | null;
  cefrLevel?: string | null;
  balanceCents: number;
  lessonsCount: number;
  attendanceRate: number | null;
}

export function StudentsView() {
  const t = useTranslations('students');
  const tApp = useTranslations('app');
  const locale = useLocale();
  const format = useFormatter();
  const router = useRouter();

  const [rows, setRows] = useState<Row[]>([]);
  const [isTutor, setIsTutor] = useState(false);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');

  const load = useCallback(async () => {
    const token = tokenStore.get();
    if (!token) {
      router.push('/');
      return;
    }
    try {
      const me = await fetchMe(token, locale);
      setIsTutor(me.role === 'tutor');
      setRows(await apiFetch<Row[]>('/crm/students', { token, locale }));
      setState('ready');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        router.push('/');
        return;
      }
      setState('error');
    }
  }, [locale, router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function enroll(e: FormEvent) {
    e.preventDefault();
    const token = tokenStore.get();
    if (!token) return;
    setBusy(true);
    try {
      await apiFetch('/crm/students', { method: 'POST', token, locale, body: { email } });
      setEmail('');
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (state === 'loading') return <div className="content"><p className="note">…</p></div>;
  if (state === 'error') return <div className="content"><p className="error">{tApp('loadError')}</p></div>;

  return (
    <div className="content">
      <h2>{t('title')}</h2>

      {isTutor && (
        <form className="card form-grid" onSubmit={enroll}>
          <strong>{t('enroll')}</strong>
          <label>
            {t('email')}
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <button type="submit" disabled={busy}>
            {busy ? t('adding') : t('add')}
          </button>
        </form>
      )}

      <div className="card">
        {rows.length === 0 ? (
          <p className="note">{t('empty')}</p>
        ) : (
          <ul className="lesson-list">
            {rows.map((r) => (
              <li key={r.studentProfileId}>
                <Link className="link" href={`/students/${r.studentProfileId}`}>
                  {r.name}
                </Link>
                <span className="muted">
                  {r.country ? `${r.country} · ` : ''}
                  {r.cefrLevel ?? '—'} · {t('lessonsCount')}: {r.lessonsCount} ·{' '}
                  {r.attendanceRate === null ? '—' : `${r.attendanceRate}%`} ·{' '}
                  {format.number(r.balanceCents / 100, { style: 'currency', currency: 'EUR' })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
