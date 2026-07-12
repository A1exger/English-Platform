'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { ApiError, apiFetch } from '@/lib/api';
import { fetchMe, tokenStore } from '@/lib/auth';
import { Skeleton } from './Skeleton';
import { useToast } from './Toast';
import { PageHeader } from './PageHeader';
import { Drawer } from './Drawer';
import { ScoreRing } from './ScoreRing';

interface Course {
  id: string;
  title: string;
  status: string;
  selfStudy: boolean;
  isNew: boolean;
}
interface Category {
  id: string;
  title: string;
  courses: Course[];
}
interface ContentProgress {
  courses: { courseId: string; courseCompletion: number }[];
}

export function CoursesView() {
  const t = useTranslations('courses');
  const tApp = useTranslations('app');
  const locale = useLocale();
  const router = useRouter();
  const { showUndo } = useToast();

  const [cats, setCats] = useState<Category[]>([]);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [canAuthor, setCanAuthor] = useState(false);
  const [isStudent, setIsStudent] = useState(false);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [busy, setBusy] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [catTitle, setCatTitle] = useState('');
  const [course, setCourse] = useState({ categoryId: '', title: '' });

  const load = useCallback(async () => {
    const token = tokenStore.get();
    if (!token) {
      router.push('/');
      return;
    }
    try {
      const me = await fetchMe(token, locale);
      setCanAuthor(me.role === 'tutor' || me.role === 'admin');
      setIsStudent(me.role === 'student');
      setCats(await apiFetch<Category[]>('/content/catalog', { token, locale }));
      if (me.role === 'student') {
        const cp = await apiFetch<ContentProgress>('/content/progress', { token, locale }).catch(
          () => null
        );
        const map: Record<string, number> = {};
        cp?.courses.forEach((c) => (map[c.courseId] = c.courseCompletion));
        setProgress(map);
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

  async function addCategory(e: FormEvent) {
    e.preventDefault();
    const token = tokenStore.get();
    if (!token) return;
    setBusy(true);
    try {
      await apiFetch('/content/categories', { method: 'POST', token, locale, body: { title: catTitle } });
      setCatTitle('');
      setDrawerOpen(false);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function addCourse(e: FormEvent) {
    e.preventDefault();
    const token = tokenStore.get();
    if (!token || !course.categoryId) return;
    setBusy(true);
    try {
      await apiFetch('/content/courses', { method: 'POST', token, locale, body: course });
      setCourse({ categoryId: '', title: '' });
      setDrawerOpen(false);
      await load();
    } finally {
      setBusy(false);
    }
  }

  // Publish/unpublish is reversible through the undo window (Sprint 4.2).
  function togglePublish(c: Course) {
    const next = c.status === 'published' ? 'draft' : 'published';
    setCats((prev) =>
      prev.map((cat) => ({
        ...cat,
        courses: cat.courses.map((x) => (x.id === c.id ? { ...x, status: next } : x))
      }))
    );
    showUndo(next === 'published' ? t('published') : t('unpublished'), {
      onUndo: () => void load(),
      onCommit: async () => {
        const token = tokenStore.get();
        if (!token) return;
        await apiFetch(`/content/courses/${c.id}`, {
          method: 'PATCH',
          token,
          locale,
          body: { status: next }
        }).catch(() => undefined);
        await load();
      }
    });
  }

  if (state === 'loading') return <div className="content"><Skeleton lines={5} /></div>;
  if (state === 'error') return <div className="content"><p className="error">{tApp('loadError')}</p></div>;

  // The active course gets the single accent "Continue"; the rest are quiet.
  const allCourses = cats.flatMap((c) => c.courses);
  const activeId =
    (isStudent &&
      (allCourses.find((c) => {
        const p = progress[c.id];
        return p !== undefined && p > 0 && p < 100;
      })?.id ??
        allCourses[0]?.id)) ||
    undefined;

  return (
    <div className="content">
      <PageHeader
        title={t('title')}
        primary={canAuthor ? { label: t('newCourse'), onClick: () => setDrawerOpen(true) } : undefined}
      />

      {canAuthor && (
        <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title={t('newCourse')}>
          <form className="form-grid" onSubmit={addCategory}>
            <strong>{t('newCategory')}</strong>
            <label>
              {t('courseTitle')}
              <input required value={catTitle} onChange={(e) => setCatTitle(e.target.value)} />
            </label>
            <button type="submit" disabled={busy}>{t('create')}</button>
          </form>
          <form className="form-grid" onSubmit={addCourse}>
            <strong>{t('newCourse')}</strong>
            <label>
              {t('category')}
              <select
                required
                value={course.categoryId}
                onChange={(e) => setCourse({ ...course, categoryId: e.target.value })}
              >
                <option value="" disabled />
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </label>
            <label>
              {t('courseTitle')}
              <input required value={course.title} onChange={(e) => setCourse({ ...course, title: e.target.value })} />
            </label>
            <button type="submit" disabled={busy}>{t('create')}</button>
          </form>
        </Drawer>
      )}

      {cats.length === 0 ? (
        <div className="card"><p className="note">{t('empty')}</p></div>
      ) : (
        cats.map((cat) => (
          <div key={cat.id} className="card course-cat">
            <strong>{cat.title}</strong>
            {cat.courses.length === 0 ? (
              <p className="note">{t('empty')}</p>
            ) : (
              <ul className="course-cards">
                {cat.courses.map((c) => {
                  const pct = progress[c.id];
                  return (
                    <li key={c.id} className="course-card">
                      {isStudent && pct !== undefined && (
                        <ScoreRing value={pct} size={52} stroke={4} />
                      )}
                      <div className="course-card-main">
                        <div className="course-card-title">
                          <strong>{c.title}</strong>
                          {c.isNew && <span className="badge-new">{t('new')}</span>}
                          {c.selfStudy && <span className="badge-self">{t('selfStudy')}</span>}
                          {canAuthor && (
                            <span className={`status-pill ${c.status}`}>
                              {t(c.status as 'draft' | 'published')}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="row-actions">
                        {canAuthor && (
                          <details className="row-menu">
                            <summary aria-label={t('more')}>⋯</summary>
                            <div className="row-menu-pop">
                              <button type="button" className="menu-item" onClick={() => togglePublish(c)}>
                                {c.status === 'published' ? t('unpublish') : t('publish')}
                              </button>
                            </div>
                          </details>
                        )}
                        {isStudent && c.id === activeId ? (
                          <Link className="cta-primary" href={`/courses/${c.id}`}>
                            {t('continue')}
                          </Link>
                        ) : (
                          <Link className="link" href={`/courses/${c.id}`}>
                            {t('open')} →
                          </Link>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ))
      )}
    </div>
  );
}
