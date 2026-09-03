'use client';

import { ReactNode, useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { useLocale } from 'next-intl';
import { ApiError, apiFetch } from '@/lib/api';
import { fetchMe, tokenStore } from '@/lib/auth';
import { usePopoverDismiss } from '@/lib/use-popover-dismiss';
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  TouchSensor,
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
import { EmptyState } from './EmptyState';

// CEFR-style levels a course's sections use (mirrors the API CONTENT_LEVELS).
const LEVELS = ['Beginner', 'Elementary', 'PreIntermediate', 'Intermediate', 'UpperIntermediate', 'Advanced'] as const;

interface Course {
  id: string;
  title: string;
  status: string;
  selfStudy: boolean;
  isNew: boolean;
  // "public" = shared with every student; "private" = individual course, only
  // visible to the students the tutor grants access to.
  visibility?: string;
  description?: string | null;
  coverUrl?: string | null;
  order: number;
  sections?: { level: string }[];
}
interface StudentOption {
  studentProfileId: string;
  name: string;
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
  onRename,
  onDelete,
  onAccess,
  handle
}: {
  c: Course;
  isStudent: boolean;
  canAuthor: boolean;
  pct?: number;
  isActive: boolean;
  onToggle: () => void;
  onRename?: () => void;
  onDelete?: () => void;
  onAccess?: () => void;
  handle?: ReactNode;
}) {
  const t = useTranslations('courses');
  // Compact row (Skyeng "Classroom" style): a dot + the course name that links
  // into the course, an optional progress %/badges, then the author ⋯ menu.
  return (
    <>
      {handle}
      <Link className="course-row-link" href={`/courses/${c.id}`}>
        <span className="course-dot" aria-hidden />
        <span className="course-row-name">{c.title}</span>
        {isStudent && pct !== undefined && <span className="course-row-pct mono-num">{pct}%</span>}
        {c.isNew && <span className="badge-new">{t('new')}</span>}
        {c.selfStudy && <span className="badge-self">{t('selfStudy')}</span>}
        {/* An individual course is only visible to the students it was granted
            to — flag it so it is never mistaken for a shared one. */}
        {c.visibility === 'private' && <span className="badge-private">{t('visibilityPrivate')}</span>}
        {canAuthor && <span className={`status-pill ${c.status}`}>{t(c.status as 'draft' | 'published')}</span>}
      </Link>
      {canAuthor && (
        <details className="row-menu">
          <summary aria-label={t('more')}>⋯</summary>
          <div className="row-menu-pop">
            <Link className="menu-item" href={`/courses/${c.id}`}>{t('edit')}</Link>
            {onRename && (
              <button type="button" className="menu-item" onClick={onRename}>{t('rename')}</button>
            )}
            <button type="button" className="menu-item" onClick={onToggle}>
              {c.status === 'published' ? t('unpublish') : t('publish')}
            </button>
            {onAccess && (
              <button type="button" className="menu-item" onClick={onAccess}>
                {t('manageAccess')}
              </button>
            )}
            {onDelete && (
              <button type="button" className="menu-item danger" onClick={onDelete}>{t('deleteCourse')}</button>
            )}
          </div>
        </details>
      )}
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
  onRename?: () => void;
  onDelete?: () => void;
  onAccess?: () => void;
}) {
  const t = useTranslations('courses');
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.c.id });
  return (
    <li
      ref={setNodeRef}
      className="course-row"
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
  // Dismiss the per-row ⋯ menus on an outside click / Escape.
  usePopoverDismiss();

  const [cats, setCats] = useState<Category[]>([]);
  const [q, setQ] = useState('');
  const [levelFilter, setLevelFilter] = useState<'all' | (typeof LEVELS)[number]>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'published'>('all');
  const [catFilter, setCatFilter] = useState<'all' | string>('all');
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [canAuthor, setCanAuthor] = useState(false);
  const [isStudent, setIsStudent] = useState(false);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  // Individual-course access editor: which students may open this course.
  const [access, setAccess] = useState<{
    course: Course;
    students: StudentOption[];
    picked: Record<string, boolean>;
  } | null>(null);
  const [accessBusy, setAccessBusy] = useState(false);

  // Mouse + touch (touch delayed so a drag never fights page scroll, §11).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  );

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

  // Rename in place — optimistic, then PATCH the title.
  // Open the access editor for a course: the tutor's students, pre-checked with
  // whoever already has it. Switches the course to "private" on save, since a
  // per-student list only means anything for an individual course.
  async function openAccess(c: Course) {
    const token = tokenStore.get();
    if (!token) return;
    const [students, granted] = await Promise.all([
      apiFetch<StudentOption[]>('/crm/students', { token, locale }).catch(() => []),
      apiFetch<{ studentProfileId: string }[]>(`/content/courses/${c.id}/access`, {
        token,
        locale
      }).catch(() => [])
    ]);
    setAccess({
      course: c,
      students,
      picked: Object.fromEntries(granted.map((g) => [g.studentProfileId, true]))
    });
  }

  async function saveAccess() {
    const token = tokenStore.get();
    if (!token || !access) return;
    const { course } = access;
    const studentProfileIds = Object.entries(access.picked)
      .filter(([, v]) => v)
      .map(([k]) => k);
    setAccessBusy(true);
    try {
      await apiFetch(`/content/courses/${course.id}/access`, {
        method: 'PUT',
        token,
        locale,
        body: { studentProfileIds }
      });
      // A named list implies an individual course; flip it so the grant is
      // actually enforced (a public course is visible to everyone regardless).
      if (course.visibility !== 'private') {
        await apiFetch(`/content/courses/${course.id}`, {
          method: 'PATCH',
          token,
          locale,
          body: { visibility: 'private' }
        }).catch(() => undefined);
        setCats((prev) =>
          prev.map((cat) => ({
            ...cat,
            courses: cat.courses.map((x) =>
              x.id === course.id ? { ...x, visibility: 'private' } : x
            )
          }))
        );
      }
      setAccess(null);
    } finally {
      setAccessBusy(false);
    }
  }

  async function saveRename() {
    const token = tokenStore.get();
    if (!token || !renaming || !renaming.title.trim()) return;
    const { id } = renaming;
    const title = renaming.title.trim();
    setCats((prev) =>
      prev.map((cat) => ({ ...cat, courses: cat.courses.map((x) => (x.id === id ? { ...x, title } : x)) }))
    );
    setRenaming(null);
    await apiFetch(`/content/courses/${id}`, { method: 'PATCH', token, locale, body: { title } }).catch(
      () => void load()
    );
  }

  // Delete a course — optimistic remove with an undo window before the DELETE.
  function removeCourse(c: Course) {
    setCats((prev) => prev.map((cat) => ({ ...cat, courses: cat.courses.filter((x) => x.id !== c.id) })));
    showUndo(t('courseDeleted'), {
      onUndo: () => void load(),
      onCommit: async () => {
        const token = tokenStore.get();
        if (!token) return;
        await apiFetch(`/content/courses/${c.id}`, { method: 'DELETE', token, locale }).catch(() => undefined);
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
        <SortableContext items={cat.courses.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          <ul className="course-list">
            {cat.courses.map((c) => (
              <SortableCourse
                key={c.id}
                c={c}
                canAuthor={canAuthor}
                isStudent={isStudent}
                pct={progress[c.id]}
                isActive={c.id === activeId}
                onToggle={() => togglePublish(c)}
                onRename={() => setRenaming({ id: c.id, title: c.title })}
                onDelete={() => removeCourse(c)}
                onAccess={() => void openAccess(c)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    ) : (
      <ul className="course-list">
        {cat.courses.map((c) => (
          <li key={c.id} className="course-row">
            <CourseCardBody
              c={c}
              canAuthor={canAuthor}
              isStudent={isStudent}
              pct={progress[c.id]}
              isActive={c.id === activeId}
              onToggle={() => togglePublish(c)}
              onRename={() => setRenaming({ id: c.id, title: c.title })}
              onDelete={() => removeCourse(c)}
              onAccess={() => void openAccess(c)}
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
        primary={canAuthor ? { label: t('newCourse'), onClick: () => router.push('/courses/new') } : undefined}
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

      {cats.length === 0 ? (
        <EmptyState
          title={t('empty')}
          action={canAuthor ? { label: t('newCourse'), href: '/courses/new' } : undefined}
        />
      ) : shownCats.length === 0 ? (
        <p className="note">{tc('noResults')}</p>
      ) : dnd ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onCategoryDragEnd}>
          <SortableContext items={shownCats.map((c) => c.id)} strategy={rectSortingStrategy}>
            <div className="course-cats">
              {shownCats.map((cat) => (
                <SortableCategory key={cat.id} cat={cat} render={catBlock} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="course-cats">
          {shownCats.map((cat) => (
            <div key={cat.id}>{catBlock(cat)}</div>
          ))}
        </div>
      )}

      {renaming && (
        <div className="modal-overlay" onMouseDown={() => setRenaming(null)}>
          <form
            className="card rename-modal"
            onMouseDown={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              void saveRename();
            }}
          >
            <strong>{t('rename')}</strong>
            <input
              autoFocus
              value={renaming.title}
              onChange={(e) => setRenaming({ ...renaming, title: e.target.value })}
            />
            <div className="row-actions">
              <button type="button" className="ghost" onClick={() => setRenaming(null)}>
                {t('cancel')}
              </button>
              <button type="submit" disabled={!renaming.title.trim()}>
                {t('save')}
              </button>
            </div>
          </form>
        </div>
      )}

      {access && (
        <div className="modal-overlay" onMouseDown={() => setAccess(null)}>
          <form
            className="card rename-modal"
            onMouseDown={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              void saveAccess();
            }}
          >
            <strong>{t('manageAccess')}</strong>
            <p className="muted">{t('manageAccessHint')}</p>
            {access.students.length === 0 ? (
              <p className="note">{t('noStudents')}</p>
            ) : (
              <div className="access-list">
                {access.students.map((s) => (
                  <label key={s.studentProfileId} className="check">
                    <input
                      type="checkbox"
                      checked={!!access.picked[s.studentProfileId]}
                      onChange={(e) =>
                        setAccess({
                          ...access,
                          picked: { ...access.picked, [s.studentProfileId]: e.target.checked }
                        })
                      }
                    />
                    {s.name}
                  </label>
                ))}
              </div>
            )}
            <div className="row-actions">
              <button type="button" className="ghost" onClick={() => setAccess(null)}>
                {t('cancel')}
              </button>
              <button type="submit" disabled={accessBusy}>
                {t('save')}
              </button>
            </div>
          </form>
        </div>
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
