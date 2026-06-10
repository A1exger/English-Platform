'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { ApiError, apiFetch } from '@/lib/api';
import { tokenStore } from '@/lib/auth';

interface Row {
  studentProfileId: string;
  name: string;
  email: string;
  cefrLevel?: string | null;
  balanceCents: number;
  lessonsCount: number;
  attendanceRate: number | null;
}
interface Note {
  id: string;
  body: string;
  createdAt: string;
}
interface Card {
  notes: Note[];
}

export function StudentsView() {
  const t = useTranslations('students');
  const tApp = useTranslations('app');
  const locale = useLocale();
  const format = useFormatter();
  const router = useRouter();

  const [rows, setRows] = useState<Row[]>([]);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    const token = tokenStore.get();
    if (!token) {
      router.push('/');
      return;
    }
    try {
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

  async function openCard(id: string) {
    const token = tokenStore.get();
    if (!token) return;
    setSelected(id);
    setCard(await apiFetch<Card>(`/crm/students/${id}`, { token, locale }));
  }

  async function addNote() {
    const token = tokenStore.get();
    if (!token || !selected || !note.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/crm/students/${selected}/notes`, {
        method: 'POST',
        token,
        locale,
        body: { body: note }
      });
      setNote('');
      await openCard(selected);
    } finally {
      setBusy(false);
    }
  }

  if (state === 'loading') return <div className="content"><p className="note">…</p></div>;
  if (state === 'error') return <div className="content"><p className="error">{tApp('loadError')}</p></div>;

  return (
    <div className="content">
      <h2>{t('title')}</h2>

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

      <div className="card">
        {rows.length === 0 ? (
          <p className="note">{t('empty')}</p>
        ) : (
          <ul className="lesson-list">
            {rows.map((r) => (
              <li key={r.studentProfileId}>
                <span>
                  {r.name} <span className="muted">· {r.cefrLevel ?? '—'}</span>
                </span>
                <span className="muted">
                  {t('lessonsCount')}: {r.lessonsCount} · {t('attendance')}:{' '}
                  {r.attendanceRate === null ? '—' : `${r.attendanceRate}%`} ·{' '}
                  {format.number(r.balanceCents / 100, { style: 'currency', currency: 'EUR' })}
                </span>
                <button type="button" onClick={() => openCard(r.studentProfileId)}>
                  {t('openCard')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selected && card && (
        <div className="card">
          <strong>{t('notes')}</strong>
          <div className="inline-form">
            <input value={note} placeholder={t('noteBody')} onChange={(e) => setNote(e.target.value)} />
            <button type="button" disabled={busy} onClick={addNote}>
              {t('save')}
            </button>
          </div>
          {card.notes.length === 0 ? (
            <p className="note">{t('empty')}</p>
          ) : (
            <ul className="lesson-list">
              {card.notes.map((n) => (
                <li key={n.id}>
                  <span>{n.body}</span>
                  <span className="muted">
                    {format.dateTime(new Date(n.createdAt), { dateStyle: 'short' })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
