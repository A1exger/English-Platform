'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { ApiError, apiFetch } from '@/lib/api';
import { fetchMe, tokenStore } from '@/lib/auth';
import { Skeleton } from './Skeleton';
import { PageHeader } from './PageHeader';
import { Drawer } from './Drawer';
import { Icon } from './Icon';
import { LessonPlayerView } from './LessonPlayerView';

const LEVELS = [
  'Beginner',
  'Elementary',
  'PreIntermediate',
  'Intermediate',
  'UpperIntermediate',
  'Advanced'
];

interface CourseCard {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  visibility?: string;
  sections?: { level: string }[];
}
interface CategoryRow {
  id: string;
  title: string;
  courses: CourseCard[];
}
interface LessonRow {
  id: string;
  title: string;
  optional: boolean;
  order: number;
}
interface Tree {
  course: { id: string; title: string; status: string };
  sections: { id: string; title: string; units: { id: string; title: string; lessons: LessonRow[] }[] }[];
}
interface StudentRow {
  studentProfileId: string;
  name: string;
}

/**
 * The teaching-side course library: finished, published courses, read as a
 * student would see them, with homework assignable from any lesson.
 *
 * Deliberately separate from the builder (/courses): that screen is for making
 * courses and is full of edit affordances. This one never edits — it is where a
 * tutor picks something already built and hands it out.
 */
export function CourseCatalogView() {
  const t = useTranslations('courses');
  const tApp = useTranslations('app');
  const locale = useLocale();
  const router = useRouter();

  const [cats, setCats] = useState<CategoryRow[]>([]);
  const [isStaff, setIsStaff] = useState(false);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [openCourse, setOpenCourse] = useState<CourseCard | null>(null);
  const [level, setLevel] = useState('Elementary');
  const [tree, setTree] = useState<Tree | null>(null);
  const [treeBusy, setTreeBusy] = useState(false);
  const [preview, setPreview] = useState<LessonRow | null>(null);

  // Assign-homework drawer (same shape as the builder's).
  const [hwFor, setHwFor] = useState<LessonRow | null>(null);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [due, setDue] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const token = tokenStore.get();
    if (!token) {
      router.push('/');
      return;
    }
    try {
      const me = await fetchMe(token, locale);
      setIsStaff(me.role === 'tutor' || me.role === 'admin');
      // Students get the same screen, minus the teaching actions. The catalog
      // endpoint already limits them to published courses shared with them, so
      // the filter below is a no-op on their side.
      const data = await apiFetch<CategoryRow[]>('/content/catalog', { token, locale });
      // Published only: this library is "what is ready to teach", and a draft
      // course is by definition not.
      setCats(
        data
          .map((c) => ({ ...c, courses: c.courses.filter((x) => x.status === 'published') }))
          .filter((c) => c.courses.length > 0)
      );
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

  const loadTree = useCallback(
    async (courseId: string, lvl: string) => {
      const token = tokenStore.get();
      if (!token) return;
      setTreeBusy(true);
      try {
        setTree(
          await apiFetch<Tree>(`/content/courses/${courseId}/tree?level=${lvl}`, { token, locale })
        );
      } catch {
        setTree(null);
      } finally {
        setTreeBusy(false);
      }
    },
    [locale]
  );

  useEffect(() => {
    if (openCourse) void loadTree(openCourse.id, level);
  }, [openCourse, level, loadTree]);

  function openCourseAt(course: CourseCard) {
    // Open on a level the course actually has, so it never lands on an empty one.
    const levels = course.sections?.map((s) => s.level) ?? [];
    setLevel(LEVELS.find((l) => levels.includes(l)) ?? 'Elementary');
    setOpenCourse(course);
    setTree(null);
  }

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
            .then(() => true)
            .catch(() => false)
        )
      );
      const sent = results.filter(Boolean).length;
      if (sent === 0) {
        setMsg(t('homeworkAssignFailed'));
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
      <PageHeader title={t('catalogTitle')} />

      {!openCourse ? (
        cats.length === 0 ? (
          <p className="note">{t('catalogEmpty')}</p>
        ) : (
          cats.map((cat) => (
            <div key={cat.id} className="catalog-group">
              <h3>{cat.title}</h3>
              <div className="catalog-cards">
                {cat.courses.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="card catalog-card"
                    onClick={() => openCourseAt(c)}
                  >
                    <strong>{c.title}</strong>
                    {c.visibility === 'private' && (
                      <span className="badge-private">{t('visibilityPrivate')}</span>
                    )}
                    {c.description && <span className="muted">{c.description}</span>}
                  </button>
                ))}
              </div>
            </div>
          ))
        )
      ) : (
        <>
          <button type="button" className="link-button" onClick={() => setOpenCourse(null)}>
            ← {t('back')}
          </button>
          <PageHeader title={openCourse.title} />

          <div className="tabs tabs-inline filter-chips level-tabs" role="tablist">
            {LEVELS.map((l) => (
              <button
                key={l}
                type="button"
                role="tab"
                aria-selected={level === l}
                className={level === l ? 'active' : ''}
                onClick={() => setLevel(l)}
              >
                {l}
              </button>
            ))}
          </div>

          {treeBusy ? (
            <Skeleton lines={4} />
          ) : lessons.length === 0 ? (
            <p className="note">{t('empty')}</p>
          ) : (
            <ul className="assign-list">
              {lessons.map((l) => (
                <li key={l.id} className="assign-row catalog-row">
                  <span className="mono-num">{l.order}</span>
                  <span className="assign-row-main">
                    <strong>{l.title}</strong>
                    {l.optional && <span className="badge-opt">{t('optionalLesson')}</span>}
                  </span>
                  <span className="row-actions">
                    {isStaff ? (
                      <>
                        <button type="button" className="ghost" onClick={() => setPreview(l)}>
                          <Icon name="eye" /> {t('preview')}
                        </button>
                        <button type="button" onClick={() => void openHomework(l)}>
                          {t('assignHomework')}
                        </button>
                      </>
                    ) : (
                      // A student opens the lesson to work through it, not a
                      // read-only preview of it.
                      <Link className="cta-primary" href={`/learn/${l.id}`}>
                        {t('open')}
                      </Link>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {/* Read the lesson exactly as the student will — the same player. */}
      {preview && (
        <div className="preview-modal" role="dialog" aria-modal="true" onClick={() => setPreview(null)}>
          <div className="preview-modal-body" onClick={(e) => e.stopPropagation()}>
            <div className="row-between">
              <strong>{preview.title}</strong>
              <button type="button" className="ghost" onClick={() => setPreview(null)}>
                <Icon name="close" />
              </button>
            </div>
            <div className="preview-modal-scroll">
              <LessonPlayerView lessonId={preview.id} />
            </div>
          </div>
        </div>
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
          {msg && <p className={msg === t('homeworkAssignFailed') ? 'error' : 'ex-ok'}>{msg}</p>}
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
