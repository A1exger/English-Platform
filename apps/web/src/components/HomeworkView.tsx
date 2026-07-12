'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { ApiError, apiFetch } from '@/lib/api';
import { fetchMe, Me, tokenStore } from '@/lib/auth';
import { Skeleton } from './Skeleton';
import { Drawer } from './Drawer';
import { ScoreRing } from './ScoreRing';
import { PageHeader } from './PageHeader';
import { DataList } from './DataList';

interface Submission {
  id: string;
  grade?: string | null;
}
interface Homework {
  id: string;
  title: string;
  status: string;
  dueAt?: string | null;
  submissions: Submission[];
}
interface StudentRow {
  studentProfileId: string;
  name: string;
}

const TABS = ['all', 'todo', 'submitted', 'graded'] as const;
type Tab = (typeof TABS)[number];

// Sprint 2.1: the list is only a list. One scannable row per homework — title,
// due date (mono, marked overdue), status chip, a score ring when graded — that
// links to the work screen (/homework/[id]). No inline exercise players (they
// were an N+1 inside a list). Assigning happens in a drawer. Staff = tutor OR
// admin (the old form was gated on tutor only, so admins saw nothing).
export function HomeworkView() {
  const t = useTranslations('homework');
  const tApp = useTranslations('app');
  const locale = useLocale();
  const format = useFormatter();
  const router = useRouter();

  const [me, setMe] = useState<Me | null>(null);
  const [items, setItems] = useState<Homework[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>('all');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState({ studentProfileId: '', title: '', due: '' });

  const load = useCallback(async () => {
    const token = tokenStore.get();
    if (!token) {
      router.push('/');
      return;
    }
    try {
      const profile = await fetchMe(token, locale);
      setMe(profile);
      setItems(await apiFetch<Homework[]>('/homework', { token, locale }));
      if (profile.role === 'tutor' || profile.role === 'admin') {
        setStudents(await apiFetch<StudentRow[]>('/crm/students', { token, locale }).catch(() => []));
      }
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

  async function assign(e: FormEvent) {
    e.preventDefault();
    const token = tokenStore.get();
    if (!token) return;
    setBusy(true);
    try {
      await apiFetch('/homework', {
        method: 'POST',
        token,
        locale,
        body: {
          studentProfileId: form.studentProfileId,
          title: form.title,
          dueAt: form.due ? new Date(form.due).toISOString() : undefined
        }
      });
      setForm({ studentProfileId: '', title: '', due: '' });
      setDrawerOpen(false);
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (state === 'loading') return <div className="content"><Skeleton lines={5} /></div>;
  if (state === 'error') return <div className="content"><p className="error">{tApp('loadError')}</p></div>;

  const isStaff = me?.role === 'tutor' || me?.role === 'admin';
  const statusLabel = (s: string) =>
    s === 'assigned' ? t('statusAssigned') : s === 'submitted' ? t('statusSubmitted') : t('statusGraded');
  const filtered = items.filter((h) =>
    tab === 'all'
      ? true
      : tab === 'todo'
        ? h.status === 'assigned'
        : tab === 'submitted'
          ? h.status === 'submitted'
          : h.status === 'graded'
  );
  const now = Date.now();

  return (
    <div className="content">
      <PageHeader
        title={t('title')}
        primary={isStaff ? { label: t('assign'), onClick: () => setDrawerOpen(true) } : undefined}
      />

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
            {t(`tab_${tb}`)}
          </button>
        ))}
      </div>

      <DataList
        items={filtered}
        getKey={(h) => h.id}
        listClassName="assign-list"
        searchText={(h) => h.title}
        sorts={[
          { key: 'due', label: t('due'), value: (h) => h.dueAt ?? '9999-12-31' },
          { key: 'title', label: t('titleField'), value: (h) => h.title.toLowerCase() }
        ]}
        empty={{
          title: t('empty'),
          action: isStaff ? { label: t('assign'), onClick: () => setDrawerOpen(true) } : undefined
        }}
        renderRow={(h) => {
          const grade = h.submissions[0]?.grade;
          const graded = h.status === 'graded' && grade != null && grade !== '';
          const overdue = !!h.dueAt && h.status === 'assigned' && new Date(h.dueAt).getTime() < now;
          return (
            <Link className="assign-row" href={`/homework/${h.id}`}>
              <div className="assign-row-main">
                <strong>{h.title}</strong>
                {h.dueAt && (
                  <span className={`mono-num${overdue ? ' overdue' : ' muted'}`}>
                    {t('due')} {format.dateTime(new Date(h.dueAt), { dateStyle: 'medium' })}
                    {overdue ? ` · ${t('overdue')}` : ''}
                  </span>
                )}
              </div>
              <div className="assign-row-side">
                {graded && <ScoreRing value={Number(grade) * 10} display={String(grade)} size={44} stroke={4} />}
                <span className={`chip status-${h.status}`}>{statusLabel(h.status)}</span>
              </div>
            </Link>
          );
        }}
      />

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title={t('assign')}>
        <form className="form-grid" onSubmit={assign}>
          <label>
            {t('student')}
            <select
              required
              value={form.studentProfileId}
              onChange={(e) => setForm({ ...form, studentProfileId: e.target.value })}
            >
              <option value="" disabled />
              {students.map((s) => (
                <option key={s.studentProfileId} value={s.studentProfileId}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('titleField')}
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </label>
          <label>
            {t('due')}
            <input type="date" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} />
          </label>
          <button type="submit" disabled={busy}>
            {busy ? t('creating') : t('create')}
          </button>
        </form>
      </Drawer>
    </div>
  );
}
