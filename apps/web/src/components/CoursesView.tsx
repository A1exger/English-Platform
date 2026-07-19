'use client';

import { FormEvent, ReactNode, useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { useLocale } from 'next-intl';
import { ApiError, apiFetch, apiUpload, fileUrl } from '@/lib/api';
import { fetchMe, tokenStore } from '@/lib/auth';
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Skeleton } from './Skeleton';
import { useToast } from './Toast';
import { PageHeader } from './PageHeader';
import { Drawer } from './Drawer';
import { ScoreRing } from './ScoreRing';
import { EmptyState } from './EmptyState';

// CEFR-style levels a course's sections use (mirrors the API CONTENT_LEVELS).
const LEVELS = ['Beginner', 'Elementary', 'PreIntermediate', 'Intermediate', 'UpperIntermediate', 'Advanced'] as const;

interface Course {
  id: string;
  title: string;
  status: string;
  selfStudy: boolean;
  isNew: boolean;
  description?: string | null;
  coverUrl?: string | null;
  order: number;
  sections?: { level: string }[];
}
interface Category {
  id: string;
  title: string;
  order: number;
  courses: Course[];
}
interface ContentProgress {
  courses: { courseId: string; courseCompletion: number }[];
}

const levelsOf = (c: Course) => Array.from(new Set((c.sections ?? []).map((s) => s.level)));

// --- one course card (shared by the student grid and the author DnD grid) ---
function CourseCardBody({
  c,
  isStudent,
  canAuthor,
  pct,
  isActive,
  onToggle,
  handle
}: {
  c: Course;
  isStudent: boolean;
  canAuthor: boolean;
  pct?: number;
  isActive: boolean;
  onToggle: () => void;
  handle?: ReactNode;
}) {
  const t = useTranslations('courses');
  const levels = levelsOf(c);
  return (
    <>
      <div
        className="course-cover"
        style={c.coverUrl ? { backgroundImage: `url(${fileUrl(c.coverUrl)})` } : undefined}
      >
        {handle}
        {isStudent && pct !== undefined && (
          <span className="course-cover-ring"><ScoreRing value={pct} size={44} stroke={4} /></span>
        )}
      </div>
      <div className="course-card-main">
        <div className="course-card-title">
          <strong>{c.title}</strong>
          {c.isNew && <span className="badge-new">{t('new')}</span>}
          {c.selfStudy && <span className="badge-self">{t('selfStudy')}</span>}
          {canAuthor && <span className={`status-pill ${c.status}`}>{t(c.status as 'draft' | 'published')}</span>}
        </div>
        {c.description && <p className="course-card-desc">{c.description}</p>}
        {levels.length > 0 && (
          <div className="level-chips">
            {levels.map((l) => (
              <span key={l} className="level-chip">{l}</span>
            ))}
          </div>
        )}
      </div>
      <div className="row-actions">
        {canAuthor && (
          <details className="row-menu">
            <summary aria-label={t('more')}>⋯</summary>
            <div className="row-menu-pop">
              <Link className="menu-item" href={`/courses/${c.id}`}>{t('edit')}</Link>
              <button type="button" className="menu-item" onClick={onToggle}>
                {c.status === 'published' ? t('unpublish') : t('publish')}
              </button>
            </div>
          </details>
        )}
        {isStudent && isActive ? (
          <Link className="cta-primary" href={`/courses/${c.id}`}>{t('continue')}</Link>
        ) : (
          <Link className="link" href={`/courses/${c.id}`}>{t('open')} →</Link>
        )}
      </div>
    </>
  );
}

// A course card that can be dragged by its handle (authors, unfiltered view).
function SortableCourse(props: {
  c: Course;
  canAuthor: boolean;
  isStudent: boolean;
  pct?: number;
  isActive: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations('courses');
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.c.id });
  return (
    <li
      ref={setNodeRef}
      className="course-card"
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
    >
      <CourseCardBody
        {...props}
        handle={
          <button type="button" className="drag-handle" aria-label={t('reorder')} {...attributes} {...listeners}>
            ⠿
          </button>
        }
      />
    </li>
  );
}

export function CoursesView() {
  const t = useTranslations('courses');
  const tApp = useTranslations('app');
  const tc = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const { showUndo } = useToast();

  const [cats, setCats] = useState<Category[]>([]);
  const [q, setQ] = useState('');
  const [levelFilter, setLevelFilter] = useState<'all' | (typeof LEVELS)[number]>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'published'>('all');
  const [catFilter, setCatFilter] = useState<'all' | string>('all');
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [canAuthor, setCanAuthor] = useState(false);
  const [isStudent, setIsStudent] = useState(false);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [busy, setBusy] = useState(false);
  const [coverBusy, setCoverBusy] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [catTitle, setCatTitle] = useState('');
  const [course, setCourse] = useState({ categoryId: '', title: '', description: '', coverUrl: '' });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

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
        const cp = await apiFetch<ContentProgress>('/content/progress', { token, locale }).catch(() => null);
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

  async function uploadCover(file: File) {
    const token = tokenStore.get();
    if (!token) return;
    setCoverBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiUpload<{ url: string }>('/materials/upload', fd, { token, locale });
      setCourse((prev) => ({ ...prev, coverUrl: res.url }));
    } catch {
      /* ignore — the cover is optional */
    } finally {
      setCoverBusy(false);
    }
  }

  async function addCourse(e: FormEvent) {
    e.preventDefault();
    const token = tokenStore.get();
    if (!token || !course.categoryId) return;
    setBusy(true);
    try {
      await apiFetch('/content/courses', {
        method: 'POST',
        token,
        locale,
        body: {
          categoryId: course.categoryId,
          title: course.title,
          description: course.description || undefined,
          coverUrl: course.coverUrl || undefined
        }
      });
      setCourse({ categoryId: '', title: '', description: '', coverUrl: '' });
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
        await apiFetch(`/content/courses/${c.id}`, { method: 'PATCH', token, locale, body: { status: next } }).catch(
          () => undefined
        );
        await load();
      }
    });
  }

  function persist(path: string, body: unknown) {
    const token = tokenStore.get();
    if (!token) return;
    void apiFetch(path, { method: 'POST', token, locale, body })
      .catch(() => void load());
  }

  function onCategoryDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const ids = cats.map((c) => c.id);
    const next = arrayMove(cats, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)));
    setCats(next);
    persist('/content/categories/reorder', { ids: next.map((c) => c.id) });
  }

  function onCourseDragEnd(catId: string, e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    setCats((prev) =>
      prev.map((cat) => {
        if (cat.id !== catId) return cat;
        const ids = cat.courses.map((c) => c.id);
        const courses = arrayMove(cat.courses, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over!.id)));
        persist('/content/courses/reorder', { categoryId: catId, ids: courses.map((c) => c.id) });
        return { ...cat, courses };
      })
    );
  }

  if (state === 'loading') return <div className="content"><Skeleton lines={5} /></div>;
  if (state === 'error') return <div className="content"><p className="error">{tApp('loadError')}</p></div>;

  const allCourses = cats.flatMap((c) => c.courses);
  const activeId =
    (isStudent &&
      (allCourses.find((c) => {
        const p = progress[c.id];
        return p !== undefined && p > 0 && p < 100;
      })?.id ??
        allCourses[0]?.id)) ||
    undefined;

  const needle = q.trim().toLowerCase();
  const filtering = !!needle || levelFilter !== 'all' || statusFilter !== 'all' || catFilter !== 'all';
  const matches = (c: Course) =>
    c.title.toLowerCase().includes(needle) &&
    (levelFilter === 'all' || levelsOf(c).includes(levelFilter)) &&
    (statusFilter === 'all' || c.status === statusFilter);

  const visibleCats = (catFilter === 'all' ? cats : cats.filter((c) => c.id === catFilter)).map((cat) => ({
    ...cat,
    courses: cat.courses.filter(matches)
  }));
  const shownCats = filtering ? visibleCats.filter((cat) => cat.courses.length > 0) : visibleCats;
  // Reorder only in the true (unfiltered) view so a drag can't scramble a subset.
  const dnd = canAuthor && !filtering;

  const filterChip = (active: boolean, label: string, onClick: () => void) => (
    <button type="button" role="tab" aria-selected={active} className={active ? 'active' : ''} onClick={onClick}>
      {label}
    </button>
  );

  const renderCourses = (cat: Category) =>
    cat.courses.length === 0 ? (
      <p className="note">{t('empty')}</p>
    ) : dnd ? (
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => onCourseDragEnd(cat.id, e)}>
        <SortableContext items={cat.courses.map((c) => c.id)} strategy={rectSortingStrategy}>
          <ul className="course-cards">
            {cat.courses.map((c) => (
              <SortableCourse
                key={c.id}
                c={c}
                canAuthor={canAuthor}
                isStudent={isStudent}
                pct={progress[c.id]}
                isActive={c.id === activeId}
                onToggle={() => togglePublish(c)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    ) : (
      <ul className="course-cards">
        {cat.courses.map((c) => (
          <li key={c.id} className="course-card">
            <CourseCardBody
              c={c}
              canAuthor={canAuthor}
              isStudent={isStudent}
              pct={progress[c.id]}
              isActive={c.id === activeId}
              onToggle={() => togglePublish(c)}
            />
          </li>
        ))}
      </ul>
    );

  const catBlock = (cat: Category, handle?: ReactNode) => (
    <div className="card course-cat">
      <div className="course-cat-head">
        {handle}
        <strong>{cat.title}</strong>
      </div>
      {renderCourses(cat)}
    </div>
  );

  return (
    <div className="content">
      <PageHeader
        title={t('title')}
        primary={canAuthor ? { label: t('newCourse'), onClick: () => setDrawerOpen(true) } : undefined}
        search={{ value: q, onChange: setQ }}
      />

      {/* Filters (ФТ-К102): level always; status for authors; category always. */}
      <div className="catalog-filters">
        <div className="tabs tabs-inline filter-chips" role="tablist" aria-label={t('level')}>
          {filterChip(levelFilter === 'all', t('allLevels'), () => setLevelFilter('all'))}
          {LEVELS.map((l) => filterChip(levelFilter === l, l, () => setLevelFilter(l)))}
        </div>
        {canAuthor && (
          <div className="tabs tabs-inline filter-chips" role="tablist" aria-label={t('published')}>
            {filterChip(statusFilter === 'all', t('allStatuses'), () => setStatusFilter('all'))}
            {filterChip(statusFilter === 'published', t('published'), () => setStatusFilter('published'))}
            {filterChip(statusFilter === 'draft', t('draft'), () => setStatusFilter('draft'))}
          </div>
        )}
        {cats.length > 1 && (
          <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} aria-label={t('category')}>
            <option value="all">{t('allCategories')}</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        )}
      </div>

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
              <select required value={course.categoryId} onChange={(e) => setCourse({ ...course, categoryId: e.target.value })}>
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
            <label>
              {t('description')}
              <textarea value={course.description} onChange={(e) => setCourse({ ...course, description: e.target.value })} />
            </label>
            <label>
              {t('cover')}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => e.target.files?.[0] && uploadCover(e.target.files[0])}
              />
            </label>
            {course.coverUrl && (
              <div className="cover-preview" style={{ backgroundImage: `url(${fileUrl(course.coverUrl)})` }} aria-hidden />
            )}
            <button type="submit" disabled={busy || coverBusy}>{coverBusy ? t('creating') : t('create')}</button>
          </form>
        </Drawer>
      )}

      {cats.length === 0 ? (
        <EmptyState
          title={t('empty')}
          action={canAuthor ? { label: t('newCourse'), onClick: () => setDrawerOpen(true) } : undefined}
        />
      ) : shownCats.length === 0 ? (
        <p className="note">{tc('noResults')}</p>
      ) : dnd ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onCategoryDragEnd}>
          <SortableContext items={shownCats.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            {shownCats.map((cat) => (
              <SortableCategory key={cat.id} cat={cat} render={catBlock} />
            ))}
          </SortableContext>
        </DndContext>
      ) : (
        shownCats.map((cat) => <div key={cat.id}>{catBlock(cat)}</div>)
      )}
    </div>
  );
}

// A category block draggable by its handle.
function SortableCategory({ cat, render }: { cat: Category; render: (cat: Category, handle: ReactNode) => ReactNode }) {
  const t = useTranslations('courses');
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cat.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }}>
      {render(
        cat,
        <button type="button" className="drag-handle" aria-label={t('reorder')} {...attributes} {...listeners}>
          ⠿
        </button>
      )}
    </div>
  );
}
