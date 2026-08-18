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
  isActive?: boolean;
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
  // Editing an existing account. `password` is optional here: blank = leave it.
  const [editing, setEditing] = useState<
    (UserRow & { password: string; isActive: boolean }) | null
  >(null);
  const [editError, setEditError] = useState('');
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

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    const token = tokenStore.get();
    if (!token || !editing) return;
    setBusy(true);
    setEditError('');
    try {
      await apiFetch(`/admin/users/${editing.id}`, {
        method: 'PATCH',
        token,
        locale,
        body: {
          email: editing.email,
          firstName: editing.firstName,
          lastName: editing.lastName,
          role: editing.role,
          locale: editing.locale,
          isActive: editing.isActive,
          // Only send a password when one was actually typed.
          ...(editing.password ? { password: editing.password } : {})
        }
      });
      setEditing(null);
      await load();
    } catch (err) {
      setEditError(err instanceof ApiError && err.status === 409 ? t('emailTaken') : tApp('loadError'));
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
        <span className="row-actions">
          <button
            type="button"
            className="ghost"
            disabled={busy}
            onClick={() => {
              setEditError('');
              setEditing({ ...u, password: '', isActive: u.isActive !== false });
            }}
          >
            {t('edit')}
          </button>
          <button type="button" className="ghost" disabled={busy} onClick={() => remove(u.id)}>
            {t('delete')}
          </button>
        </span>
      )
    }
  ];

  return (
    <div className="content">
      <PageHeader title={t('title')} primary={{ label: t('create'), onClick: () => setDrawerOpen(true) }} />

      <Drawer open={!!editing} onClose={() => setEditing(null)} title={t('editUser')}>
        {editing && (
          <form className="form-grid" onSubmit={saveEdit}>
            <label>
              {t('role')}
              <select
                value={editing.role}
                onChange={(e) => setEditing({ ...editing, role: e.target.value })}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {te(`role.${r}`)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('firstName')}
              <input
                value={editing.firstName}
                onChange={(e) => setEditing({ ...editing, firstName: e.target.value })}
              />
            </label>
            <label>
              {t('lastName')}
              <input
                value={editing.lastName}
                onChange={(e) => setEditing({ ...editing, lastName: e.target.value })}
              />
            </label>
            <label>
              {t('email')}
              <input
                type="email"
                value={editing.email}
                onChange={(e) => setEditing({ ...editing, email: e.target.value })}
              />
            </label>
            <label>
              {t('newPassword')}
              <input
                type="password"
                value={editing.password}
                placeholder={t('passwordUnchanged')}
                onChange={(e) => setEditing({ ...editing, password: e.target.value })}
              />
              <small className="muted">{t('passwordHint')}</small>
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={editing.isActive}
                onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })}
              />
              {t('active')}
            </label>
            {editError && <p className="error">{editError}</p>}
            <button type="submit" disabled={busy}>
              {busy ? '…' : t('save')}
            </button>
          </form>
        )}
      </Drawer>

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
