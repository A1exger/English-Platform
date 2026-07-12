'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { ApiError, apiFetch } from '@/lib/api';
import { fetchMe, tokenStore } from '@/lib/auth';
import { Skeleton } from './Skeleton';
import { useToast } from './Toast';
import { PageHeader } from './PageHeader';
import { Drawer } from './Drawer';
import { DataTable, Column } from './DataTable';

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
  const te = useTranslations('enum');
  const locale = useLocale();
  const format = useFormatter();
  const router = useRouter();
  const { showUndo } = useToast();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [state, setState] = useState<'loading' | 'error' | 'forbidden' | 'ready'>('loading');
  const [busy, setBusy] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [roleFilter, setRoleFilter] = useState('');
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
      setDrawerOpen(false);
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

  const columns: Column<UserRow>[] = [
    {
      key: 'name',
      label: t('name'),
      sortValue: (u) => `${u.lastName} ${u.firstName}`.toLowerCase(),
      render: (u) => <span>{u.firstName} {u.lastName}</span>
    },
    { key: 'email', label: t('email'), sortValue: (u) => u.email.toLowerCase(), render: (u) => <span className="muted">{u.email}</span> },
    { key: 'role', label: t('role'), sortValue: (u) => u.role, render: (u) => te(`role.${u.role}`) },
    {
      key: 'created',
      label: t('created'),
      align: 'end',
      sortValue: (u) => u.createdAt,
      render: (u) => <span className="mono-num">{format.dateTime(new Date(u.createdAt), { dateStyle: 'short' })}</span>
    },
    {
      key: 'actions',
      label: '',
      align: 'end',
      render: (u) => (
        <button type="button" className="ghost" disabled={busy} onClick={() => remove(u.id)}>
          {t('delete')}
        </button>
      )
    }
  ];

  return (
    <div className="content">
      <PageHeader title={t('title')} primary={{ label: t('create'), onClick: () => setDrawerOpen(true) }} />

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title={t('newUser')}>
        <form className="form-grid" onSubmit={create}>
          <label>
            {t('role')}
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {te(`role.${r}`)}
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
      </Drawer>

      <DataTable
        columns={columns}
        rows={users}
        getKey={(u) => u.id}
        searchText={(u) => `${u.firstName} ${u.lastName} ${u.email}`}
        filter={{
          label: t('role'),
          value: roleFilter,
          options: ROLES.map((r) => ({ value: r, label: te(`role.${r}`) })),
          onChange: setRoleFilter
        }}
        filterFn={roleFilter ? (u) => u.role === roleFilter : undefined}
        empty={{ title: t('empty'), action: { label: t('create'), onClick: () => setDrawerOpen(true) } }}
      />
    </div>
  );
}
