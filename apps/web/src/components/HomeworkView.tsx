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
// The Skyeng-style content homework (ContentAssignment) handed out from the
// lesson player / room. Students have no separate "Assignments" tab, so these
// are folded into the Homework list below (see UnifiedRow).
interface AssignmentRow {
  id: string;
  kind: string;
  topicTag: string | null;
  dueAt: string | null;
  status: string;
  result: { overall: number | null } | null;
}
interface StudentRow {
  studentProfileId: string;
  name: string;
}

// One normalized row for the list, regardless of which backend model it came
// from. `status` is collapsed to the Homework vocabulary so the tabs work for
// both. `ringValue` is always on the 0-100 scale the ScoreRing expects.
interface UnifiedRow {
  id: string;
  href: string;
  title: string;
  status: 'assigned' | 'submitted' | 'graded';
  dueAt?: string | null;
  ringValue?: number;
  ringDisplay?: string;
}

const TABS = ['all', 'todo', 'submitted', 'graded'] as const;
type Tab = (typeof TABS)[number];

// ContentAssignment advances assigned -> in_progress -> done; map it onto the
// Homework vocabulary the tabs and chips use.
function assignmentStatus(s: string): UnifiedRow['status'] {
  if (s === 'done') return 'graded';
  if (s === 'in_progress') return 'submitted';
  return 'assigned';
}

// Sprint 2.1: the list is only a list. One scannable row per homework — title,
// due date (mono, marked overdue), status chip, a score ring when graded — that
// links to the work screen (/homework/[id] or /assignments/[id]). No inline
// exercise players (they were an N+1 inside a list). Assigning happens in a
// drawer. Staff = tutor OR admin (the old form was gated on tutor only, so
// admins saw nothing). Students see BOTH the Homework model and their
// ContentAssignments merged into one place (they have no Assignments tab).
export function HomeworkView() {
  const t = useTranslations('homework');
  const tAssign = useTranslations('assignments');
  const tApp = useTranslations('app');
  const locale = useLocale();
  const format = useFormatter();
  const router = useRouter();

  const [me, setMe] = useState<Me | null>(null);
  const [items, setItems] = useState<Homework[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
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
      if (profile.role === 'student') {
        // Fold in the lesson-player homework so it isn't invisible to them.
        setAssignments(
          await apiFetch<AssignmentRow[]>('/assignments', { token, locale }).catch(() => [])
        );
      } else if (profile.role === 'tutor' || profile.role === 'admin') {
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
  const statusLabel = (s: UnifiedRow['status']) =>
    s === 'assigned' ? t('statusAssigned') : s === 'submitted' ? t('statusSubmitted') : t('statusGraded');

  const homeworkRows: UnifiedRow[] = items.map((h) => {
    const grade = h.submissions[0]?.grade;
    const graded = h.status === 'graded' && grade != null && grade !== '';
    return {
      id: `hw-${h.id}`,
      href: `/homework/${h.id}`,
      title: h.title,
      status: h.status === 'submitted' || h.status === 'graded' ? h.status : 'assigned',
      dueAt: h.dueAt,
      ringValue: graded ? Number(grade) * 10 : undefined,
      ringDisplay: graded ? String(grade) : undefined
    };
  });
  const assignmentRows: UnifiedRow[] = assignments.map((a) => {
    const overall = a.result?.overall;
    const scored = overall != null;
    return {
      id: `as-${a.id}`,
      href: `/assignments/${a.id}`,
      title: a.topicTag || tAssign(a.kind === 'homework' ? 'homework' : 'lesson'),
      status: assignmentStatus(a.status),
      dueAt: a.dueAt,
      ringValue: scored ? overall : undefined,
      ringDisplay: scored ? String(overall) : undefined
    };
  });
  const rows = [...homeworkRows, ...assignmentRows];

  const filtered = rows.filter((h) =>
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
          const overdue = !!h.dueAt && h.status === 'assigned' && new Date(h.dueAt).getTime() < now;
          return (
            <Link className="assign-row" href={h.href}>
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
                {h.ringValue != null && (
                  <ScoreRing value={h.ringValue} display={h.ringDisplay} size={44} stroke={4} />
                )}
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
