'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { ApiError, apiFetch } from '@/lib/api';
import { fetchMe, tokenStore } from '@/lib/auth';
import { Skeleton } from './Skeleton';
import { useToast } from './Toast';
import { PageHeader } from './PageHeader';
import { Drawer } from './Drawer';
import { DataTable, Column } from './DataTable';

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
  const { showUndo } = useToast();

  const [rows, setRows] = useState<Row[]>([]);
  const [role, setRole] = useState<string>('');
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [busy, setBusy] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [levelFilter, setLevelFilter] = useState('');
  const [email, setEmail] = useState('');
  const [newStudent, setNewStudent] = useState({ firstName: '', lastName: '', email: '', password: '' });

  const load = useCallback(async () => {
    const token = tokenStore.get();
    if (!token) {
      router.push('/');
      return;
    }
    try {
      const me = await fetchMe(token, locale);
      setRole(me.role);
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
      setDrawerOpen(false);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function createStudent(e: FormEvent) {
    e.preventDefault();
    const token = tokenStore.get();
    if (!token) return;
    setBusy(true);
    try {
      await apiFetch('/crm/students/new', { method: 'POST', token, locale, body: newStudent });
      setNewStudent({ firstName: '', lastName: '', email: '', password: '' });
      setDrawerOpen(false);
      await load();
    } finally {
      setBusy(false);
    }
  }

  // Optimistic + undoable. Removing a student used to be one unconfirmed click.
  function removeStudent(id: string) {
    setRows((prev) => prev.filter((r) => r.studentProfileId !== id));
    showUndo(t('deleted'), {
      onUndo: () => void load(),
      onCommit: async () => {
        const token = tokenStore.get();
        if (!token) return;
        await apiFetch(`/crm/students/${id}`, { method: 'DELETE', token, locale }).catch(
          () => undefined
        );
        await load();
      }
    });
  }

  if (state === 'loading') return <div className="content"><Skeleton lines={5} /></div>;
  if (state === 'error') return <div className="content"><p className="error">{tApp('loadError')}</p></div>;

  const isAdmin = role === 'admin';
  const isTutor = role === 'tutor';

  const canAdd = isAdmin || isTutor;

  const levels = Array.from(new Set(rows.map((r) => r.cefrLevel).filter((l): l is string => !!l)));
  const columns: Column<Row>[] = [
    {
      key: 'name',
      label: t('name'),
      sortValue: (r) => r.name.toLowerCase(),
      render: (r) => (
        <Link className="link" href={`/students/${r.studentProfileId}`}>{r.name}</Link>
      )
    },
    { key: 'level', label: t('level'), sortValue: (r) => r.cefrLevel ?? '', render: (r) => r.cefrLevel ?? '—' },
    {
      key: 'lessons',
      label: t('lessonsCount'),
      align: 'end',
      sortValue: (r) => r.lessonsCount,
      render: (r) => <span className="mono-num">{r.lessonsCount}</span>
    },
    {
      key: 'attendance',
      label: t('attendance'),
      align: 'end',
      sortValue: (r) => r.attendanceRate ?? -1,
      render: (r) => <span className="mono-num">{r.attendanceRate === null ? '—' : `${r.attendanceRate}%`}</span>
    },
    {
      key: 'balance',
      label: t('balance'),
      align: 'end',
      sortValue: (r) => r.balanceCents,
      render: (r) => (
        <span className="mono-num">
          {format.number(r.balanceCents / 100, { style: 'currency', currency: 'EUR' })}
        </span>
      )
    },
    {
      key: 'actions',
      label: '',
      align: 'end',
      render: (r) => (
        <button type="button" className="ghost" disabled={busy} onClick={() => removeStudent(r.studentProfileId)}>
          {isAdmin ? t('delete') : t('remove')}
        </button>
      )
    }
  ];

  return (
    <div className="content">
      <PageHeader
        title={t('title')}
        primary={canAdd ? { label: t('add'), onClick: () => setDrawerOpen(true) } : undefined}
      />

      {canAdd && (
        <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title={t('add')}>
          {isTutor && (
            <form className="form-grid" onSubmit={enroll}>
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
          <form className="form-grid" onSubmit={createStudent}>
            <strong>{t('create')}</strong>
            <label>{t('firstName')}<input required value={newStudent.firstName} onChange={(e) => setNewStudent({ ...newStudent, firstName: e.target.value })} /></label>
            <label>{t('lastName')}<input required value={newStudent.lastName} onChange={(e) => setNewStudent({ ...newStudent, lastName: e.target.value })} /></label>
            <label>{t('email')}<input type="email" required value={newStudent.email} onChange={(e) => setNewStudent({ ...newStudent, email: e.target.value })} /></label>
            <label>{t('password')}<input type="password" required minLength={8} value={newStudent.password} onChange={(e) => setNewStudent({ ...newStudent, password: e.target.value })} /></label>
            <button type="submit" disabled={busy}>{busy ? t('adding') : t('create')}</button>
          </form>
        </Drawer>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        getKey={(r) => r.studentProfileId}
        searchText={(r) => `${r.name} ${r.email} ${r.country ?? ''}`}
        filter={{
          label: t('level'),
          value: levelFilter,
          options: levels.map((l) => ({ value: l, label: l })),
          onChange: setLevelFilter
        }}
        filterFn={levelFilter ? (r) => r.cefrLevel === levelFilter : undefined}
        empty={{
          title: t('empty'),
          action: canAdd ? { label: t('add'), onClick: () => setDrawerOpen(true) } : undefined
        }}
      />
    </div>
  );
}
