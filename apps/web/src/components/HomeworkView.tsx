'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { ApiError, apiFetch } from '@/lib/api';
import { fetchMe, Me, tokenStore } from '@/lib/auth';
import { Skeleton } from './Skeleton';
import { Drawer } from './Drawer';
import { AnswerGauge } from './AnswerGauge';
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
  // Per-exercise instances; `score` is 0–100 (see task-contract).
  exercises?: { id: string; status: string; score?: number | null }[];
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
  cardCount: number;
  submittedCount: number;
  // `overall` is the 0–10 average of the auto-graded cards.
  result: { overall: number | null } | null;
}
interface StudentRow {
  studentProfileId: string;
  name: string;
}

/**
 * One normalized row, whichever backend model it came from. Three states only:
 * nothing started (new), part-way (progress), finished (done). Progress is
 * `done/total` tasks and `pct` the average score over the finished ones, so the
 * ring shows how much is left AND how it is going.
 */
interface UnifiedRow {
  id: string;
  href: string;
  title: string;
  status: 'new' | 'progress' | 'done';
  dueAt?: string | null;
  done: number;
  total: number;
  pct: number | null;
}

const TABS = ['all', 'new', 'progress', 'done'] as const;
type Tab = (typeof TABS)[number];

/** Homework a student has never opened, so it can be badged "new". */
const SEEN_KEY = 'homework-seen';
function readSeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

function stateOf(done: number, total: number, finished: boolean): UnifiedRow['status'] {
  if (finished || (total > 0 && done >= total)) return 'done';
  return done > 0 ? 'progress' : 'new';
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
  const [seen, setSeen] = useState<Set<string>>(new Set());
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

  // localStorage, not the server: "new" is a per-person reading cue, and this
  // keeps opening a homework from needing a write round-trip.
  useEffect(() => setSeen(readSeen()), []);

  function markSeen(id: string) {
    setSeen((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev).add(id);
      try {
        localStorage.setItem(SEEN_KEY, JSON.stringify([...next]));
      } catch {
        /* storage unavailable — the badge just shows again next time */
      }
      return next;
    });
  }

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
    s === 'new' ? t('statusNew') : s === 'progress' ? t('statusProgress') : t('statusDone');

  const homeworkRows: UnifiedRow[] = items.map((h) => {
    const exercises = h.exercises ?? [];
    const finishedEx = exercises.filter((e) => e.status !== 'open');
    const scores = finishedEx
      .map((e) => e.score)
      .filter((s): s is number => typeof s === 'number');
    const grade = h.submissions[0]?.grade;
    const hasGrade = grade != null && grade !== '';
    // Exercise homework is measured by its instances; a written one by its
    // single submission (graded 0–10 by the tutor).
    const total = exercises.length || 1;
    const done = exercises.length ? finishedEx.length : hasGrade || h.status !== 'assigned' ? 1 : 0;
    const pct = exercises.length
      ? scores.length
        ? scores.reduce((s, v) => s + v, 0) / scores.length
        : null
      : hasGrade
        ? Number(grade) * 10
        : null;
    return {
      id: `hw-${h.id}`,
      href: `/homework/${h.id}`,
      title: h.title,
      status: stateOf(done, total, h.status === 'graded'),
      dueAt: h.dueAt,
      done,
      total,
      pct
    };
  });
  const assignmentRows: UnifiedRow[] = assignments.map((a) => ({
    id: `as-${a.id}`,
    href: `/assignments/${a.id}`,
    title: a.topicTag || tAssign(a.kind === 'homework' ? 'homework' : 'lesson'),
    status: stateOf(a.submittedCount, a.cardCount, a.status === 'done'),
    dueAt: a.dueAt,
    done: a.submittedCount,
    total: a.cardCount,
    // `overall` is already the average across the auto-graded cards.
    pct: a.result?.overall != null ? a.result.overall * 10 : null
  }));
  const rows = [...homeworkRows, ...assignmentRows];

  const filtered = rows.filter((h) => tab === 'all' || h.status === tab);
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
          const overdue = !!h.dueAt && h.status !== 'done' && new Date(h.dueAt).getTime() < now;
          // "New" until it is opened once — the badge is the student's cue that
          // something arrived, so it goes away on the first visit.
          const isNew = h.status === 'new' && !seen.has(h.id);
          return (
            <Link className="assign-row" href={h.href} onClick={() => markSeen(h.id)}>
              <div className="assign-row-main">
                <strong>
                  {h.title}
                  {isNew && <span className="badge-new-gold">{t('badgeNew')}</span>}
                </strong>
                {h.dueAt && (
                  <span className={`mono-num${overdue ? ' overdue' : ' muted'}`}>
                    {t('due')} {format.dateTime(new Date(h.dueAt), { dateStyle: 'medium' })}
                    {overdue ? ` · ${t('overdue')}` : ''}
                  </span>
                )}
              </div>
              <div className="assign-row-side">
                <AnswerGauge done={h.done} total={h.total} pct={h.pct} label={t('title')} />
                <span className={`chip hw-${h.status}`}>{statusLabel(h.status)}</span>
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
