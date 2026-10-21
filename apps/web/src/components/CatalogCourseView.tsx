'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname, useRouter } from '@/i18n/routing';
import { ApiError, apiFetch } from '@/lib/api';
import { fetchMe, tokenStore } from '@/lib/auth';
import { Skeleton } from './Skeleton';
import { PageHeader } from './PageHeader';
import { Drawer } from './Drawer';

const LEVELS = [
  'Beginner',
  'Elementary',
  'PreIntermediate',
  'Intermediate',
  'UpperIntermediate',
  'Advanced'
];

interface LessonRow {
  id: string;
  title: string;
  optional: boolean;
  order: number;
  /** Tasks in the lesson. Zero means it cannot be handed out as homework. */
  taskCount?: number;
}
interface Tree {
  course: { id: string; title: string; status: string };
  /** Levels this course actually has sections in, in CEFR order. */
  levels?: string[];
  sections: { id: string; title: string; units: { id: string; title: string; lessons: LessonRow[] }[] }[];
}
interface StudentRow {
  studentProfileId: string;
  name: string;
}

/**
 * One course from the library, on its own page.
 *
 * It used to be a state of the catalogue screen, with lessons read through a
 * popup — a small window with its own scrollbar, which is a poor way to read a
 * lesson. A course now has an address of its own, and its lessons open as full
 * pages, the same ones a student works through.
 */
export function CatalogCourseView({
  courseId,
  initialLevel
}: {
  courseId: string;
  initialLevel?: string;
}) {
  const t = useTranslations('courses');
  const tApp = useTranslations('app');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const [isStaff, setIsStaff] = useState(false);
  const [level, setLevel] = useState(
    initialLevel && LEVELS.includes(initialLevel) ? initialLevel : 'Elementary'
  );
  const [tree, setTree] = useState<Tree | null>(null);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [treeBusy, setTreeBusy] = useState(false);

  // Assign-homework drawer (same shape as the builder's).
  const [hwFor, setHwFor] = useState<LessonRow | null>(null);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [due, setDue] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadTree = useCallback(
    async (lvl: string) => {
      const token = tokenStore.get();
      if (!token) {
        router.push('/');
        return;
      }
      setTreeBusy(true);
      try {
        const me = await fetchMe(token, locale);
        setIsStaff(me.role === 'tutor' || me.role === 'admin');
        setTree(
          await apiFetch<Tree>(`/content/courses/${courseId}/tree?level=${lvl}`, { token, locale })
        );
        setState('ready');
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          router.push('/');
          return;
        }
        setTree(null);
        setState('error');
      } finally {
        setTreeBusy(false);
      }
    },
    [courseId, locale, router]
  );

  useEffect(() => {
    void loadTree(level);
  }, [loadTree, level]);

  // The level lives in the URL, so the page can be linked, refreshed, and
  // returned to from a lesson without landing somewhere else.
  function pickLevel(l: string) {
    setLevel(l);
    router.replace(`${pathname}?level=${l}`, { scroll: false });
  }

  // Open on a level the course actually has, rather than an empty one.
  useEffect(() => {
    if (!tree?.levels?.length || tree.levels.includes(level)) return;
    setLevel(tree.levels[0]);
  }, [tree, level]);

  async function openHomework(lesson: LessonRow) {
    const token = tokenStore.get();
    if (!token) return;
    setHwFor(lesson);
    setPicked({});
    setDue('');
    setMsg(null);
    setStudents(
      await apiFetch<StudentRow[]>('/crm/students', { token, locale }).catch(() => [])
    );
  }

  async function assign() {
    const token = tokenStore.get();
    const ids = Object.entries(picked).filter(([, v]) => v).map(([k]) => k);
    if (!token || !hwFor || ids.length === 0) return;
    setBusy(true);
    setMsg(null);
    try {
      // Count what landed rather than assuming — a silent failure here is the
      // one that ends as "I assigned it and the student sees nothing".
      const results = await Promise.all(
        ids.map((studentProfileId) =>
          apiFetch('/assignments', {
            method: 'POST',
            token,
            locale,
            body: {
              studentProfileId,
              kind: 'homework',
              courseLessonId: hwFor.id,
              topicTag: hwFor.title,
              dueAt: due ? new Date(due).toISOString() : undefined
            }
          })
            .then(() => ({ ok: true, reason: '' }))
            .catch((e: unknown) => ({
              ok: false,
              reason: e instanceof ApiError ? e.message : ''
            }))
        )
      );
      const sent = results.filter((r) => r.ok).length;
      if (sent === 0) {
        // Say what the server objected to. The usual answer is "No tasks to
        // assign" — impossible to guess from a bare "nothing was sent".
        const reason = results.find((r) => !r.ok)?.reason;
        setMsg([t('homeworkAssignFailed'), reason].filter(Boolean).join(' '));
        return;
      }
      setMsg(t('homeworkAssignedTo', { count: sent }));
      setTimeout(() => setHwFor(null), 1200);
    } finally {
      setBusy(false);
    }
  }

  if (state === 'loading') return <div className="content"><Skeleton lines={5} /></div>;
  if (state === 'error') return <div className="content"><p className="error">{tApp('loadError')}</p></div>;

  const lessons = tree?.sections.flatMap((s) => s.units.flatMap((u) => u.lessons)) ?? [];

  return (
    <div className="content">
      <Link className="link" href="/catalog">← {t('catalogTitle')}</Link>
      <PageHeader title={tree?.course.title ?? ''} />

      <div className="tabs tabs-inline filter-chips level-tabs" role="tablist">
        {LEVELS.map((l) => {
          const empty = !!tree?.levels && !tree.levels.includes(l);
          return (
            <button
              key={l}
              type="button"
              role="tab"
              aria-selected={level === l}
              className={level === l ? 'active' : ''}
              onClick={() => pickLevel(l)}
            >
              {l}
              {empty && <span className="level-empty-note">{t('levelEmpty')}</span>}
            </button>
          );
        })}
      </div>

      {treeBusy ? (
        <Skeleton lines={4} />
      ) : lessons.length === 0 ? (
        <p className="note">{t('levelEmptyBody')}</p>
      ) : (
        <ul className="assign-list">
          {lessons.map((l) => (
            <li key={l.id} className="assign-row catalog-row">
              <span className="mono-num">{l.order}</span>
              <span className="assign-row-main">
                <strong>{l.title}</strong>
                {l.optional && <span className="badge-opt">{t('optionalLesson')}</span>}
                {l.taskCount === 0 ? (
                  <span className="muted">{t('lessonHasNoTasks')}</span>
                ) : (
                  l.taskCount !== undefined && (
                    <span className="muted mono-num">{t('taskCount', { count: l.taskCount })}</span>
                  )
                )}
              </span>
              <span className="row-actions">
                {/* One control for both roles: the lesson opens as a page. A
                    tutor reading it and a student working through it want the
                    same thing — the lesson, not a window onto it. */}
                <Link className="cta-primary" href={`/learn/${l.id}`}>
                  {t('open')}
                </Link>
                {isStaff && (
                  <button
                    type="button"
                    disabled={l.taskCount === 0}
                    title={l.taskCount === 0 ? t('lessonHasNoTasks') : undefined}
                    onClick={() => void openHomework(l)}
                  >
                    {t('assignHomework')}
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      <Drawer open={!!hwFor} onClose={() => setHwFor(null)} title={t('assignHomework')}>
        <div className="assign-form">
          <p className="muted">{hwFor?.title}</p>
          <div className="field">
            <span>{t('chooseStudents')}</span>
            {students.length === 0 ? (
              <p className="note">{t('noStudents')}</p>
            ) : (
              <div className="pick-chips">
                {students.map((s) => (
                  <label
                    key={s.studentProfileId}
                    className={`pick-chip${picked[s.studentProfileId] ? ' on' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={!!picked[s.studentProfileId]}
                      onChange={(e) => setPicked({ ...picked, [s.studentProfileId]: e.target.checked })}
                    />
                    {s.name}
                  </label>
                ))}
              </div>
            )}
          </div>
          <label>
            {t('due')}
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </label>
          {msg && <p className={msg.startsWith(t('homeworkAssignFailed')) ? 'error' : 'ex-ok'}>{msg}</p>}
          <button
            type="button"
            disabled={busy || !Object.values(picked).some(Boolean)}
            onClick={() => void assign()}
          >
            {t('assignBtn')}
          </button>
        </div>
      </Drawer>
    </div>
  );
}
