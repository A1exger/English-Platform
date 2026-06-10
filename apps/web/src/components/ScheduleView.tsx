'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { ApiError, apiFetch } from '@/lib/api';
import { fetchMe, Me, tokenStore } from '@/lib/auth';

interface Lesson {
  id: string;
  title?: string | null;
  startsAt: string;
  endsAt: string;
  status: string;
}

export function ScheduleView() {
  const t = useTranslations('schedule');
  const tApp = useTranslations('app');
  const locale = useLocale();
  const format = useFormatter();
  const router = useRouter();

  const [me, setMe] = useState<Me | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', start: '', end: '', price: '2500' });

  const load = useCallback(async () => {
    const token = tokenStore.get();
    if (!token) {
      router.push('/');
      return;
    }
    try {
      const [profile, list] = await Promise.all([
        fetchMe(token, locale),
        apiFetch<Lesson[]>('/lessons', { token, locale })
      ]);
      setMe(profile);
      setLessons(list);
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

  async function createLesson(e: FormEvent) {
    e.preventDefault();
    const token = tokenStore.get();
    if (!token) return;
    setSaving(true);
    try {
      await apiFetch('/lessons', {
        method: 'POST',
        token,
        locale,
        body: {
          title: form.title || undefined,
          startsAt: new Date(form.start).toISOString(),
          endsAt: new Date(form.end).toISOString(),
          priceCents: Number(form.price) || 0
        }
      });
      setForm({ title: '', start: '', end: '', price: '2500' });
      await load();
    } catch {
      /* surfaced via reload */
    } finally {
      setSaving(false);
    }
  }

  if (state === 'loading') return <div className="content"><p className="note">…</p></div>;
  if (state === 'error')
    return <div className="content"><p className="error">{tApp('loadError')}</p></div>;

  return (
    <div className="content">
      <h2>{t('title')}</h2>

      {me?.role === 'tutor' && (
        <form className="card form-grid" onSubmit={createLesson}>
          <strong>{t('newLesson')}</strong>
          <label>
            {t('titleField')}
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </label>
          <label>
            {t('start')}
            <input
              type="datetime-local"
              required
              value={form.start}
              onChange={(e) => setForm({ ...form, start: e.target.value })}
            />
          </label>
          <label>
            {t('end')}
            <input
              type="datetime-local"
              required
              value={form.end}
              onChange={(e) => setForm({ ...form, end: e.target.value })}
            />
          </label>
          <label>
            {t('price')}
            <input
              type="number"
              min={0}
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
            />
          </label>
          <button type="submit" disabled={saving}>
            {saving ? t('creating') : t('create')}
          </button>
        </form>
      )}

      <div className="card">
        {lessons.length === 0 ? (
          <p className="note">{t('empty')}</p>
        ) : (
          <ul className="lesson-list">
            {lessons.map((l) => (
              <li key={l.id}>
                <span>{l.title ?? l.id}</span>
                <span className="muted">
                  {format.dateTime(new Date(l.startsAt), {
                    dateStyle: 'medium',
                    timeStyle: 'short'
                  })}{' '}
                  · {l.status}
                </span>
                <Link className="link" href={`/lessons/${l.id}/board`}>
                  {t('openBoard')} →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
