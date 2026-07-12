'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { ApiError, apiFetch } from '@/lib/api';
import { tokenStore } from '@/lib/auth';
import { Skeleton } from './Skeleton';
import { ScoreRing } from './ScoreRing';

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const TABS = ['overview', 'lessons', 'homework', 'notes', 'profile'] as const;
type Tab = (typeof TABS)[number];

interface Profile {
  id: string;
  cefrLevel?: string | null;
  goals?: string | null;
  nativeLanguage?: string | null;
  country?: string | null;
  address?: string | null;
  birthDate?: string | null;
  balanceCents?: number;
  user: { firstName: string; lastName: string; email: string; locale: string };
}
interface Note { id: string; body: string; createdAt: string }
interface Lesson { id: string; title?: string | null; startsAt: string; status: string }
interface Homework { id: string; title?: string | null; status: string; dueAt?: string | null; submissions: { grade?: string | null }[] }
interface Card { profile: Profile; lessons: Lesson[]; homework: Homework[]; notes: Note[] }

function ageFrom(birthDate?: string | null): number | null {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  const diff = Date.now() - b.getTime();
  return Math.floor(diff / (365.25 * 24 * 3600 * 1000));
}

export function StudentProfileView({ studentProfileId }: { studentProfileId: string }) {
  const t = useTranslations('studentProfile');
  const tApp = useTranslations('app');
  const te = useTranslations('enum');
  const th = useTranslations('homework');
  const locale = useLocale();
  const format = useFormatter();
  const router = useRouter();

  const [card, setCard] = useState<Card | null>(null);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [tab, setTab] = useState<Tab>('overview');
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

  if (state === 'loading') return <div className="content"><Skeleton lines={5} /></div>;
  if (state === 'error' || !card) return <div className="content"><p className="error">{tApp('loadError')}</p></div>;

  const { profile, lessons, homework, notes } = card;
  const name = `${profile.user.firstName} ${profile.user.lastName}`.trim();
  const initials = `${profile.user.firstName?.[0] ?? ''}${profile.user.lastName?.[0] ?? ''}`.toUpperCase() || '?';
  const age = ageFrom(profile.birthDate);
  const past = lessons.filter((l) => l.status === 'completed' || l.status === 'no_show');
  const completed = past.filter((l) => l.status === 'completed').length;
  const attendance = past.length ? Math.round((completed / past.length) * 100) : null;
  const hwStatus = (s: string) =>
    s === 'assigned' ? th('statusAssigned') : s === 'submitted' ? th('statusSubmitted') : th('statusGraded');

  return (
    <div className="content">
      <Link className="link" href="/students">← {t('back')}</Link>

      <div className="card profile-head">
        <div className="avatar" aria-hidden="true">{initials}</div>
        <div className="profile-head-main">
          <h2>{name}</h2>
          <div className="profile-chips">
            {profile.cefrLevel && <span className="level-chip">{profile.cefrLevel}</span>}
            <span className="muted">{profile.user.email}</span>
            {age !== null && <span className="muted">· {t('age')}: {age}</span>}
          </div>
        </div>
        <div className="profile-head-stats">
          <ScoreRing
            value={attendance ?? 0}
            display={attendance === null ? '—' : String(attendance)}
            label={t('attendance')}
            size={72}
          />
          <div className="metric">
            <span className="metric-value">
              {format.number((profile.balanceCents ?? 0) / 100, { style: 'currency', currency: 'EUR' })}
            </span>
            <span className="metric-label">{t('balance')}</span>
          </div>
        </div>
      </div>

      <div className="tabs tabs-inline" role="tablist">
        {TABS.map((tb) => (
          <button
            key={tb}
            type="button"
            role="tab"
            aria-selected={tab === tb}
            className={tab === tb ? 'active' : ''}
            onClick={() => setTab(tb)}
          >
            {t(tb)}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="card">
          <div className="grammar-table">
            <div className="grammar-row">
              <span className="grammar-key">{t('goals')}</span>
              <span>{profile.goals || '—'}</span>
            </div>
            <div className="grammar-row">
              <span className="grammar-key">{t('lessons')}</span>
              <span className="mono-num">{lessons.length}</span>
            </div>
            <div className="grammar-row">
              <span className="grammar-key">{t('homework')}</span>
              <span className="mono-num">{homework.length}</span>
            </div>
          </div>
        </div>
      )}

      {tab === 'lessons' && (
        <div className="card">
          {lessons.length === 0 ? (
            <p className="note">{t('noLessons')}</p>
          ) : (
            <ul className="lesson-list">
              {lessons.map((l) => (
                <li key={l.id}>
                  <span>{l.title ?? l.id}</span>
                  <span className="muted">
                    {format.dateTime(new Date(l.startsAt), { dateStyle: 'medium', timeStyle: 'short' })} ·{' '}
                    <span className={`chip status-${l.status}`}>{te(`lessonStatus.${l.status}`)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'homework' && (
        <div className="card">
          {homework.length === 0 ? (
            <p className="note">{t('noHomework')}</p>
          ) : (
            <ul className="lesson-list">
              {homework.map((h) => {
                const grade = h.submissions[0]?.grade;
                return (
                  <li key={h.id}>
                    <span>{h.title ?? h.id}</span>
                    <span className="muted">
                      {grade != null && grade !== '' ? <span className="mono-num">{grade}/10 · </span> : ''}
                      <span className={`chip status-${h.status}`}>{hwStatus(h.status)}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {tab === 'notes' && (
        <div className="card">
          <div className="inline-form">
            <input value={note} placeholder={t('noteBody')} onChange={(e) => setNote(e.target.value)} />
            <button type="button" disabled={busy || !note.trim()} onClick={addNote}>{t('addNote')}</button>
          </div>
          {notes.length === 0 ? (
            <p className="note">{t('noNotes')}</p>
          ) : (
            <ul className="lesson-list">
              {notes.map((n) => (
                <li key={n.id}>
                  <span>{n.body}</span>
                  <span className="muted">{format.dateTime(new Date(n.createdAt), { dateStyle: 'short' })}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'profile' && (
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
          <button type="submit" disabled={busy}>{busy ? t('save') : saved ? t('saved') : t('save')}</button>
        </form>
      )}
    </div>
  );
}
