'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { ApiError, apiFetch } from '@/lib/api';
import { fetchMe, tokenStore } from '@/lib/auth';
import { Skeleton } from './Skeleton';
import { useToast } from './Toast';

interface UserRow {
  id: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
  locale: string;
  createdAt: string;
}

const ROLES = ['student', 'tutor', 'parent', 'admin'];

export function AdminUsersView() {
  const t = useTranslations('adminUsers');
  const tApp = useTranslations('app');
  const locale = useLocale();
  const format = useFormatter();
  const router = useRouter();
  const { showUndo } = useToast();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [state, setState] = useState<'loading' | 'error' | 'forbidden' | 'ready'>('loading');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    role: 'student',
    firstName: '',
    lastName: '',
    email: '',
    password: ''
  });

  const load = useCallback(async () => {
    const token = tokenStore.get();
    if (!token) {
      router.push('/');
      return;
    }
    try {
      const me = await fetchMe(token, locale);
      if (me.role !== 'admin') {
        setState('forbidden');
        return;
      }
      setUsers(await apiFetch<UserRow[]>('/admin/users', { token, locale }));
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

  async function create(e: FormEvent) {
    e.preventDefault();
    const token = tokenStore.get();
    if (!token) return;
    setBusy(true);
    try {
      await apiFetch('/admin/users', { method: 'POST', token, locale, body: form });
      setForm({ role: 'student', firstName: '', lastName: '', email: '', password: '' });
      await load();
    } finally {
      setBusy(false);
    }
  }

  // Optimistic + undoable. Deleting a user used to be one unconfirmed click.
  function remove(id: string) {
    setUsers((prev) => prev.filter((u) => u.id !== id));
    showUndo(t('deleted'), {
      onUndo: () => void load(),
      onCommit: async () => {
        const token = tokenStore.get();
        if (!token) return;
        await apiFetch(`/admin/users/${id}`, { method: 'DELETE', token, locale }).catch(
          () => undefined
        );
        await load();
      }
    });
  }

  if (state === 'loading') return <div className="content"><Skeleton lines={5} /></div>;
  if (state === 'forbidden') return <div className="content"><p className="error">{t('forbidden')}</p></div>;
  if (state === 'error') return <div className="content"><p className="error">{tApp('loadError')}</p></div>;

  return (
    <div className="content">
      <h2>{t('title')}</h2>

      <form className="card form-grid" onSubmit={create}>
        <strong>{t('newUser')}</strong>
        <label>
          {t('role')}
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('firstName')}
          <input required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
        </label>
        <label>
          {t('lastName')}
          <input required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
        </label>
        <label>
          {t('email')}
          <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </label>
        <label>
          {t('password')}
          <input
            type="password"
            required
            minLength={8}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? t('creating') : t('create')}
        </button>
      </form>

      <div className="card">
        {users.length === 0 ? (
          <p className="note">{t('empty')}</p>
        ) : (
          <ul className="lesson-list">
            {users.map((u) => (
              <li key={u.id}>
                <span>
                  {u.firstName} {u.lastName} <span className="muted">· {u.email}</span>
                </span>
                <span className="muted">
                  {u.role} · {format.dateTime(new Date(u.createdAt), { dateStyle: 'short' })}
                </span>
                <button type="button" disabled={busy} onClick={() => remove(u.id)}>
                  {t('delete')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
