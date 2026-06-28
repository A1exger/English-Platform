'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { ApiError, apiFetch } from '@/lib/api';
import { tokenStore } from '@/lib/auth';

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

interface Profile {
  id: string;
  cefrLevel?: string | null;
  goals?: string | null;
  nativeLanguage?: string | null;
  country?: string | null;
  address?: string | null;
  birthDate?: string | null;
  user: { firstName: string; lastName: string; email: string; locale: string };
}
interface Note { id: string; body: string; createdAt: string }
interface Lesson { id: string; title?: string | null; startsAt: string; status: string }
interface Card { profile: Profile; lessons: Lesson[]; notes: Note[] }

function ageFrom(birthDate?: string | null): number | null {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  const diff = Date.now() - b.getTime();
  return Math.floor(diff / (365.25 * 24 * 3600 * 1000));
}

export function StudentProfileView({ studentProfileId }: { studentProfileId: string }) {
  const t = useTranslations('studentProfile');
  const tApp = useTranslations('app');
  const locale = useLocale();
  const format = useFormatter();
  const router = useRouter();

  const [card, setCard] = useState<Card | null>(null);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [note, setNote] = useState('');
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    country: '',
    address: '',
    birthDate: '',
    cefrLevel: '',
    goals: ''
  });

  const load = useCallback(async () => {
    const token = tokenStore.get();
    if (!token) {
      router.push('/');
      return;
    }
    try {
      const c = await apiFetch<Card>(`/crm/students/${studentProfileId}`, { token, locale });
      setCard(c);
      setForm({
        firstName: c.profile.user.firstName ?? '',
        lastName: c.profile.user.lastName ?? '',
        country: c.profile.country ?? '',
        address: c.profile.address ?? '',
        birthDate: c.profile.birthDate ? c.profile.birthDate.slice(0, 10) : '',
        cefrLevel: c.profile.cefrLevel ?? '',
        goals: c.profile.goals ?? ''
      });
      setState('ready');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        router.push('/');
        return;
      }
      setState('error');
    }
  }, [locale, router, studentProfileId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(e: FormEvent) {
    e.preventDefault();
    const token = tokenStore.get();
    if (!token) return;
    setBusy(true);
    setSaved(false);
    try {
      await apiFetch(`/crm/students/${studentProfileId}`, {
        method: 'PATCH',
        token,
        locale,
        body: {
          firstName: form.firstName,
          lastName: form.lastName,
          country: form.country,
          address: form.address,
          birthDate: form.birthDate ? new Date(form.birthDate).toISOString() : undefined,
          cefrLevel: form.cefrLevel || undefined,
          goals: form.goals
        }
      });
      setSaved(true);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function addNote() {
    const token = tokenStore.get();
    if (!token || !note.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/crm/students/${studentProfileId}/notes`, {
        method: 'POST',
        token,
        locale,
        body: { body: note }
      });
      setNote('');
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (state === 'loading') return <div className="content"><p className="note">…</p></div>;
  if (state === 'error' || !card) return <div className="content"><p className="error">{tApp('loadError')}</p></div>;

  const age = ageFrom(card.profile.birthDate);

  return (
    <div className="content">
      <Link className="link" href="/students">← {t('back')}</Link>
      <h2>
        {card.profile.user.firstName} {card.profile.user.lastName}
        {age !== null && <span className="muted"> · {t('age')}: {age}</span>}
      </h2>
      <p className="muted">{card.profile.user.email}</p>

      <form className="card form-grid" onSubmit={save}>
        <strong>{t('title')}</strong>
        <label>{t('firstName')}<input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></label>
        <label>{t('lastName')}<input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></label>
        <label>{t('country')}<input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></label>
        <label>{t('address')}<input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
        <label>{t('birthDate')}<input type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} /></label>
        <label>
          {t('level')}
          <select value={form.cefrLevel} onChange={(e) => setForm({ ...form, cefrLevel: e.target.value })}>
            <option value="">—</option>
            {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </label>
        <label>{t('goals')}<input value={form.goals} onChange={(e) => setForm({ ...form, goals: e.target.value })} /></label>
        <button type="submit" disabled={busy}>{busy ? '…' : saved ? t('saved') : t('save')}</button>
      </form>

      <div className="card">
        <strong>{t('notes')}</strong>
        <div className="inline-form">
          <input value={note} placeholder={t('noteBody')} onChange={(e) => setNote(e.target.value)} />
          <button type="button" disabled={busy} onClick={addNote}>{t('save')}</button>
        </div>
        {card.notes.length === 0 ? (
          <p className="note">—</p>
        ) : (
          <ul className="lesson-list">
            {card.notes.map((n) => (
              <li key={n.id}>
                <span>{n.body}</span>
                <span className="muted">{format.dateTime(new Date(n.createdAt), { dateStyle: 'short' })}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <strong>{t('lessons')}</strong>
        {card.lessons.length === 0 ? (
          <p className="note">—</p>
        ) : (
          <ul className="lesson-list">
            {card.lessons.map((l) => (
              <li key={l.id}>
                <span>{l.title ?? l.id}</span>
                <span className="muted">
                  {format.dateTime(new Date(l.startsAt), { dateStyle: 'medium', timeStyle: 'short' })} · {l.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
